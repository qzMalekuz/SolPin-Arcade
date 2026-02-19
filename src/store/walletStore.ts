import { create } from 'zustand';
import { PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { DEVNET_RPC } from '../solana/connection';

export interface WalletState {
    publicKey: PublicKey | null;
    connected: boolean;
    balance: number;
    session: string | null;

    setPublicKey: (key: PublicKey | null) => void;
    setConnected: (value: boolean) => void;
    setBalance: (value: number) => void;
    setSession: (session: string | null) => void;
    disconnect: () => void;
    refreshBalance: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
    publicKey: null,
    connected: false,
    balance: 0,
    session: null,

    setPublicKey: (key) => set({ publicKey: key }),
    setConnected: (value) => set({ connected: value }),
    setBalance: (value) => set({ balance: value }),
    setSession: (session) => set({ session }),

    disconnect: () =>
        set({
            publicKey: null,
            connected: false,
            balance: 0,
            session: null,
        }),

    refreshBalance: async () => {
        const { publicKey } = get();
        if (!publicKey) return;
        try {
            const connection = new Connection(DEVNET_RPC, 'confirmed');
            const lamports = await connection.getBalance(publicKey);
            set({ balance: lamports / LAMPORTS_PER_SOL });
        } catch (err) {
            console.warn('Failed to refresh balance:', err);
        }
    },
}));
