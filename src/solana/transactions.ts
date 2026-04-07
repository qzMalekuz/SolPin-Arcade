import {
    PublicKey,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getConnection, getLatestBlockhashWithFallback, getSolanaCluster } from './connection';
import { Difficulty, Duration } from '../theme';

// -----------------------------------------------------------------
// In production these would reference real Anchor program PDAs.
// This temporary implementation uses simple SOL transfers as a placeholder.
// -----------------------------------------------------------------

/** Placeholder program ID - replace with your deployed Anchor program */
export const PROGRAM_ID = new PublicKey(
    '11111111111111111111111111111111'
);

/** Placeholder reward pool wallet (would be a PDA in production) */
export const REWARD_POOL_PUBKEY = new PublicKey(
    'D2hNpkGAJSJHEYw2Zs3DCH9hJbJNGvzotEx2KhnZNyR9'
);

export const validateTreasuryTopUpTarget = async (): Promise<void> => {
    if (getSolanaCluster() !== 'devnet') {
        return;
    }

    const accountInfo = await getConnection().getAccountInfo(REWARD_POOL_PUBKEY, 'confirmed');
    if (accountInfo) {
        return;
    }

    throw new Error(
        `The game treasury wallet ${REWARD_POOL_PUBKEY.toBase58()} is not activated on Solana Devnet yet. Open that wallet in Phantom on Devnet and airdrop some devnet SOL to it once, then try again.`,
    );
};

/**
 * Build an in-game wallet top-up: transfer SOL from player to the parent/treasury wallet.
 * User signs this once; backend (or on-chain verification) credits the in-game balance.
 */
export const buildTopUpTransaction = async (
    payer: PublicKey,
    amountSol: number,
): Promise<Transaction> => {
    await validateTreasuryTopUpTarget();
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

    // Attach recent blockhash with RPC fallback
    const { blockhash, lastValidBlockHeight } = await getLatestBlockhashWithFallback();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = payer;

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

    // A treasury payout cannot be signed from the client with only the treasury public key.
    // This remains a placeholder until rewards are sent by your backend or Anchor program.
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
