import { create } from 'zustand';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
    getConnection,
    getSolanaNetwork,
    type WalletNetwork,
} from '../solana/connection';

export type WalletProvider = 'mwa' | 'phantom' | null;
export type WalletConnectionStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'disconnecting'
    | 'error';

export interface ConnectedWalletPayload {
    publicKey: PublicKey;
    session: string;
    authToken?: string | null;
    walletName?: string | null;
    walletProvider: Exclude<WalletProvider, null>;
}

export interface WalletState {
    publicKey: PublicKey | null;
    connected: boolean;
    balance: number;
    session: string | null;
    network: WalletNetwork;
    walletProvider: WalletProvider;
    connectionStatus: WalletConnectionStatus;
    lastError: string | null;

    // MWA 2.0 fields
    authToken: string | null;
    walletName: string | null;

    setPublicKey: (key: PublicKey | null) => void;
    setConnected: (value: boolean) => void;
    setBalance: (value: number) => void;
    setSession: (session: string | null) => void;
    setAuthToken: (token: string | null) => void;
    setWalletName: (name: string | null) => void;
    setLastError: (message: string | null) => void;
    beginConnection: () => void;
    completeConnection: (payload: ConnectedWalletPayload) => void;
    failConnection: (message: string) => void;
    beginDisconnect: () => void;
    disconnect: () => void;
    refreshBalance: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
    publicKey: null,
    connected: false,
    balance: 0,
    session: null,
    network: getSolanaNetwork(),
    walletProvider: null,
    connectionStatus: 'idle',
    lastError: null,
    authToken: null,
    walletName: null,

    setPublicKey: (key) => set({ publicKey: key }),
    setConnected: (value) => set({ connected: value }),
    setBalance: (value) => set({ balance: value }),
    setSession: (session) => set({ session }),
    setAuthToken: (token) => set({ authToken: token }),
    setWalletName: (name) => set({ walletName: name }),
    setLastError: (message) => set({ lastError: message }),

    beginConnection: () =>
        set({
            connectionStatus: 'connecting',
            lastError: null,
        }),

    completeConnection: ({ publicKey, session, authToken, walletName, walletProvider }) =>
        set({
            publicKey,
            session,
            authToken: authToken ?? null,
            walletName: walletName ?? null,
            walletProvider,
            connected: true,
            connectionStatus: 'connected',
            lastError: null,
        }),

    failConnection: (message) =>
        set((state) => ({
            connectionStatus: 'error',
            lastError: message,
            connected: state.publicKey !== null,
        })),

    beginDisconnect: () =>
        set({
            connectionStatus: 'disconnecting',
            lastError: null,
        }),

    disconnect: () =>
        set({
            publicKey: null,
            connected: false,
            balance: 0,
            session: null,
            walletProvider: null,
            connectionStatus: 'idle',
            lastError: null,
            authToken: null,
            walletName: null,
        }),

    refreshBalance: async () => {
        const { publicKey, network } = get();
        if (!publicKey) return;

        try {
            const connection = getConnection(network);
            const lamports = await connection.getBalance(publicKey);
            set({ balance: lamports / LAMPORTS_PER_SOL });
        } catch {
            set({ balance: 0 });
        }
    },
}));
