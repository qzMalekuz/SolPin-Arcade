// Shared helpers for all SolPin Edge Functions.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SignJWT, jwtVerify } from 'npm:jose@5';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';

export const need = (key: string): string => {
    const value = Deno.env.get(key);
    if (!value) throw new Error(`Missing required secret: ${key}`);
    return value;
};

export const envInt = (key: string, fallback: number): number => {
    const raw = Deno.env.get(key);
    const parsed = raw ? Number(raw) : NaN;
    // Zero is a valid operator kill switch (e.g. MAX_ROUNDS_PER_HOUR=0 halts
    // betting, DAILY_WITHDRAWAL_CAP_LAMPORTS=0 freezes withdrawals) — it must
    // not silently fall back to the permissive default.
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

export const db = createClient(
    need('SUPABASE_URL'),
    need('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
);

export const connection = (): Connection =>
    new Connection(Deno.env.get('RPC_URL') ?? 'https://api.mainnet-beta.solana.com', 'confirmed');

// ---------------------------------------------------------------------------
// Game constants — server-side source of truth. Never trust a multiplier,
// duration, or difficulty sent by a client.
// ---------------------------------------------------------------------------
export const MULTIPLIER_TABLE: Record<string, Record<string, number>> = {
    '30': { easy: 1.2, medium: 1.4, hard: 1.8 },
    '45': { easy: 1.35, medium: 1.6, hard: 2.0 },
    '60': { easy: 1.5, medium: 1.8, hard: 2.2 },
};

export const GRACE_SECS = envInt('ROUND_GRACE_SECS', 900);
export const MAX_ROUNDS_PER_HOUR = envInt('MAX_ROUNDS_PER_HOUR', 100);
export const MIN_STAKE_LAMPORTS = envInt('MIN_STAKE_LAMPORTS', 1_000_000); // 0.001 SOL
export const MAX_STAKE_LAMPORTS = envInt('MAX_STAKE_LAMPORTS', 5_000_000_000); // 5 SOL
export const MIN_WITHDRAWAL_LAMPORTS = envInt('MIN_WITHDRAWAL_LAMPORTS', 100_000_000); // 0.1 SOL
export const DAILY_WITHDRAWAL_CAP_LAMPORTS = envInt('DAILY_WITHDRAWAL_CAP_LAMPORTS', 10_000_000_000); // 10 SOL
// Across ALL wallets per 24h — the treasury's maximum bleed rate if the game
// economy is exploited. Size it to a loss you can absorb, not to expected volume.
export const GLOBAL_DAILY_WITHDRAWAL_CAP_LAMPORTS = envInt('GLOBAL_DAILY_WITHDRAWAL_CAP_LAMPORTS', 50_000_000_000); // 50 SOL
export const MAX_SCORE = 10_000_000;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const CORS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'content-type': 'application/json' },
    });

export const errorResponse = (status: number, code: string): Response =>
    json(status, { error: code });

export const preflight = (req: Request): Response | null =>
    req.method === 'OPTIONS' ? new Response(null, { status: 204, headers: CORS }) : null;

export const readBody = async (req: Request): Promise<Record<string, unknown>> => {
    try {
        const body = await req.json();
        return body && typeof body === 'object' ? body as Record<string, unknown> : {};
    } catch {
        return {};
    }
};

// Map `raise exception 'code'` from the SQL functions to HTTP responses.
const RPC_ERROR_STATUS: Record<string, number> = {
    invalid_amount: 400,
    unknown_wallet: 403,
    banned: 403,
    round_active: 409,
    rate_limited: 429,
    insufficient_balance: 400,
    round_not_found: 404,
    too_early: 400,
    below_minimum: 400,
    withdrawal_in_progress: 409,
    daily_cap_exceeded: 429,
    treasury_unavailable: 503,
};

export const rpcErrorResponse = (error: { message?: string }): Response => {
    const code = (error.message ?? '').trim();
    const status = RPC_ERROR_STATUS[code];
    if (status) return errorResponse(status, code);
    console.error('unexpected rpc error:', error.message);
    return errorResponse(500, 'server_error');
};

// ---------------------------------------------------------------------------
// Auth: HS256 JWT, subject = wallet address
// ---------------------------------------------------------------------------
const jwtSecret = (): Uint8Array => new TextEncoder().encode(need('APP_JWT_SECRET'));

export const issueToken = (wallet: string): Promise<string> =>
    new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(wallet)
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(jwtSecret());

/** Returns the authenticated wallet address, or null. */
export const walletFromRequest = async (req: Request): Promise<string | null> => {
    const header = req.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return null;
    try {
        const { payload } = await jwtVerify(header.slice(7), jwtSecret());
        return typeof payload.sub === 'string' && validWallet(payload.sub) ? payload.sub : null;
    } catch {
        return null;
    }
};

/** Validate + normalize a base58 wallet address. */
export const validWallet = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.length < 32 || value.length > 44) return null;
    try {
        return new PublicKey(value).toBase58();
    } catch {
        return null;
    }
};

export const safePositiveInt = (value: unknown): number | null =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
