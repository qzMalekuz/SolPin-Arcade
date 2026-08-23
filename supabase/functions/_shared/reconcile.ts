// Self-healing for withdrawals interrupted mid-flight (crash, timeout,
// dropped connection). Signatures are recorded before broadcast, so every
// stuck 'processing' row can be safely resolved against the chain:
//   - landed on-chain            -> mark sent
//   - failed on-chain            -> mark failed, refund
//   - never broadcast / expired  -> mark failed, refund
//   - still in flight            -> leave alone
// fn_finalize_withdrawal only acts on 'processing' rows under a row lock,
// so concurrent reconciles can never double-refund.
import { connection, db } from './mod.ts';

interface ProcessingWithdrawal {
    id: string;
    tx_signature: string | null;
    last_valid_block_height: number | null;
    created_at: string;
}

const NEVER_BROADCAST_TIMEOUT_MS = 10 * 60 * 1000;

/** Returns true if any withdrawal is still genuinely in flight. */
export const reconcileProcessingWithdrawals = async (wallet: string): Promise<boolean> => {
    const { data } = await db
        .from('withdrawals')
        .select('id, tx_signature, last_valid_block_height, created_at')
        .eq('wallet', wallet)
        .eq('status', 'processing');

    const rows = (data ?? []) as ProcessingWithdrawal[];
    if (rows.length === 0) return false;

    const conn = connection();
    let stillInFlight = false;

    for (const row of rows) {
        if (!row.tx_signature) {
            // Signature is attached before broadcast: no signature means nothing
            // was ever sent. After a generous timeout, refund.
            const age = Date.now() - new Date(row.created_at).getTime();
            if (age > NEVER_BROADCAST_TIMEOUT_MS) {
                await db.rpc('fn_finalize_withdrawal', { p_id: row.id, p_success: false });
            } else {
                stillInFlight = true;
            }
            continue;
        }

        try {
            const status = await conn.getSignatureStatus(row.tx_signature, {
                searchTransactionHistory: true,
            });
            const level = status.value?.confirmationStatus;
            if (level === 'confirmed' || level === 'finalized') {
                await db.rpc('fn_finalize_withdrawal', {
                    p_id: row.id,
                    p_success: !status.value?.err,
                });
                continue;
            }

            const blockHeight = await conn.getBlockHeight('confirmed');
            if (row.last_valid_block_height && blockHeight > row.last_valid_block_height) {
                // Blockhash expired without landing: the transaction is dead. Refund.
                await db.rpc('fn_finalize_withdrawal', { p_id: row.id, p_success: false });
            } else {
                stillInFlight = true;
            }
        } catch {
            stillInFlight = true; // RPC hiccup — try again next call
        }
    }

    return stillInFlight;
};
