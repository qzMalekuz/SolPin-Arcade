// ===================================================================
// Table layout — defines all geometry for the pinball table.
// Coordinate space:  0,0 = top-left   TABLE_W x TABLE_H
// Designed for 1080×2400 but rendered via scale factor.
// ===================================================================

import { Vec2, vec2, LineSegment, Circle } from './physics';

// ----- Dimensions -----

export const TABLE_W = 400;  // logical width
export const TABLE_H = 780;  // logical height

// ----- Ball spawn -----

export const BALL_SPAWN: Vec2 = vec2(TABLE_W - 30, TABLE_H - 200);
export const BALL_LAUNCH_VEL: Vec2 = vec2(-50, -1200);

// ----- Drain zone (ball loss) -----
// Ball is "drained" if its Y coordinate exceeds this.
export const DRAIN_Y = TABLE_H - 10;

// ----- Walls -----

export const WALLS: LineSegment[] = [
    // Left wall
    { p1: vec2(20, 0), p2: vec2(20, TABLE_H - 120) },
    // Right wall
    { p1: vec2(TABLE_W - 20, 0), p2: vec2(TABLE_W - 20, TABLE_H - 120) },
    // Top wall
    { p1: vec2(20, 20), p2: vec2(TABLE_W - 20, 20) },

    // Left gutter guide (angled)
    { p1: vec2(20, TABLE_H - 120), p2: vec2(100, TABLE_H - 50) },
    // Right gutter guide (angled)
    { p1: vec2(TABLE_W - 20, TABLE_H - 120), p2: vec2(TABLE_W - 100, TABLE_H - 50) },

    // Left slingshot wall
    { p1: vec2(60, TABLE_H - 250), p2: vec2(45, TABLE_H - 170) },
    // Right slingshot wall
    { p1: vec2(TABLE_W - 60, TABLE_H - 250), p2: vec2(TABLE_W - 45, TABLE_H - 170) },

    // Launch lane right wall
    { p1: vec2(TABLE_W - 10, 50), p2: vec2(TABLE_W - 10, TABLE_H - 50) },

    // Top arch left
    { p1: vec2(60, 60), p2: vec2(100, 30) },
    // Top arch right
    { p1: vec2(TABLE_W - 100, 30), p2: vec2(TABLE_W - 60, 60) },
];

// ----- Bumpers (circular obstacles) -----

export interface Bumper extends Circle {
    id: string;
    points: number;
    color: string;
}

export const BUMPERS: Bumper[] = [
    // Top cluster — 3 large bumpers
    {
        id: 'b1',
        pos: vec2(TABLE_W / 2, 180),
        radius: 30,
        points: 250,
        color: '#ff2aff', // neon pink
    },
    {
        id: 'b2',
        pos: vec2(TABLE_W / 2 - 70, 240),
        radius: 28,
        points: 250,
        color: '#00d4ff', // neon blue
    },
    {
        id: 'b3',
        pos: vec2(TABLE_W / 2 + 70, 240),
        radius: 28,
        points: 250,
        color: '#b44aff', // neon purple
    },

    // Mid bumpers
    {
        id: 'b4',
        pos: vec2(100, 400),
        radius: 22,
        points: 100,
        color: '#00ff88', // neon green
    },
    {
        id: 'b5',
        pos: vec2(TABLE_W - 100, 400),
        radius: 22,
        points: 100,
        color: '#00ff88',
    },
    {
        id: 'b6',
        pos: vec2(TABLE_W / 2, 350),
        radius: 18,
        points: 500,
        color: '#ffe14d', // neon yellow — high value!
    },

    // Lower bumpers
    {
        id: 'b7',
        pos: vec2(140, 540),
        radius: 16,
        points: 100,
        color: '#ff6b35', // neon orange
    },
    {
        id: 'b8',
        pos: vec2(TABLE_W - 140, 540),
        radius: 16,
        points: 100,
        color: '#ff6b35',
    },
];

// ----- Flippers -----

export interface FlipperDef {
    pivot: Vec2;
    length: number;
    restAngle: number;   // radians — resting (down) angle
    activeAngle: number;  // radians — flipped (up) angle
    side: 'left' | 'right';
}

export const FLIPPERS: FlipperDef[] = [
    {
        pivot: vec2(120, TABLE_H - 60),
        length: 70,
        restAngle: Math.PI * 0.18,       // slightly down
        activeAngle: -Math.PI * 0.35,     // up
        side: 'left',
    },
    {
        pivot: vec2(TABLE_W - 120, TABLE_H - 60),
        length: 70,
        restAngle: Math.PI - Math.PI * 0.18,  // mirrored
        activeAngle: Math.PI + Math.PI * 0.35, // mirrored up
        side: 'right',
    },
];

// ----- Lanes (bonus score zones — line triggers) -----

export interface Lane {
    id: string;
    p1: Vec2;
    p2: Vec2;
    points: number;
}

export const LANES: Lane[] = [
    {
        id: 'lane_top_left',
        p1: vec2(50, 100),
        p2: vec2(50, 160),
        points: 150,
    },
    {
        id: 'lane_top_right',
        p1: vec2(TABLE_W - 50, 100),
        p2: vec2(TABLE_W - 50, 160),
        points: 150,
    },
];
