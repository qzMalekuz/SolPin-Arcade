// SolPin game-server client. Thin fetch wrappers around the Supabase Edge
// Functions plus the wallet-signature sign-in flow that mints the API token.
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isBackendConfigured } from './config';
import { useWalletStore } from '../store/walletStore';
import { connectMWA, MWASession, signInWithMWA } from '../solana/mwa';
import {
    buildSignMessageUrl,
    getPhantomErrorMessage,
    hasPhantomSession,
    hydratePhantomSession,
    openPhantomLink,
    parseSignMessageResponse,
} from '../solana/phantom';

const TOKEN_KEY = 'solpin-api-jwt';

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------
let cachedToken: string | null = null;

const tokenIsValid = (token: string): boolean => {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
        // 60s clock-skew margin so a token never dies mid-request
        return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + 60_000;
    } catch {
        return false;
    }
};

const getToken = async (): Promise<string | null> => {
    if (cachedToken && tokenIsValid(cachedToken)) return cachedToken;
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    if (stored && tokenIsValid(stored)) {
        cachedToken = stored;
        return stored;
    }
    return null;
};

const setToken = async (token: string): Promise<void> => {
    cachedToken = token;
    await SecureStore.setItemAsync(TOKEN_KEY, token);
};

export const clearApiToken = async (): Promise<void> => {
    cachedToken = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
};

export const isAuthed = async (): Promise<boolean> => Boolean(await getToken());

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const FRIENDLY_ERRORS: Record<string, string> = {
    insufficient_balance: 'Not enough in-game balance.',
    unknown_wallet: 'Top up your in-game wallet before playing.',
    stake_out_of_range: 'Stake is outside the allowed range.',
    invalid_amount: 'Invalid amount.',
    bad_signature: 'That transaction signature is not valid.',
    round_active: 'You already have a round in progress. Finish it before starting a new one.',
    rate_limited: 'Too many games in a short time. Take a short break and try again.',
    too_early: 'Result rejected: the round timer had not finished.',
    round_not_found: 'This round could not be found.',
    below_minimum: 'Amount is below the minimum withdrawal.',
    withdrawal_in_progress: 'A withdrawal is already being processed. Please wait for it to finish.',
    daily_cap_exceeded: 'Daily withdrawal limit reached. Try again tomorrow.',
    treasury_unavailable: 'Withdrawals are temporarily unavailable. Your balance is untouched — try again later.',
    banned: 'This wallet has been suspended. Contact support.',
    not_found: 'Transaction not confirmed yet.',
    tx_failed: 'The transaction failed on-chain.',
    not_a_topup: 'This transaction is not a valid top-up.',
    rpc_unavailable: 'Solana network is congested. Please try again.',
    send_failed: 'The transfer could not be sent. Your balance was refunded.',
    nonce_invalid_or_expired: 'Sign-in expired. Please try again.',
    signature_invalid: 'Wallet signature could not be verified.',
    unauthorized: 'Session expired. Please try again.',
    server_error: 'Something went wrong on the game server. Please try again.',
};

export class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number) {
        super(FRIENDLY_ERRORS[code] ?? `Server error (${code})`);
        this.code = code;
        this.status = status;
    }
}

const call = async <T>(
    fn: string,
    body?: unknown,
    opts: { auth?: boolean; method?: string } = {},
): Promise<T> => {
    if (!isBackendConfigured()) {
        throw new Error('Game server is not configured in this build.');
    }

    const headers: Record<string, string> = {
        'content-type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
    };
    if (opts.auth) {
        const token = await getToken();
        if (!token) throw new ApiError('unauthorized', 401);
        headers.authorization = `Bearer ${token}`;
    }

    let res: Response;
    try {
        res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
            method: opts.method ?? 'POST',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new Error('Network error — check your connection and try again.');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 202) {
        if (res.status === 401 && opts.auth) await clearApiToken();
        throw new ApiError(String(data?.error ?? 'server_error'), res.status);
    }
    return data as T;
};

// ---------------------------------------------------------------------------
// Sign-in with wallet signature
// ---------------------------------------------------------------------------

