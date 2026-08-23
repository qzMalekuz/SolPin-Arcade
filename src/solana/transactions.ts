import {
    PublicKey,
    Transaction,
    SystemProgram,
    SystemInstruction,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getConnection, getLatestBlockhashWithFallback } from './connection';
import { isBackendConfigured } from '../api/config';
import { IS_DEVNET } from '../store/networkStore';

/**
 * Treasury / parent wallet that receives in-game top-ups.
 * MUST equal the TREASURY_ADDRESS secret on the Supabase Edge Functions —
 * if they diverge, users' SOL lands here but the server rejects the credit
 * as not_a_topup (permanent, no retry).
 */
const MAINNET_TREASURY = 'D2hNpkGAJSJHEYw2Zs3DCH9hJbJNGvzotEx2KhnZNyR9';

/**
 * Devnet treasury for dev builds. Generate a throwaway keypair
 * (`solana-keygen new`), paste its address here, and set the same keypair
 * as TREASURY_ADDRESS / TREASURY_SECRET_KEY on the TEST Supabase project.
 * Never put the mainnet treasury's secret key on the test project.
 */
const DEVNET_TREASURY = 'Hf34SUNKLnN3qYBRpDhP1XmphrDBqHWSXkuYZ9z2kz31';

export const REWARD_POOL_PUBKEY = new PublicKey(
    IS_DEVNET ? DEVNET_TREASURY : MAINNET_TREASURY
);

/**
 * Build an in-game wallet top-up: transfer SOL from player to the parent/treasury wallet.
 * User signs this once; backend (or on-chain verification) credits the in-game balance.
 */
export const buildTopUpTransaction = async (
    payer: PublicKey,
    amountSol: number,
): Promise<Transaction> => {
    if (!Number.isFinite(amountSol) || amountSol <= 0) {
        throw new Error('Invalid top-up amount.');
    }
    // Never let SOL leave the user's wallet when there is no backend to
    // credit it — the transfer would land in the treasury and the user's
    // credit would queue forever.
    if (!isBackendConfigured()) {
        throw new Error('Top-ups are unavailable in this build: game server is not configured.');
    }
    const tx = new Transaction();
    tx.add(
        SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: REWARD_POOL_PUBKEY,
            lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
        })
    );
    const { blockhash, lastValidBlockHeight } = await getLatestBlockhashWithFallback();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = payer;
    return tx;
};

/**
 * Verify a wallet-signed top-up before submitting it and crediting the
 * in-game balance. The wallet (or a compromised deeplink round-trip) is a
 * trust boundary: never credit the locally remembered amount — credit what
 * the transaction actually transfers, and only if it is exactly one
 * SystemProgram.transfer from the connected player to the treasury.
 *
 * Returns the verified lamports being transferred. Throws on any mismatch.
 */
export const verifyTopUpTransaction = (
    transaction: Transaction,
    expectedPayer: PublicKey,
): number => {
    if (transaction.instructions.length !== 1) {
        throw new Error('Unexpected transaction: wrong instruction count.');
    }
    if (!transaction.feePayer?.equals(expectedPayer)) {
        throw new Error('Unexpected transaction: wrong fee payer.');
    }

    const ix = transaction.instructions[0];
    if (!ix.programId.equals(SystemProgram.programId)) {
        throw new Error('Unexpected transaction: not a system transfer.');
    }

    // Throws if the instruction is not a plain transfer
    const decoded = SystemInstruction.decodeTransfer(ix);
    if (!decoded.fromPubkey.equals(expectedPayer)) {
        throw new Error('Unexpected transaction: wrong sender.');
    }
    if (!decoded.toPubkey.equals(REWARD_POOL_PUBKEY)) {
        throw new Error('Unexpected transaction: wrong recipient.');
    }

    const lamports = Number(decoded.lamports);
    if (!Number.isSafeInteger(lamports) || lamports <= 0) {
        throw new Error('Unexpected transaction: invalid amount.');
    }
    return lamports;
};

/**
 * Submit a fully signed transaction and wait for confirmation.
 *
 * - serialize() verifies signatures, so a tampered/unsigned tx never leaves the app
 * - confirmation uses the blockhash strategy and checks the on-chain `err`
 * - if confirmation times out, the signature status is re-checked before
 *   reporting failure, so a landed transfer is never treated as lost
 */
export const sendSignedTransaction = async (
    signed: Transaction,
): Promise<string> => {
    const connection = getConnection();
    const raw = signed.serialize();
    const signature = await connection.sendRawTransaction(raw, {
        preflightCommitment: 'confirmed',
    });

    try {
        // finalized to match the server's crediting commitment — otherwise
        // every top-up would land in the retry queue instead of crediting
        // immediately. Costs ~10 extra seconds under the spinner.
        const result = await connection.confirmTransaction(
            {
                signature,
                blockhash: signed.recentBlockhash!,
                lastValidBlockHeight: signed.lastValidBlockHeight!,
            },
            'finalized',
        );
        if (result.value.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(result.value.err)}`);
        }
    } catch (confirmError) {
        // The transaction is already on the network. Only report failure when
        // the chain definitively rejected it — on any ambiguity (RPC lag,
        // status check unreachable) return the signature: the server verifies
        // it on-chain before crediting, and an unconfirmed credit is queued
        // and retried, so a landed transfer is never lost.
        try {
            const status = await connection.getSignatureStatus(signature, {
                searchTransactionHistory: true,
            });
            if (status.value?.err) throw confirmError;
        } catch (statusError) {
            if (statusError === confirmError) throw confirmError;
            // status check itself failed — ambiguous, treat as sent
        }
    }

    return signature;
};
