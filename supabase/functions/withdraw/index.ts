// Real withdrawal: deduct the ledger, sign a transfer from the treasury,
// broadcast it, confirm it.
//   POST { lamports } -> { status: 'sent'|'processing', signature, balanceLamports }
//
// Failure-ordering guarantees:
//   1. Ledger deducts first (fn_request_withdrawal, atomic, capped).
//   2. The signed transaction's signature is recorded BEFORE broadcast.
//   3. Broadcast + confirm. Any crash between 1 and confirmation leaves a
//      'processing' row that reconcile resolves against the chain — money is
//      either delivered or refunded, never both, never neither.
import bs58 from 'npm:bs58@6';
import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
} from 'npm:@solana/web3.js@1.98.4';
import {
    connection,
    DAILY_WITHDRAWAL_CAP_LAMPORTS,
    db,
    errorResponse,
    GLOBAL_DAILY_WITHDRAWAL_CAP_LAMPORTS,
    json,
    MIN_WITHDRAWAL_LAMPORTS,
    need,
    preflight,
    readBody,
    rpcErrorResponse,
    safePositiveInt,
    walletFromRequest,
} from '../_shared/mod.ts';
import { reconcileProcessingWithdrawals } from '../_shared/reconcile.ts';

const FEE_BUFFER_LAMPORTS = 100_000;

const treasuryKeypair = (): Keypair => {
    const raw = need('TREASURY_SECRET_KEY').trim();
    const bytes = raw.startsWith('[')
        ? Uint8Array.from(JSON.parse(raw) as number[])
        : bs58.decode(raw);
    return Keypair.fromSecretKey(bytes);
};

const finalize = (id: string, success: boolean) =>
    db.rpc('fn_finalize_withdrawal', { p_id: id, p_success: success });

Deno.serve(async (req) => {
    const cors = preflight(req);
    if (cors) return cors;
    if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');

    const wallet = await walletFromRequest(req);
    if (!wallet) return errorResponse(401, 'unauthorized');

    const body = await readBody(req);
    const lamports = safePositiveInt(body.lamports);
    if (!lamports) return errorResponse(400, 'bad_request');

    // Resolve anything left over from a previous interrupted attempt first.
    const inFlight = await reconcileProcessingWithdrawals(wallet);
    if (inFlight) return errorResponse(409, 'withdrawal_in_progress');

    const treasury = treasuryKeypair();
    const conn: Connection = connection();

    // Refuse before deducting if the treasury float can't cover it.
    let treasuryBalance: number;
    try {
        treasuryBalance = await conn.getBalance(treasury.publicKey, 'confirmed');
    } catch {
        return errorResponse(502, 'rpc_unavailable');
    }
    if (treasuryBalance < lamports + FEE_BUFFER_LAMPORTS) {
        console.error(`treasury low: ${treasuryBalance} lamports, needed ${lamports}`);
        return errorResponse(503, 'treasury_unavailable');
    }

    // 1. Atomic ledger deduction (min, balance, daily cap, single-flight).
    const { data, error } = await db.rpc('fn_request_withdrawal', {
        p_wallet: wallet,
        p_lamports: lamports,
        p_min: MIN_WITHDRAWAL_LAMPORTS,
        p_daily_cap: DAILY_WITHDRAWAL_CAP_LAMPORTS,
        p_global_cap: GLOBAL_DAILY_WITHDRAWAL_CAP_LAMPORTS,
    });
    if (error) return rpcErrorResponse(error);
    const row = Array.isArray(data) ? data[0] : data;
    const withdrawalId = String(row?.withdrawal_id);
    const balanceAfter = Number(row?.balance ?? 0);

    // 2. Build + sign, and record the signature before broadcasting.
    let signature: string;
    let blockhash: string;
    let lastValidBlockHeight: number;
    let rawTx: Uint8Array;
    try {
        const blockhashInfo = await conn.getLatestBlockhash('confirmed');
        const tx = new Transaction();
        tx.add(SystemProgram.transfer({
            fromPubkey: treasury.publicKey,
            toPubkey: new PublicKey(wallet),
            lamports,
        }));
        tx.recentBlockhash = blockhashInfo.blockhash;
        tx.lastValidBlockHeight = blockhashInfo.lastValidBlockHeight;
        tx.feePayer = treasury.publicKey;
        tx.sign(treasury);
        signature = bs58.encode(tx.signature!);
        blockhash = blockhashInfo.blockhash;
        lastValidBlockHeight = blockhashInfo.lastValidBlockHeight;
        rawTx = new Uint8Array(tx.serialize());
    } catch {
        await finalize(withdrawalId, false); // nothing broadcast — refund
        return errorResponse(502, 'rpc_unavailable');
    }

    const { error: attachError } = await db.rpc('fn_attach_withdrawal_sig', {
        p_id: withdrawalId,
        p_sig: signature,
        p_last_valid_block_height: lastValidBlockHeight,
    });
    if (attachError) {
        await finalize(withdrawalId, false); // nothing broadcast — refund
        return errorResponse(500, 'server_error');
    }

    // 3. Broadcast and confirm.
    try {
        await conn.sendRawTransaction(rawTx, { preflightCommitment: 'confirmed' });
        const result = await conn.confirmTransaction(
            { signature, blockhash, lastValidBlockHeight },
            'confirmed',
        );
        if (result.value.err) throw new Error('tx_failed_on_chain');
    } catch {
        // Might still have landed (or land soon) — check once before deciding.
        try {
            const status = await conn.getSignatureStatus(signature, {
                searchTransactionHistory: true,
            });
            const level = status.value?.confirmationStatus;
            if ((level === 'confirmed' || level === 'finalized') && !status.value?.err) {
                await finalize(withdrawalId, true);
                return json(200, { status: 'sent', signature, balanceLamports: balanceAfter });
            }
            if (status.value?.err) {
                await finalize(withdrawalId, false);
                return errorResponse(502, 'send_failed');
            }
        } catch { /* fall through */ }
        // Undetermined: leave 'processing' — reconcile resolves it on the next
        // state/withdraw call once the blockhash lands or expires.
        return json(202, { status: 'processing', signature, balanceLamports: balanceAfter });
    }

    await finalize(withdrawalId, true);
    return json(200, { status: 'sent', signature, balanceLamports: balanceAfter });
});
