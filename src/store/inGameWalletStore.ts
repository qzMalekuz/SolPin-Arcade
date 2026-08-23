import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getSolPrice } from '../solana/price';
import { useWalletStore } from './walletStore';
import {
    ApiError,
    apiCreditTopup,
    apiPlaceBet,
    apiSettleRound,
    apiState,
    apiWithdraw,
    isAuthed,
    ServerHistoryEntry,
} from '../api/backend';

// Server-backed in-game wallet. Supabase holds the ledger; this store keeps a
// display cache plus retry queues so money is never lost to a dropped
// connection:
//   - pendingCredits: on-chain top-ups confirmed but not yet credited
//   - pendingSettles: finished rounds not yet reported
// Both server endpoints are idempotent, so retrying is always safe.

const CACHE_KEY = 'solpin-igw-v2';
// Round id persisted while a bet is in play; survives a mid-game crash so the
// round can be settled (as a loss) on next launch instead of blocking new
// bets until the server's grace expiry.
const ACTIVE_ROUND_KEY = 'solpin-active-round';
const LAMPORTS = LAMPORTS_PER_SOL;

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

interface CachedState {
    // Wallet the cache (and its retry queues) belongs to. The cache is
    // parked/loaded per wallet on switch so one player's balance, history,
    // and queued settles never leak into — or get replayed under — another
    // account's session on a shared device.
    owner: string | null;
    balanceLamports: number;
    transactions: WalletTx[];
    pendingCredits: string[];
    pendingSettles: { roundId: string; won: boolean; score: number }[];
}

const EMPTY_CACHE: CachedState = {
    owner: null,
    balanceLamports: 0,
    transactions: [],
    pendingCredits: [],
    pendingSettles: [],
};

const scopedKey = (owner: string): string => `${CACHE_KEY}:${owner}`;

interface InGameWalletState extends CachedState {
    hydrated: boolean;
    syncing: boolean;
    solPrice: number;

    hydrate: () => Promise<void>;
    fetchSolPrice: () => Promise<number>;

    /** Pull the authoritative state from the server (no-op when not signed in). */
    refreshIfAuthed: () => Promise<void>;

    /** Swap the cache when the connected wallet changes (null on disconnect). */
    setWalletOwner: (wallet: string | null) => Promise<void>;

    /** Credit a confirmed on-chain top-up. Queues a retry if the server is unreachable. */
    creditTopUp: (signature: string) => Promise<'credited' | 'duplicate' | 'queued'>;

    // betting
    placeBet: (amountSol: number, duration: number, difficulty: string) => Promise<string>;
    settleRound: (roundId: string, won: boolean, score: number) => Promise<'won' | 'lost' | 'expired' | 'queued'>;

    // withdrawal
    requestWithdrawal: (amountSol: number) => Promise<{ status: 'sent' | 'processing'; signature?: string }>;

    getBalanceSol: () => number;
}

const NOTES: Record<TxType, string> = {
    TOP_UP: 'Top-up from wallet',
    WIN: 'Bet won',
    LOSS: 'Bet lost',
    WITHDRAWAL: 'Withdrawal to wallet',
};

const toLamports = (amountSol: number): number | null => {
    if (!Number.isFinite(amountSol) || amountSol <= 0) return null;
    return Math.round(amountSol * LAMPORTS);
};

// Server rejections that can never succeed on retry — queueing these would
// retry them forever. Everything else (network drop, 5xx, rate limit,
// not-yet-confirmed tx, too_early settle) is worth retrying.
const PERMANENT_CREDIT_ERRORS = ['bad_signature', 'tx_failed', 'not_a_topup', 'bad_request'];
const PERMANENT_SETTLE_ERRORS = ['round_not_found', 'bad_request'];

const isPermanent = (err: unknown, codes: string[]): boolean =>
    err instanceof ApiError && codes.includes(err.code);

const mapHistory = (entries: ServerHistoryEntry[], solPrice: number): WalletTx[] =>
    entries.map((entry, i) => {
        const amountSol = entry.lamports / LAMPORTS;
        return {
            id: `${entry.ts}_${entry.type}_${i}`,
            type: entry.type,
            amountSol,
            amountUsd: solPrice > 0 ? amountSol * solPrice : 0,
            status: entry.status,
            txHash: entry.sig,
            timestamp: entry.ts,
            note: NOTES[entry.type],
        };
    });

