import { create } from 'zustand';

export type SupportedSolanaCluster = 'mainnet-beta';

export const getSolanaNetworkLabel = (): 'Mainnet' => 'Mainnet';

type NetworkState = {
    cluster: SupportedSolanaCluster;
    hydrated: boolean;
    hydrate: () => Promise<void>;
};

export const useNetworkStore = create<NetworkState>((set) => ({
    cluster: 'mainnet-beta',
    hydrated: false,

    hydrate: async () => {
        set({ hydrated: true });
    },
}));
