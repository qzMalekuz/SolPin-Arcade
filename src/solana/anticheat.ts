import * as Crypto from 'expo-crypto';
import { Difficulty, Duration } from '../theme';

/**
 * Anti-cheat payload that gets sent to the smart contract
 * during claim_reward to verify the game result server-side.
 */
export interface AntiCheatPayload {
    score: number;
    timestamp: number;
    duration: Duration;
    difficulty: Difficulty;
    seed: string;
    hash: string;
}

/**
 * Generate a random seed for this game session.
 * Used as part of the anti-cheat hash.
 */
export const generateGameSeed = async (): Promise<string> => {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    return Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
};

/**
 * Build a signed anti-cheat payload.
 *
 * The hash is a SHA-256 digest of: score|timestamp|duration|difficulty|seed
 *
 * On-chain, the program re-computes this hash and verifies it matches.
 * In a real system you would use an ed25519 signature from a
 * game-authority keypair to make it tamper-proof.
 */
export const buildAntiCheatPayload = async (
    score: number,
    duration: Duration,
    difficulty: Difficulty,
    seed: string,
): Promise<AntiCheatPayload> => {
    const timestamp = Date.now();

    const message = `${score}|${timestamp}|${duration}|${difficulty}|${seed}`;
    const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        message,
    );

    return {
        score,
        timestamp,
        duration,
        difficulty,
        seed,
        hash,
    };
};

/**
 * Validate that a claim is being made within an acceptable time window.
 * Prevents delayed replay attacks.
 */
export const isPayloadFresh = (
    payload: AntiCheatPayload,
    maxAgeMs = 120_000, // 2 minutes
): boolean => {
    return Date.now() - payload.timestamp < maxAgeMs;
};
