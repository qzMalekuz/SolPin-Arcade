// Verify an on-chain top-up and credit the ledger.
//   POST { signature } -> { balanceLamports, credited }
// No auth needed: the chain is the source of truth. The credit always goes to
// the wallet that actually sent the transfer, and each signature credits once
// (primary key on topups.sig), so replaying or submitting someone else's
// signature does nothing an attacker can profit from.
import {
    connection,
    db,
    errorResponse,
    json,
    need,
    preflight,
    readBody,
    rpcErrorResponse,
    validWallet,
} from '../_shared/mod.ts';

Deno.serve(async (req) => {
    const cors = preflight(req);
    if (cors) return cors;
    if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');

    // Normalize so comparison against the chain-parsed base58 destination
    // can't fail (or falsely pass) on a misformatted env value.
    // TREASURY_ADDRESS must equal REWARD_POOL_PUBKEY in the app's
    // src/solana/transactions.ts — a mismatch strands users' deposits.
    const treasury = validWallet(need('TREASURY_ADDRESS'));
    if (!treasury) return errorResponse(500, 'server_error');
    const body = await readBody(req);
    const signature = typeof body.signature === 'string' ? body.signature.trim() : '';
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(signature)) {
        return errorResponse(400, 'bad_signature');
    }

    let tx;
    try {
        // finalized: a credited deposit must never be reversible by a fork.
        // The client treats the resulting 404s as retryable and queues the
        // credit until finalization catches up.
        tx = await connection().getParsedTransaction(signature, {
            commitment: 'finalized',
            maxSupportedTransactionVersion: 0,
        });
    } catch {
        return errorResponse(502, 'rpc_unavailable');
    }
    if (!tx) return errorResponse(404, 'not_found'); // not confirmed yet — client retries
    if (tx.meta?.err) return errorResponse(400, 'tx_failed');

    // Sum top-level system transfers into the treasury; require a single sender.
    let lamports = 0n;
    const senders = new Set<string>();
    for (const ix of tx.transaction.message.instructions) {
        if (!('parsed' in ix) || ix.program !== 'system') continue;
        const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> };
        if (parsed.type !== 'transfer' || !parsed.info) continue;
        if (parsed.info.destination !== treasury) continue;
        const amount = BigInt(String(parsed.info.lamports ?? 0));
        if (amount <= 0n) continue;
        lamports += amount;
        senders.add(String(parsed.info.source));
    }

    if (lamports <= 0n || senders.size !== 1) {
        return errorResponse(400, 'not_a_topup');
    }
    const wallet = validWallet([...senders][0]);
    if (!wallet || wallet === treasury) return errorResponse(400, 'not_a_topup');

    const { data, error } = await db.rpc('fn_credit_topup', {
        p_wallet: wallet,
        p_lamports: Number(lamports),
        p_sig: signature,
    });
    if (error) return rpcErrorResponse(error);

    const row = Array.isArray(data) ? data[0] : data;
    return json(200, {
        wallet,
        balanceLamports: Number(row?.balance ?? 0),
        credited: Boolean(row?.credited),
    });
});
