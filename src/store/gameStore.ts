import { create } from 'zustand';
import { Difficulty, Duration, MULTIPLIER_TABLE } from '../theme';

export type GameStatus = 'idle' | 'staking' | 'playing' | 'paused' | 'won' | 'lost';

export interface GameState {
    // Setup
    stakeAmount: number;
    duration: Duration;
    difficulty: Difficulty;
    multiplier: number;

    // In-game
    status: GameStatus;
    score: number;
    timeRemaining: number;
    comboCount: number;
    comboMultiplier: number;

    // Result
    rewardAmount: number;
    roundId: string | null;

    // Sound
    soundEnabled: boolean;

    // Actions
    setStakeAmount: (amount: number) => void;
    setDuration: (duration: Duration) => void;
    setDifficulty: (difficulty: Difficulty) => void;
    setStatus: (status: GameStatus) => void;
    setScore: (score: number) => void;
    addScore: (points: number) => void;
    setTimeRemaining: (time: number) => void;
    setCombo: (count: number, multiplier: number) => void;
    resetCombo: () => void;
    incrementCombo: () => void;
    setRewardAmount: (amount: number) => void;
    setRoundId: (roundId: string | null) => void;
    toggleSound: () => void;
    resetGame: () => void;
}

const calculateMultiplier = (duration: Duration, difficulty: Difficulty): number => {
    return MULTIPLIER_TABLE[duration][difficulty];
};

export const useGameStore = create<GameState>((set, get) => ({
    stakeAmount: 0.01,
    duration: 30,
    difficulty: 'easy',
    multiplier: MULTIPLIER_TABLE[30].easy,

    status: 'idle',
    score: 0,
    timeRemaining: 30,
    comboCount: 0,
    comboMultiplier: 1,

    rewardAmount: 0,
    roundId: null,

    soundEnabled: true,

    setStakeAmount: (amount) => set({ stakeAmount: amount }),
    setDuration: (duration) =>
        set({
            duration,
            timeRemaining: duration,
            multiplier: calculateMultiplier(duration, get().difficulty),
        }),
    setDifficulty: (difficulty) =>
        set({
            difficulty,
            multiplier: calculateMultiplier(get().duration, difficulty),
        }),
    setStatus: (status) => set({ status }),
    setScore: (score) => set({ score }),
    addScore: (points) =>
        set((s) => ({ score: s.score + Math.round(points * s.comboMultiplier) })),
    setTimeRemaining: (time) => set({ timeRemaining: time }),
    setCombo: (count, multiplier) =>
        set({ comboCount: count, comboMultiplier: multiplier }),
    resetCombo: () => set({ comboCount: 0, comboMultiplier: 1 }),
    incrementCombo: () =>
        set((s) => {
            const newCount = s.comboCount + 1;
            const newMultiplier = Math.min(1 + newCount * 0.2, 5); // Max 5x combo
            return { comboCount: newCount, comboMultiplier: newMultiplier };
        }),
    setRewardAmount: (amount) => set({ rewardAmount: amount }),
    setRoundId: (roundId) => set({ roundId }),
    toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
    resetGame: () =>
        set((s) => ({
            status: 'idle',
            score: 0,
            timeRemaining: s.duration,
            comboCount: 0,
            comboMultiplier: 1,
            rewardAmount: 0,
            roundId: null,
        })),
}));
