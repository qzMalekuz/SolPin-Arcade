// ===================================================================
// Game engine: main loop, state management, physics stepping.
// Runs via requestAnimationFrame for 60fps on JS thread.
// ===================================================================

import {
    Vec2,
    vec2,
    add,
    sub,
    scale,
    length,
    normalise,
    clampSpeed,
    getPhysicsConfig,
    PhysicsConfig,
    collideCircles,
    collideLineSegment,
    separateBallFromCircle,
    separateBallFromLine,
    rotate,
    dot,
    LineSegment,
} from './physics';
import {
    TABLE_W,
    TABLE_H,
    BALL_SPAWN,
    BALL_LAUNCH_VEL,
    DRAIN_Y,
    WALLS,
    BUMPERS,
    FLIPPERS,
    FlipperDef,
    LANES,
} from './table';
import {
    SCORE_VALUES,
    calculatePoints,
    getComboMultiplier,
} from './scoring';
import { Difficulty } from '../theme';

// ----- Engine State -----

export interface BallState {
    pos: Vec2;
    vel: Vec2;
    active: boolean;
}

export interface FlipperState {
    angle: number;
    active: boolean;
    def: FlipperDef;
}

export interface EngineState {
    ball: BallState;
    flippers: FlipperState[];
    score: number;
    comboCount: number;
    comboMultiplier: number;
    comboTimer: number;      // ms since last hit
    timeRemaining: number;   // seconds
    status: 'idle' | 'playing' | 'paused' | 'won' | 'lost';
    activeBumpers: Set<string>;  // bumper IDs currently "lit"
    difficulty: Difficulty;
    config: PhysicsConfig;
}

export type EngineCallback = (state: EngineState) => void;

const COMBO_DECAY_MS = 1500; // combo resets after 1.5s of no hits
const FLIPPER_SPEED = 15;    // radians/sec

export class PinballEngine {
    state: EngineState;
    private rafId: number | null = null;
    private lastTime: number = 0;
    private totalDuration: number;
    private onUpdate: EngineCallback | null = null;
    private onDrain: (() => void) | null = null;
    private onWin: (() => void) | null = null;
    private onBumperHit: ((id: string, points: number) => void) | null = null;

    constructor(
        difficulty: Difficulty,
        duration: number,
    ) {
        const config = getPhysicsConfig(difficulty);

        this.totalDuration = duration;

        this.state = {
            ball: {
                pos: { ...BALL_SPAWN },
                vel: { ...BALL_LAUNCH_VEL },
                active: true,
            },
            flippers: FLIPPERS.map((def) => ({
                angle: def.restAngle,
                active: false,
                def,
            })),
            score: 0,
            comboCount: 0,
            comboMultiplier: 1,
            comboTimer: 0,
            timeRemaining: duration,
            status: 'idle',
            activeBumpers: new Set(),
            difficulty,
            config,
        };
    }

    // ----- Lifecycle -----

    onStateUpdate(cb: EngineCallback) {
        this.onUpdate = cb;
    }

    onBallDrain(cb: () => void) {
        this.onDrain = cb;
    }

    onTimerEnd(cb: () => void) {
        this.onWin = cb;
    }

    onBumperCollision(cb: (id: string, points: number) => void) {
        this.onBumperHit = cb;
    }