// Phantom's signMessage is a deeplink round-trip; this resolver bridges the
// redirect back into a promise. Registered once at module load.
let pendingPhantomSign: {
    resolve: (signedPayloadB64: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
} | null = null;

Linking.addEventListener('url', ({ url }) => {
    if (!url.includes('onSignMessage') || !pendingPhantomSign) return;
    const pending = pendingPhantomSign;
    pendingPhantomSign = null;
    clearTimeout(pending.timer);

    const phantomError = getPhantomErrorMessage(url, 'Message signing failed.');
    if (phantomError) {
        pending.reject(new Error(phantomError));
        return;
    }
    const parsed = parseSignMessageResponse(url);
    if (!parsed) {
        pending.reject(new Error('Could not verify the signature from Phantom.'));
        return;
    }
    pending.resolve(Buffer.from(bs58.decode(parsed.signature)).toString('base64'));
});

const signMessageWithPhantom = async (message: string, session: string): Promise<string> => {
    await hydratePhantomSession();
    if (!hasPhantomSession()) {
        throw new Error('Phantom session expired. Reconnect your wallet.');
    }
    const url = buildSignMessageUrl(message, session);
    return new Promise<string>((resolve, reject) => {
        // Release the slot only if this request still owns it, so a stale
        // timer/error from an earlier attempt can't clobber a newer request.
        const pending = {
            resolve,
            reject,
            timer: setTimeout(() => {
                if (pendingPhantomSign === pending) pendingPhantomSign = null;
                reject(new Error('Phantom did not respond in time. Please try again.'));
            }, 90_000),
        };
        pendingPhantomSign = pending;
        openPhantomLink(url).catch((error) => {
            if (pendingPhantomSign === pending) pendingPhantomSign = null;
            clearTimeout(pending.timer);
            reject(error instanceof Error ? error : new Error('Could not open Phantom.'));
        });
    });
};

const requestNonce = () =>
    call<{ nonce: string; message: string }>('auth', { action: 'nonce' });

const verifySignIn = async (
    wallet: string,
    nonce: string,
    signedPayloadB64: string,
): Promise<void> => {
    const { token } = await call<{ token: string }>('auth', {
        action: 'verify',
        wallet,
        nonce,
        signedPayload: signedPayloadB64,
    });
    await setToken(token);
};

/**
 * Make sure we hold a valid API token, prompting the connected wallet for a
 * (free) message signature when needed. Throws with a user-facing message.
 */
export const ensureAuthed = async (): Promise<void> => {
    if (await getToken()) return;

    const { publicKey, provider, session } = useWalletStore.getState();
    if (!publicKey || !provider) {
        throw new Error('Connect your wallet first.');
    }

    const { nonce, message } = await requestNonce();

    if (provider === 'mwa') {
        const { session: mwaSession, signedPayloadB64 } = await signInWithMWA(message);
        await verifySignIn(mwaSession.publicKey.toBase58(), nonce, signedPayloadB64);
        return;
    }

    if (!session) throw new Error('Reconnect your wallet.');
    const signedPayloadB64 = await signMessageWithPhantom(message, session);
    await verifySignIn(publicKey.toBase58(), nonce, signedPayloadB64);
};

/** ensureAuthed that swallows failures — for opportunistic background sign-in. */
export const ensureAuthedSilently = async (): Promise<boolean> => {
    try {
        await ensureAuthed();
        return true;
    } catch {
        return false;
    }
};

/**
 * Connect via MWA and sign in against the game server in a single wallet
 * session (authorize + one free message signature). Falls back to a plain
 * connect if the server is unreachable — sign-in then happens lazily on the
 * first money action.
 */
export const connectMWAWithAuth = async (): Promise<MWASession> => {
    if (!isBackendConfigured() || (await getToken())) {
        return connectMWA();
    }
    let nonce: string;
    let message: string;
    try {
        ({ nonce, message } = await requestNonce());
    } catch {
        return connectMWA();
    }
    const { session, signedPayloadB64 } = await signInWithMWA(message);
    try {
        await verifySignIn(session.publicKey.toBase58(), nonce, signedPayloadB64);
    } catch {
        // Connection still succeeds; auth retries on first money action.
    }
    return session;
};

// ---------------------------------------------------------------------------
// Game API
// ---------------------------------------------------------------------------
export interface ServerHistoryEntry {
    type: 'TOP_UP' | 'WIN' | 'LOSS' | 'WITHDRAWAL';
    lamports: number;
    sig: string | null;
    status: 'pending' | 'completed' | 'failed';
    ts: number;
}

export interface ServerState {
    wallet: string;
    balanceLamports: number;
    activeRound: {
        id: string;
        stakeLamports: number;
        multiplier: number;
        duration: number;
        difficulty: string;
        startedAt: number;
    } | null;
    history: ServerHistoryEntry[];
}

export const apiState = () =>
    call<ServerState>('state', undefined, { auth: true, method: 'GET' });

export const apiCreditTopup = (signature: string) =>
    call<{ wallet: string; balanceLamports: number; credited: boolean }>('topup', { signature });

export const apiPlaceBet = (stakeLamports: number, duration: number, difficulty: string) =>
    call<{ roundId: string; balanceLamports: number; multiplier: number }>(
        'bet',
        { stakeLamports, duration, difficulty },
        { auth: true },
    );

export const apiSettleRound = (roundId: string, won: boolean, score: number) =>
    call<{ result: 'won' | 'lost' | 'expired'; payoutLamports: number; balanceLamports: number }>(
        'settle',
        { roundId, won, score },
        { auth: true },
    );

export const apiWithdraw = (lamports: number) =>
    call<{ status: 'sent' | 'processing'; signature?: string; balanceLamports: number }>(
        'withdraw',
        { lamports },
        { auth: true },
    );

export interface LeaderboardRow {
    wallet: string;
    score: number;
    duration_secs: number;
    difficulty: string;
    reward_lamports: number;
    created_at: string;
}

export const apiLeaderboard = async (): Promise<LeaderboardRow[]> => {
    if (!isBackendConfigured()) return [];
    const params = 'select=wallet,score,duration_secs,difficulty,reward_lamports,created_at&order=score.desc&limit=100';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leaderboard?${params}`, {
        headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) throw new Error('Could not load the leaderboard.');
    return (await res.json()) as LeaderboardRow[];
};
