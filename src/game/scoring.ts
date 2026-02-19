// ===================================================================
// Scoring system: bumper values, combo chain, multiplier calculation
// ===================================================================

import { Difficulty } from '../theme';

export interface ScoreEvent {
    type: 'bumper' | 'flipper' | 'wall' | 'lane';
    basePoints: number;
}

/** Base point values for different table elements */
export const SCORE_VALUES: Record<string, number> = {
    bumper_small: 100,
    bumper_large: 250,
    bumper_top: 500,
    flipper_hit: 25,
    wall_bounce: 10,
    lane_pass: 150,
    survival_tick: 5, // per second survived
};

/** Difficulty bonus multiplier for scoring */
const DIFFICULTY_SCORE_MULT: Record<Difficulty, number> = {
    easy: 1.0,
    medium: 1.5,
    hard: 2.0,
};

/**
 * Calculate points for a hit event, factoring in combo and difficulty.
 */
export const calculatePoints = (
    basePoints: number,
    comboMultiplier: number,
    difficulty: Difficulty,
): number => {
    return Math.round(
        basePoints * comboMultiplier * DIFFICULTY_SCORE_MULT[difficulty],
    );
};

/**
 * Get the combo multiplier from current combo count.
 * Combos decay after a timeout (handled in engine).
 */
export const getComboMultiplier = (comboCount: number): number => {
    if (comboCount <= 0) return 1;
    if (comboCount <= 3) return 1 + comboCount * 0.2;
    if (comboCount <= 6) return 1.6 + (comboCount - 3) * 0.3;
    return Math.min(1 + comboCount * 0.4, 5.0); // Cap at 5x
};

/**
 * Format score with commas for display.
 */
export const formatScore = (score: number): string => {
    return score.toLocaleString();
};
