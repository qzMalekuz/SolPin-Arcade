import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@solpin_leaderboard_v1';
const MAX_ENTRIES = 100;

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
    load: () => Promise<void>;
    submit: (entry: Omit<LeaderboardEntry, 'id' | 'timestamp'>) => Promise<void>;
}

const save = async (entries: LeaderboardEntry[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

export const useLeaderboardStore = create<LeaderboardState>((set, get) => ({
    entries: [],
    lastUpdated: 0,
    isLoading: false,

    load: async () => {
        set({ isLoading: true });
        try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            const entries: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
            set({ entries, lastUpdated: Date.now(), isLoading: false });
        } catch {
            set({ isLoading: false });
        }
    },

    submit: async (entry) => {
        const newEntry: LeaderboardEntry = {
            ...entry,
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
        };

        const current = get().entries;
        const updated = [newEntry, ...current]
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_ENTRIES);

        set({ entries: updated, lastUpdated: Date.now() });
        await save(updated);
    },
}));
