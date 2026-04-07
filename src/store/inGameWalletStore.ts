import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSolPrice } from '../solana/price';

const STORAGE_KEY = 'solpin-igw-v1';
const LAMPORTS = 1_000_000_000;

const genId = (): string =>
    Date.now().toString(36) + Math.random().toString(36).slice(2);

export type TxType = 'TOP_UP' | 'WIN' | 'LOSS' | 'WITHDRAWAL';
export type TxStatus = 'pending' | 'completed' | 'failed';

export interface WalletTx {
    id: string;
    type: TxType;
    amountSol: number;
    amountUsd: number;
    status: TxStatus;
    txHash: string | null;
    timestamp: number;
    note: string;
}

interface Persisted {
    balanceLamports: number;
    transactions: WalletTx[];
    processedTxHashes: string[];
    pendingTopUp: { amountSol: number; amountUsd: number } | null;
}

interface InGameWalletState extends Persisted {
    hydrated: boolean;
    solPrice: number;

    // lifecycle
    hydrate: () => Promise<void>;
    fetchSolPrice: () => Promise<number>;

    // top-up
    setPendingTopUp: (amountSol: number, amountUsd: number) => void;
    clearPendingTopUp: () => void;
    topUp: (amountSol: number, amountUsd: number, txHash: string) => Promise<boolean>;

    // betting (deducts silently — no history entry; outcome recorded by creditWin / recordLoss)
    placeBet: (amountSol: number) => boolean;
    creditWin: (payoutSol: number, stakeAmountSol: number, solPrice: number) => void;
    recordLoss: (stakeSol: number, solPrice: number) => void;

    // withdrawal
    requestWithdrawal: (amountSol: number, amountUsd: number) => boolean;

    // helpers
    getBalanceSol: () => number;
}

const save = async (data: Persisted): Promise<void> => {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* non-fatal */ }
};

export const useInGameWalletStore = create<InGameWalletState>((set, get) => ({
    balanceLamports: 0,
    transactions: [],
    processedTxHashes: [],
    pendingTopUp: null,
    hydrated: false,
    solPrice: 0,

    hydrate: async () => {
        try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw) as Persisted;
                set({ ...data, hydrated: true });
            } else {
                set({ hydrated: true });
            }
        } catch {
            set({ hydrated: true });
        }
    },

    fetchSolPrice: async () => {
        const price = await getSolPrice();
        set({ solPrice: price });
        return price;
    },

    setPendingTopUp: (amountSol, amountUsd) => {
        set({ pendingTopUp: { amountSol, amountUsd } });
    },

    clearPendingTopUp: () => {
        set({ pendingTopUp: null });
        const s = get();
        void save({ balanceLamports: s.balanceLamports, transactions: s.transactions, processedTxHashes: s.processedTxHashes, pendingTopUp: null });
    },

    topUp: async (amountSol, amountUsd, txHash) => {
        const s = get();
        if (s.processedTxHashes.includes(txHash)) return false; // idempotency

        const lamports = Math.round(amountSol * LAMPORTS);
        const tx: WalletTx = {
            id: genId(),
            type: 'TOP_UP',
            amountSol,
            amountUsd,
            status: 'completed',
            txHash,
            timestamp: Date.now(),
            note: 'Top-up from Phantom wallet',
        };
        const newBalance = s.balanceLamports + lamports;
        const newHashes = [...s.processedTxHashes, txHash];
        const newTxs = [tx, ...s.transactions];
        const persisted: Persisted = { balanceLamports: newBalance, transactions: newTxs, processedTxHashes: newHashes, pendingTopUp: null };
        set({ ...persisted });
        await save(persisted);
        return true;
    },

    placeBet: (amountSol) => {
        const s = get();
        const lamports = Math.round(amountSol * LAMPORTS);
        if (s.balanceLamports < lamports) return false;
        const newBalance = s.balanceLamports - lamports;
        set({ balanceLamports: newBalance });
        void save({ balanceLamports: newBalance, transactions: s.transactions, processedTxHashes: s.processedTxHashes, pendingTopUp: null });
        return true;
    },

    creditWin: (payoutSol, stakeAmountSol, solPrice) => {
        const s = get();
        const lamports = Math.round(payoutSol * LAMPORTS);
        const profitSol = payoutSol - stakeAmountSol;
        const tx: WalletTx = {
            id: genId(),
            type: 'WIN',
            amountSol: payoutSol,
            amountUsd: payoutSol * solPrice,
            status: 'completed',
            txHash: null,
            timestamp: Date.now(),
            note: `+${profitSol.toFixed(4)} SOL profit`,
        };
        const newBalance = s.balanceLamports + lamports;
        const newTxs = [tx, ...s.transactions];
        const persisted: Persisted = { balanceLamports: newBalance, transactions: newTxs, processedTxHashes: s.processedTxHashes, pendingTopUp: null };
        set({ ...persisted });
        void save(persisted);
    },

    recordLoss: (stakeSol, solPrice) => {
        // Balance was already deducted by placeBet — this just logs the outcome
        const s = get();
        const tx: WalletTx = {
            id: genId(),
            type: 'LOSS',
            amountSol: stakeSol,
            amountUsd: stakeSol * solPrice,
            status: 'completed',
            txHash: null,
            timestamp: Date.now(),
            note: 'Bet lost',
        };
        const newTxs = [tx, ...s.transactions];
        const persisted: Persisted = { balanceLamports: s.balanceLamports, transactions: newTxs, processedTxHashes: s.processedTxHashes, pendingTopUp: null };
        set({ transactions: newTxs });
        void save(persisted);
    },

    requestWithdrawal: (amountSol, amountUsd) => {
        const s = get();
        const lamports = Math.round(amountSol * LAMPORTS);
        if (s.balanceLamports < lamports) return false;
        const tx: WalletTx = {
            id: genId(),
            type: 'WITHDRAWAL',
            amountSol,
            amountUsd,
            status: 'pending',
            txHash: null,
            timestamp: Date.now(),
            note: 'Withdrawal to Phantom wallet — processing',
        };
        const newBalance = s.balanceLamports - lamports;
        const newTxs = [tx, ...s.transactions];
        const persisted: Persisted = { balanceLamports: newBalance, transactions: newTxs, processedTxHashes: s.processedTxHashes, pendingTopUp: null };
        set({ ...persisted });
        void save(persisted);
        return true;
    },

    getBalanceSol: () => get().balanceLamports / LAMPORTS,
}));
