import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getConnection } from './connection';
import { Difficulty, Duration } from '../theme';

// -----------------------------------------------------------------
// In production these would reference real Anchor program PDAs.
// For devnet demo we use simple SOL transfers as a placeholder.
// -----------------------------------------------------------------

/** Placeholder program ID - replace with your deployed Anchor program */
export const PROGRAM_ID = new PublicKey(
    '11111111111111111111111111111111'
);

/** Placeholder reward pool wallet (would be a PDA in production) */
export const REWARD_POOL_PUBKEY = new PublicKey(
    'GwL1S3yVCf1T6iNxjReqTfPLzYfG2unXxPZdp5bDjwkP' // example devnet pubkey
);

/**
 * Build a stake transaction: transfer SOL from player to the escrow/pool.
 * In production this would call the Anchor `stake` instruction.
 */
export const buildStakeTransaction = async (
    payer: PublicKey,
    amount: number,
    duration: Duration,
    difficulty: Difficulty,
): Promise<Transaction> => {
    const connection = getConnection();
    const tx = new Transaction();

    // Simple SOL transfer for demo
    tx.add(
        SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: REWARD_POOL_PUBKEY,
            lamports: Math.round(amount * LAMPORTS_PER_SOL),
        })
    );

    // Attach recent blockhash
    const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = payer;

    // In production, you'd add an Anchor instruction with these params:
    // instruction: stake(amount, duration, difficulty)
    // accounts:   [payer, escrow_vault_pda, system_program]

    return tx;
};

/**
 * Build a claim-reward transaction.
 * In production this calls Anchor `claim_reward` with anti-cheat payload.
 */
export const buildClaimTransaction = async (
    payer: PublicKey,
    rewardAmount: number,
    _antiCheatPayload?: {
        score: number;
        timestamp: number;
        duration: Duration;
        difficulty: Difficulty;
        seed: string;
    },
): Promise<Transaction> => {
    const connection = getConnection();
    const tx = new Transaction();

    // In production this would be:
    //   program.methods.claimReward(payload).accounts({...}).instruction()
    // For demo, we just create a zero-transfer memo marker
    tx.add(
        SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: payer,
            lamports: 0,
        })
    );

    const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = payer;

    return tx;
};

/**
 * Build a forfeit transaction (player lost).
 * In production this calls Anchor `forfeit`.
 */
export const buildForfeitTransaction = async (
    payer: PublicKey,
): Promise<Transaction> => {
    const connection = getConnection();
    const tx = new Transaction();

    tx.add(
        SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: payer,
            lamports: 0,
        })
    );

    const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = payer;

    return tx;
};