export const useInGameWalletStore = create<InGameWalletState>((set, get) => {
    // Bumped on every authoritative balance write (bet/settle/credit/withdraw)
    // so an apiState() snapshot fetched before the write can be detected as
    // stale instead of overwriting the newer balance.
    let balanceSeq = 0;
    const setBalance = (balanceLamports: number): void => {
        balanceSeq++;
        set({ balanceLamports });
    };

    const saveCache = async (): Promise<void> => {
        const s = get();
        const cache: CachedState = {
            owner: s.owner,
            balanceLamports: s.balanceLamports,
            transactions: s.transactions,
            pendingCredits: s.pendingCredits,
            pendingSettles: s.pendingSettles,
        };
        try {
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch { /* display cache only — server holds the truth */ }
    };

    // A settle replayed under a different wallet's token gets round_not_found
    // (permanent) and the original wallet's win is silently discarded — so
    // queues may only be replayed by the wallet that owns them.
    const ownerMatchesSession = (): boolean => {
        const owner = get().owner;
        const connected = useWalletStore.getState().publicKey?.toBase58() ?? null;
        return !owner || !connected || owner === connected;
    };

    const retryPending = async (): Promise<void> => {
        if (!ownerMatchesSession()) return;
        const { pendingCredits, pendingSettles } = get();

        for (const signature of pendingCredits) {
            try {
                await apiCreditTopup(signature);
                set((s) => ({ pendingCredits: s.pendingCredits.filter((x) => x !== signature) }));
            } catch (err) {
                if (isPermanent(err, PERMANENT_CREDIT_ERRORS)) {
                    set((s) => ({ pendingCredits: s.pendingCredits.filter((x) => x !== signature) }));
                } // else keep queued
            }
        }

        for (const settle of pendingSettles) {
            try {
                await apiSettleRound(settle.roundId, settle.won, settle.score);
                set((s) => ({
                    pendingSettles: s.pendingSettles.filter((x) => x.roundId !== settle.roundId),
                }));
            } catch (err) {
                if (isPermanent(err, PERMANENT_SETTLE_ERRORS)) {
                    set((s) => ({
                        pendingSettles: s.pendingSettles.filter((x) => x.roundId !== settle.roundId),
                    }));
                } // else keep queued
            }
        }

        await saveCache();
    };

    return {
        ...EMPTY_CACHE,
        hydrated: false,
        syncing: false,
        solPrice: 0,

        hydrate: async () => {
            try {
                const raw = await AsyncStorage.getItem(CACHE_KEY);
                if (raw) {
                    const cache = JSON.parse(raw) as Partial<CachedState>;
                    set({ ...EMPTY_CACHE, ...cache, hydrated: true });
                } else {
                    set({ hydrated: true });
                }
            } catch {
                set({ hydrated: true });
            }
            // A round id persisted here means the app died mid-game: the ball
            // is gone, so report the round as lost to unlock new bets.
            try {
                const staleRound = await AsyncStorage.getItem(ACTIVE_ROUND_KEY);
                if (staleRound) {
                    await AsyncStorage.removeItem(ACTIVE_ROUND_KEY);
                    set((s) => ({
                        pendingSettles: s.pendingSettles.some((x) => x.roundId === staleRound)
                            ? s.pendingSettles
                            : [...s.pendingSettles, { roundId: staleRound, won: false, score: 0 }],
                    }));
                    await saveCache();
                }
            } catch { /* recovery is best-effort; the server expires the round anyway */ }
            void get().refreshIfAuthed();
        },

        fetchSolPrice: async () => {
            const price = await getSolPrice();
            set({ solPrice: price });
            return price;
        },

        refreshIfAuthed: async () => {
            if (get().syncing || !ownerMatchesSession() || !(await isAuthed())) return;
            set({ syncing: true });
            try {
                await retryPending();
                // Refetch if a local balance write raced the request — a
                // snapshot from before the write must not overwrite it.
                // Bounded: after 3 attempts keep the local (newer) balance.
                let state;
                for (let attempt = 0; attempt < 3; attempt++) {
                    const seq = balanceSeq;
                    state = await apiState();
                    if (seq === balanceSeq) break;
                    state = null;
                }
                if (state) {
                    set({
                        // Adopt the server's wallet as owner on first sync
                        owner: get().owner ?? state.wallet,
                        balanceLamports: state.balanceLamports,
                        transactions: mapHistory(state.history, get().solPrice),
                    });
                    await saveCache();
                }
            } catch {
                // offline — cached snapshot stays visible
            } finally {
                set({ syncing: false });
            }
        },

        setWalletOwner: async (wallet) => {
            const s = get();
            if (s.owner === wallet) return;
            try {
                // Park the outgoing wallet's cache (incl. retry queues) and
                // load the incoming wallet's, so queued money operations are
                // only ever replayed by the account that owns them.
                if (s.owner) {
                    await AsyncStorage.setItem(scopedKey(s.owner), JSON.stringify({
                        owner: s.owner,
                        balanceLamports: s.balanceLamports,
                        transactions: s.transactions,
                        pendingCredits: s.pendingCredits,
                        pendingSettles: s.pendingSettles,
                    }));
                }
                const raw = wallet ? await AsyncStorage.getItem(scopedKey(wallet)) : null;
                const cache = raw ? (JSON.parse(raw) as Partial<CachedState>) : null;
                set({ ...EMPTY_CACHE, ...(cache ?? {}), owner: wallet });
            } catch {
                set({ ...EMPTY_CACHE, owner: wallet });
            }
            await saveCache();
            if (wallet) void get().refreshIfAuthed();
        },

        creditTopUp: async (signature) => {
            try {
                const result = await apiCreditTopup(signature);
                setBalance(result.balanceLamports);
                await saveCache();
                void get().refreshIfAuthed();
                return result.credited ? 'credited' : 'duplicate';
            } catch (err) {
                // A permanent rejection means this signature can never credit —
                // surface it instead of promising it will complete.
                if (isPermanent(err, PERMANENT_CREDIT_ERRORS)) throw err;
                // The SOL is already in the treasury — never drop the credit.
                set((s) => ({
                    pendingCredits: s.pendingCredits.includes(signature)
                        ? s.pendingCredits
                        : [...s.pendingCredits, signature],
                }));
                await saveCache();
                return 'queued';
            }
        },

        placeBet: async (amountSol, duration, difficulty) => {
            const lamports = toLamports(amountSol);
            if (lamports === null) throw new Error('Invalid stake amount.');
            const result = await apiPlaceBet(lamports, duration, difficulty);
            setBalance(result.balanceLamports);
            try {
                await AsyncStorage.setItem(ACTIVE_ROUND_KEY, result.roundId);
            } catch { /* crash recovery only */ }
            await saveCache();
            return result.roundId;
        },

        settleRound: async (roundId, won, score) => {
            try {
                const result = await apiSettleRound(roundId, won, score);
                setBalance(result.balanceLamports);
                await saveCache();
                void get().refreshIfAuthed();
                return result.result;
            } catch (err) {
                // An unknown round can never settle — don't queue an infinite retry.
                if (isPermanent(err, PERMANENT_SETTLE_ERRORS)) return 'expired';
                // Network drop after the game ended: queue and retry within the
                // server's grace window so a win is not lost.
                set((s) => ({
                    pendingSettles: s.pendingSettles.some((x) => x.roundId === roundId)
                        ? s.pendingSettles
                        : [...s.pendingSettles, { roundId, won, score }],
                }));
                await saveCache();
                return 'queued';
            } finally {
                // Outcome is recorded (or queued persistently) — crash
                // recovery no longer needs the round id.
                AsyncStorage.removeItem(ACTIVE_ROUND_KEY).catch(() => { });
            }
        },

        requestWithdrawal: async (amountSol) => {
            const lamports = toLamports(amountSol);
            if (lamports === null) throw new Error('Invalid withdrawal amount.');
            const result = await apiWithdraw(lamports);
            setBalance(result.balanceLamports);
            await saveCache();
            void get().refreshIfAuthed();
            return { status: result.status, signature: result.signature };
        },

        getBalanceSol: () => get().balanceLamports / LAMPORTS,
    };
});
