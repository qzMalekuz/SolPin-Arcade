// ===================================================================
// Pure TypeScript 2D physics engine for the pinball game.
// No native dependencies — runs in Expo Go via JS thread.
// ===================================================================

import { Difficulty } from '../theme';

// ----- Vector Math -----

export interface Vec2 {
    x: number;
    y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({
    x: a.x + b.x,
    y: a.y + b.y,
});

export const sub = (a: Vec2, b: Vec2): Vec2 => ({
    x: a.x - b.x,
    y: a.y - b.y,
});

export const scale = (v: Vec2, s: number): Vec2 => ({
    x: v.x * s,
    y: v.y * s,
});

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const length = (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y);

export const normalise = (v: Vec2): Vec2 => {
    const len = length(v);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
};

export const reflect = (v: Vec2, normal: Vec2): Vec2 => {
    const d = dot(v, normal);
    return sub(v, scale(normal, 2 * d));
};

export const dist = (a: Vec2, b: Vec2): number => length(sub(a, b));

export const rotate = (v: Vec2, angle: number): Vec2 => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos,
    };
};

// ----- Physics Constants (difficulty-scaled) -----

export interface PhysicsConfig {
    gravity: number;
    ballRadius: number;
    flipperStrength: number;
    wallRestitution: number;
    bumperRestitution: number;
    maxBallSpeed: number;
    friction: number;
}

export const getPhysicsConfig = (difficulty: Difficulty): PhysicsConfig => {
    switch (difficulty) {
        case 'easy':
            return {
                gravity: 800,
                ballRadius: 14,
                flipperStrength: 1400,
                wallRestitution: 0.6,
                bumperRestitution: 1.2,
                maxBallSpeed: 1800,
                friction: 0.998,
            };
        case 'medium':
            return {
                gravity: 1100,
                ballRadius: 14,
                flipperStrength: 1300,
                wallRestitution: 0.55,
                bumperRestitution: 1.1,
                maxBallSpeed: 2000,
                friction: 0.997,
            };
        case 'hard':
            return {
                gravity: 1400,
                ballRadius: 14,
                flipperStrength: 1100,
                wallRestitution: 0.5,
                bumperRestitution: 1.0,
                maxBallSpeed: 2200,
                friction: 0.996,
            };
    }
};

// ----- Collision objects -----

export interface Circle {
    pos: Vec2;
    radius: number;
}

export interface LineSegment {
    p1: Vec2;
    p2: Vec2;
}

/**
 * Ball-circle collision (ball vs bumper or round obstacle).
 * Returns the new velocity after bounce, or null if no collision.
 */
export const collideCircles = (
    ballPos: Vec2,
    ballVel: Vec2,
    ballRadius: number,
    obstacle: Circle,
    restitution: number,
): { vel: Vec2; normal: Vec2 } | null => {
    const delta = sub(ballPos, obstacle.pos);
    const distance = length(delta);
    const minDist = ballRadius + obstacle.radius;

    if (distance >= minDist || distance === 0) return null;

    const normal = normalise(delta);
    const relVel = dot(ballVel, normal);

    // Only resolve if moving toward the obstacle
    if (relVel > 0) return null;

    const newVel = add(ballVel, scale(normal, -relVel * (1 + restitution)));
    return { vel: newVel, normal };
};

/**
 * Ball-line segment collision.
 * Returns the new velocity after bounce, or null if no collision.
 */
export const collideLineSegment = (
    ballPos: Vec2,
    ballVel: Vec2,
    ballRadius: number,
    seg: LineSegment,
    restitution: number,
): { vel: Vec2; contactPoint: Vec2; normal: Vec2 } | null => {
    const edge = sub(seg.p2, seg.p1);
    const edgeLen = length(edge);
    if (edgeLen === 0) return null;

    const edgeNorm = normalise(edge);
    const toBall = sub(ballPos, seg.p1);
    const proj = dot(toBall, edgeNorm);

    // Clamp projection to segment
    const t = Math.max(0, Math.min(edgeLen, proj));
    const closestPoint: Vec2 = add(seg.p1, scale(edgeNorm, t));
    const delta = sub(ballPos, closestPoint);
    const distance = length(delta);

    if (distance >= ballRadius || distance === 0) return null;

    const normal = normalise(delta);
    const relVel = dot(ballVel, normal);

    if (relVel > 0) return null;

    const newVel = add(ballVel, scale(normal, -relVel * (1 + restitution)));
    return { vel: newVel, contactPoint: closestPoint, normal };
};

/**
 * Separate overlapping ball from obstacle.
 */
export const separateBallFromCircle = (
    ballPos: Vec2,
    ballRadius: number,
    obstacle: Circle,
): Vec2 => {
    const delta = sub(ballPos, obstacle.pos);
    const distance = length(delta);
    const minDist = ballRadius + obstacle.radius;

    if (distance >= minDist || distance === 0) return ballPos;

    const normal = normalise(delta);
    return add(obstacle.pos, scale(normal, minDist + 0.5));
};

/**
 * Separate overlapping ball from line segment.
 */
export const separateBallFromLine = (
    ballPos: Vec2,
    ballRadius: number,
    seg: LineSegment,
): Vec2 => {
    const edge = sub(seg.p2, seg.p1);
    const edgeLen = length(edge);
    if (edgeLen === 0) return ballPos;

    const edgeNorm = normalise(edge);
    const toBall = sub(ballPos, seg.p1);
    const proj = Math.max(0, Math.min(edgeLen, dot(toBall, edgeNorm)));
    const closestPoint = add(seg.p1, scale(edgeNorm, proj));
    const delta = sub(ballPos, closestPoint);
    const distance = length(delta);

    if (distance >= ballRadius || distance === 0) return ballPos;

    const normal = normalise(delta);
    return add(closestPoint, scale(normal, ballRadius + 0.5));
};

/**
 * Clamp ball speed to maxBallSpeed.
 */
export const clampSpeed = (vel: Vec2, maxSpeed: number): Vec2 => {
    const speed = length(vel);
    if (speed > maxSpeed) {
        return scale(normalise(vel), maxSpeed);
    }
    return vel;
};
