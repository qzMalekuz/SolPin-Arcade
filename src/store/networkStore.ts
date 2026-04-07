import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Cluster } from '@solana/web3.js';

const NETWORK_STORAGE_KEY = 'solana-network-cluster';

export type SupportedSolanaCluster = Extract<Cluster, 'mainnet-beta' | 'devnet'>;

type NetworkState = {
    cluster: SupportedSolanaCluster;
    hydrated: boolean;
    hydrate: () => Promise<void>;
    setCluster: (cluster: SupportedSolanaCluster) => Promise<void>;
};

export const getSolanaNetworkLabel = (
    cluster: SupportedSolanaCluster,
): 'Mainnet' | 'Devnet' => (cluster === 'devnet' ? 'Devnet' : 'Mainnet');

export const useNetworkStore = create<NetworkState>((set) => ({
    cluster: 'devnet',
    hydrated: false,

    hydrate: async () => {
        try {
            const stored = await AsyncStorage.getItem(NETWORK_STORAGE_KEY);
            if (stored === 'devnet' || stored === 'mainnet-beta') {
                set({ cluster: stored, hydrated: true });
                return;
            }
        } catch {
            // Fall back to the default test cluster if persistence is unavailable.
        }

        set({ hydrated: true });
    },

    setCluster: async (cluster) => {
        set({ cluster });
        try {
            await AsyncStorage.setItem(NETWORK_STORAGE_KEY, cluster);
        } catch {
            // Keep the in-memory selection even if persistence fails.
        }
    },
}));