    start() {
        this.state.status = 'playing';
        this.state.ball = {
            pos: { ...BALL_SPAWN },
            vel: { ...BALL_LAUNCH_VEL },
            active: true,
        };
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    pause() {
        this.state.status = 'paused';
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    resume() {
        if (this.state.status !== 'paused') return;
        this.state.status = 'playing';
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    stop() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.state.status = 'idle';
    }

    setFlipperActive(side: 'left' | 'right', active: boolean) {
        this.state.flippers.forEach((f) => {
            if (f.def.side === side) {
                f.active = active;
            }
        });
    }

    // ----- Main Loop -----

    private loop = (now: number) => {
        if (this.state.status !== 'playing') return;

        const dt = Math.min((now - this.lastTime) / 1000, 0.033); // cap at ~30fps min
        this.lastTime = now;

        this.step(dt);

        this.onUpdate?.(this.state);

        this.rafId = requestAnimationFrame(this.loop);
    };

    // ----- Physics Step -----

    private step(dt: number) {
        const { ball, config, flippers } = this.state;

        if (!ball.active) return;

        // 1. Apply gravity
        ball.vel = add(ball.vel, vec2(0, config.gravity * dt));

        // 2. Apply friction
        ball.vel = scale(ball.vel, config.friction);

        // 3. Clamp speed
        ball.vel = clampSpeed(ball.vel, config.maxBallSpeed);

        // 4. Update position
        ball.pos = add(ball.pos, scale(ball.vel, dt));

        // 5. Update flippers
        this.updateFlippers(dt);

        // 6. Collide with walls
        for (const wall of WALLS) {
            const result = collideLineSegment(
                ball.pos,
                ball.vel,
                config.ballRadius,
                wall,
                config.wallRestitution,
            );
            if (result) {
                ball.vel = result.vel;
                ball.pos = separateBallFromLine(ball.pos, config.ballRadius, wall);
                this.registerHit('wall_bounce', SCORE_VALUES.wall_bounce);
            }
        }

        // 7. Collide with bumpers
        for (const bumper of BUMPERS) {
            const result = collideCircles(
                ball.pos,
                ball.vel,
                config.ballRadius,
                bumper,
                config.bumperRestitution,
            );
            if (result) {
                ball.vel = result.vel;
                ball.pos = separateBallFromCircle(ball.pos, config.ballRadius, bumper);
                this.registerHit(bumper.id, bumper.points);
                this.state.activeBumpers.add(bumper.id);
                this.onBumperHit?.(bumper.id, bumper.points);

                // Clear bumper glow after 150ms
                setTimeout(() => {
                    this.state.activeBumpers.delete(bumper.id);
                }, 150);
            }
        }

        // 8. Collide with flippers
        for (const flipper of flippers) {
            const tipPos = this.getFlipperTip(flipper);
            const seg: LineSegment = { p1: flipper.def.pivot, p2: tipPos };
            const result = collideLineSegment(
                ball.pos,
                ball.vel,
                config.ballRadius,
                seg,
                flipper.active ? 0.95 : config.wallRestitution,
            );
            if (result) {
                ball.vel = result.vel;
                ball.pos = separateBallFromLine(ball.pos, config.ballRadius, seg);

                // If flipper is actively swinging upward, add extra velocity
                if (flipper.active) {
                    const flipImpulse = flipper.def.side === 'left'
                        ? vec2(config.flipperStrength * 0.4, -config.flipperStrength)
                        : vec2(-config.flipperStrength * 0.4, -config.flipperStrength);
                    ball.vel = add(ball.vel, scale(flipImpulse, dt * 3));
                    ball.vel = clampSpeed(ball.vel, config.maxBallSpeed);
                }

                this.registerHit('flipper_hit', SCORE_VALUES.flipper_hit);
            }
        }

        // 9. Boundary clamp (keep ball in table)
        if (ball.pos.x - config.ballRadius < 15) {
            ball.pos.x = 15 + config.ballRadius;
            ball.vel.x = Math.abs(ball.vel.x) * config.wallRestitution;
        }
        if (ball.pos.x + config.ballRadius > TABLE_W - 10) {
            ball.pos.x = TABLE_W - 10 - config.ballRadius;
            ball.vel.x = -Math.abs(ball.vel.x) * config.wallRestitution;
        }
        if (ball.pos.y - config.ballRadius < 15) {
            ball.pos.y = 15 + config.ballRadius;
            ball.vel.y = Math.abs(ball.vel.y) * config.wallRestitution;
        }

        // 10. Check drain
        if (ball.pos.y > DRAIN_Y) {
            ball.active = false;
            this.state.status = 'lost';
            this.onDrain?.();
            this.stop();
            return;
        }

        // 11. Update timer
        this.state.timeRemaining -= dt;
        if (this.state.timeRemaining <= 0) {
            this.state.timeRemaining = 0;
            this.state.status = 'won';
            this.onWin?.();
            this.stop();
            return;
        }

        // 12. Combo decay
        this.state.comboTimer += dt * 1000;
        if (this.state.comboTimer > COMBO_DECAY_MS && this.state.comboCount > 0) {
            this.state.comboCount = 0;
            this.state.comboMultiplier = 1;
        }

        // 13. Survival score
        this.state.score += Math.round(SCORE_VALUES.survival_tick * dt);
    }

    // ----- Flipper helpers -----

    private updateFlippers(dt: number) {
        for (const flipper of this.state.flippers) {
            const target = flipper.active
                ? flipper.def.activeAngle
                : flipper.def.restAngle;

            const diff = target - flipper.angle;
            const maxMove = FLIPPER_SPEED * dt;

            if (Math.abs(diff) < maxMove) {
                flipper.angle = target;
            } else {
                flipper.angle += Math.sign(diff) * maxMove;
            }
        }
    }

    private getFlipperTip(flipper: FlipperState): Vec2 {
        const dir = rotate(vec2(flipper.def.length, 0), flipper.angle);
        return add(flipper.def.pivot, dir);
    }

    // ----- Scoring -----

    private registerHit(type: string, basePoints: number) {
        this.state.comboCount++;
        this.state.comboMultiplier = getComboMultiplier(this.state.comboCount);
        this.state.comboTimer = 0;

        const points = calculatePoints(
            basePoints,
            this.state.comboMultiplier,
            this.state.difficulty,
        );
        this.state.score += points;
    }

    // ----- Public getters -----

    getFlipperTipPosition(index: number): Vec2 {
        return this.getFlipperTip(this.state.flippers[index]);
    }

    getBallPos(): Vec2 {
        return this.state.ball.pos;
    }

    getTimeFormatted(): string {
        const t = Math.max(0, Math.ceil(this.state.timeRemaining));
        const mins = Math.floor(t / 60);
        const secs = t % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}
