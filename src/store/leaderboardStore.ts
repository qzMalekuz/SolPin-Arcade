import { create } from 'zustand';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { apiLeaderboard } from '../api/backend';
import { truncateAddress } from '../solana/phantom';

const LAMPORTS = LAMPORTS_PER_SOL;

export interface LeaderboardEntry {
    id: string;
    wallet: string;
    score: number;
    duration: number;
    difficulty: string;
    reward: number;
    timestamp: number;
}

interface LeaderboardState {
    entries: LeaderboardEntry[];
    lastUpdated: number;
    isLoading: boolean;
    loadFailed: boolean;
    load: () => Promise<void>;
}

// Entries are written server-side when a round is won — the client only reads.
export const useLeaderboardStore = create<LeaderboardState>((set, get) => ({
    entries: [],
    lastUpdated: 0,
    isLoading: false,
    loadFailed: false,

    load: async () => {
        if (get().isLoading) return;
        set({ isLoading: true, loadFailed: false });
        try {
            const rows = await apiLeaderboard();
            const entries: LeaderboardEntry[] = rows.map((row, i) => ({
                id: `${row.created_at}_${i}`,
                wallet: truncateAddress(row.wallet, 6),
                score: row.score,
                duration: row.duration_secs,
                difficulty: row.difficulty,
                reward: row.reward_lamports / LAMPORTS,
                timestamp: new Date(row.created_at).getTime(),
            }));
            set({ entries, lastUpdated: Date.now(), isLoading: false });
        } catch {
            set({ isLoading: false, loadFailed: true });
        }
    },
}));
