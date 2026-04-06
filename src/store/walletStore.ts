import { create } from 'zustand';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getConnection } from '../solana/connection';

export type WalletConnectionStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'disconnecting'
    | 'error';

export interface WalletSessionState {
    publicKey: PublicKey | null;
    session: string | null;
    walletName: 'Phantom' | null;
}

interface WalletState extends WalletSessionState {
    connected: boolean;
    balance: number;
    connectionStatus: WalletConnectionStatus;
    lastError: string | null;
    beginConnection: () => void;
    restoreConnection: (payload: WalletSessionState) => void;
    completeConnection: (payload: Required<WalletSessionState>) => void;
    failConnection: (message: string) => void;
    beginDisconnect: () => void;
    disconnect: () => void;
    refreshBalance: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
    publicKey: null,
    session: null,
    walletName: null,
    connected: false,
    balance: 0,
    connectionStatus: 'idle',
    lastError: null,

    beginConnection: () =>
        set({
            connectionStatus: 'connecting',
            lastError: null,
        }),

    restoreConnection: ({ publicKey, session, walletName }) =>
        set({
            publicKey,
            session,
            walletName,
            connected: Boolean(publicKey && session),
            connectionStatus: publicKey && session ? 'connected' : 'idle',
            lastError: null,
        }),

    completeConnection: ({ publicKey, session, walletName }) =>
        set({
            publicKey,
            session,
            walletName,
            connected: true,
            connectionStatus: 'connected',
            lastError: null,
        }),

    failConnection: (message) =>
        set((state) => ({
            connectionStatus: 'error',
            lastError: message,
            connected: Boolean(state.publicKey && state.session),
        })),

    beginDisconnect: () =>
        set({
            connectionStatus: 'disconnecting',
            lastError: null,
        }),

    disconnect: () =>
        set({
            publicKey: null,
            session: null,
            walletName: null,
            connected: false,
            balance: 0,
            connectionStatus: 'idle',
            lastError: null,
        }),

    refreshBalance: async () => {
        const { publicKey } = get();
        if (!publicKey) {
            set({ balance: 0 });
            return;
        }

        try {
            const lamports = await getConnection().getBalance(publicKey, 'confirmed');
            set({ balance: lamports / LAMPORTS_PER_SOL });
        } catch {
            set({ balance: 0 });
        }
    },
}));
