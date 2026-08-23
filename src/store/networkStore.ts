import { create } from 'zustand';

/**
 * Single source of truth for network bifurcation.
 *
 * __DEV__ is set by the React Native bundler itself:
 *   - true  in development builds (`npx expo run:android` / `run:ios`)
 *   - false in release builds (dApp Store / production)
 *
 * So dev builds are ALWAYS devnet (fake SOL, test backend) and release
 * builds are ALWAYS mainnet (real SOL, production backend). There is no
 * runtime switch — a production user can never reach devnet.
 */
export const IS_DEVNET = __DEV__;

export type SupportedSolanaCluster = 'mainnet-beta' | 'devnet';

export const getSolanaNetworkLabel = (): 'Mainnet' | 'Devnet' =>
    IS_DEVNET ? 'Devnet' : 'Mainnet';

type NetworkState = {
    cluster: SupportedSolanaCluster;
    hydrated: boolean;
    hydrate: () => Promise<void>;
};

export const useNetworkStore = create<NetworkState>((set) => ({
    cluster: IS_DEVNET ? 'devnet' : 'mainnet-beta',
    hydrated: false,

    hydrate: async () => {
        set({ hydrated: true });
    },
}));
