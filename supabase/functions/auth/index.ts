// Wallet-signature sign-in.
//   POST { action: 'nonce' }                                    -> { nonce, message }
//   POST { action: 'verify', wallet, nonce, signedPayload }     -> { token, wallet }
// signedPayload is base64. Wallets differ in what they return from message
// signing (a bare 64-byte signature, or message-with-signature), so
// verification tries each sound interpretation — a payload only authenticates
// if some candidate is a valid ed25519 signature of the exact expected
// message by the claimed wallet key.
import nacl from 'npm:tweetnacl@1';
import { PublicKey } from 'npm:@solana/web3.js@1.98.4';
import {
    db,
    errorResponse,
    issueToken,
    json,
    preflight,
    readBody,
    validWallet,
} from '../_shared/mod.ts';

const NONCE_TTL_MS = 5 * 60 * 1000;
// Max unexpired nonces one IP can hold. Legit sign-in uses one at a time;
// this only stops table-flood / cost-inflation abuse.
const MAX_LIVE_NONCES_PER_IP = 20;

const clientIp = (req: Request): string =>
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

const buildMessage = (nonce: string): string =>
    `SolPin Arcade wants you to verify wallet ownership.\n\n` +
    `This signature is free and does not approve any transaction.\n\n` +
    `Nonce: ${nonce}`;

const randomNonce = (): string => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const verifySignedPayload = (
    signedPayload: Uint8Array,
    message: Uint8Array,
    wallet: PublicKey,
): boolean => {
    const key = wallet.toBytes();
    const candidates: Uint8Array[] = [];
    if (signedPayload.length === 64) candidates.push(signedPayload);
    if (signedPayload.length > 64) {
        candidates.push(signedPayload.slice(-64), signedPayload.slice(0, 64));
    }
    return candidates.some((sig) => {
        try {
            return nacl.sign.detached.verify(message, sig, key);
        } catch {
            return false;
        }
    });
};

Deno.serve(async (req) => {
    const cors = preflight(req);
    if (cors) return cors;
    if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');

    const body = await readBody(req);

    if (body.action === 'nonce') {
        const nonce = randomNonce();
        const ip = clientIp(req);
        const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
        // Opportunistic cleanup, then store the new nonce
        await db.from('auth_nonces').delete().lt('expires_at', new Date().toISOString());
        const { count } = await db
            .from('auth_nonces')
            .select('nonce', { count: 'exact', head: true })
            .eq('ip', ip);
        if ((count ?? 0) >= MAX_LIVE_NONCES_PER_IP) {
            return errorResponse(429, 'rate_limited');
        }
        const { error } = await db.from('auth_nonces').insert({ nonce, ip, expires_at: expiresAt });
        if (error) return errorResponse(500, 'server_error');
        return json(200, { nonce, message: buildMessage(nonce) });
    }

    if (body.action === 'verify') {
        const wallet = validWallet(body.wallet);
        const nonce = typeof body.nonce === 'string' ? body.nonce : '';
        const payloadB64 = typeof body.signedPayload === 'string' ? body.signedPayload : '';
        if (!wallet || !/^[0-9a-f]{48}$/.test(nonce) || !payloadB64 || payloadB64.length > 4096) {
            return errorResponse(400, 'bad_request');
        }

        // Single-use: delete the nonce as we claim it
        const { data: rows, error } = await db
            .from('auth_nonces')
            .delete()
            .eq('nonce', nonce)
            .gt('expires_at', new Date().toISOString())
            .select();
        if (error) return errorResponse(500, 'server_error');
        if (!rows || rows.length === 0) return errorResponse(401, 'nonce_invalid_or_expired');

        let signedPayload: Uint8Array;
        try {
            signedPayload = Uint8Array.from(atob(payloadB64), (c) => c.charCodeAt(0));
        } catch {
            return errorResponse(400, 'bad_request');
        }

        const message = new TextEncoder().encode(buildMessage(nonce));
        if (!verifySignedPayload(signedPayload, message, new PublicKey(wallet))) {
            return errorResponse(401, 'signature_invalid');
        }

        const token = await issueToken(wallet);
        return json(200, { token, wallet });
    }

    return errorResponse(400, 'bad_request');
});
