/**
 * Mobile Wallet Adapter (MWA) 2.0 integration
 *
 * Provides standardized wallet connection for Android using the
 * solana-wallet:// URI scheme and Android Intent-based local association.
 *
 * Supports: authorize, reauthorize, signAndSendTransactions,
 *           signTransactions, signMessages, get_capabilities
 */

import { Platform } from 'react-native';
import {
    transact,
    Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {
    PublicKey,
    Transaction,
} from '@solana/web3.js';


// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const APP_IDENTITY = {
    name: 'SolPin-Arcade',
    uri: 'https://solpin.arcade',
    icon: 'favicon.png',
};

const CLUSTER = 'devnet' as const;

const AUTH_TOKEN_KEY = 'mwa_auth_token';

// ------------------------------------------------------------------
// Platform check
// ------------------------------------------------------------------

/**
 * Check if MWA is available (Android only).
 * On iOS or web, this returns false and the app falls back to
 * Phantom deep links.
 */
export const isMWAAvailable = (): boolean => {
    return Platform.OS === 'android';
};

// ------------------------------------------------------------------
// AUTHORIZE — initial wallet connection
// ------------------------------------------------------------------

export interface MWAAuthResult {
    publicKey: PublicKey;
    authToken: string;
    walletName: string;
}

/**
 * Open any MWA-compliant wallet (Phantom, Solflare, Backpack, etc.)
 * and request authorization with Sign in with Solana (SIWS).
 */
export const mwaAuthorize = async (): Promise<MWAAuthResult> => {
    const result = await transact(async (wallet: Web3MobileWallet) => {
        const authResult = await wallet.authorize({
            chain: `solana:${CLUSTER}`,
            identity: APP_IDENTITY,
            sign_in_payload: {
                domain: 'solpin.arcade',
                statement: 'Sign in to SolPin-Arcade',
                uri: 'https://solpin.arcade',
            },
        });

        return {
            publicKey: new PublicKey(authResult.accounts[0].address),
            authToken: authResult.auth_token,
            walletName: authResult.wallet_uri_base ?? 'Unknown Wallet',
        };
    });

    return result;
};

// ------------------------------------------------------------------
// REAUTHORIZE — reconnect with stored auth token
// ------------------------------------------------------------------

/**
 * Attempt to silently reauthorize using a previously stored auth token.
 * This avoids prompting the user again if the wallet remembers the dApp.
 */
export const mwaReauthorize = async (
    authToken: string,
): Promise<MWAAuthResult> => {
    const result = await transact(async (wallet: Web3MobileWallet) => {
        const authResult = await wallet.authorize({
            chain: `solana:${CLUSTER}`,
            identity: APP_IDENTITY,
            auth_token: authToken,
        });

        return {
            publicKey: new PublicKey(authResult.accounts[0].address),
            authToken: authResult.auth_token,
            walletName: authResult.wallet_uri_base ?? 'Unknown Wallet',
        };
    });

    return result;
};

// ------------------------------------------------------------------
// SIGN AND SEND TRANSACTIONS
// ------------------------------------------------------------------

/**
 * Signs and sends one or more transactions via the connected wallet.
 * Returns an array of transaction signatures (base58).
 */
export const mwaSignAndSendTransactions = async (
    transactions: Transaction[],
    authToken: string,
): Promise<string[]> => {

    const signatures = await transact(async (wallet: Web3MobileWallet) => {
        // Reauthorize within the same session
        await wallet.authorize({
            chain: `solana:${CLUSTER}`,
            identity: APP_IDENTITY,
            auth_token: authToken,
        });

        const sigs = await wallet.signAndSendTransactions({
            transactions,
        });

        return sigs;
    });

    // Convert Uint8Array signatures to base58 strings
    return signatures.map((sig) => {
        if (typeof sig === 'string') return sig;
        // Convert byte array to base58
        const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let result = '';
        const bytes = new Uint8Array(sig);
        let num = BigInt(0);
        for (const byte of bytes) {
            num = num * BigInt(256) + BigInt(byte);
        }
        while (num > BigInt(0)) {
            const remainder = Number(num % BigInt(58));
            num = num / BigInt(58);
            result = bs58Chars[remainder] + result;
        }
        // Handle leading zeros
        for (const byte of bytes) {
            if (byte === 0) result = '1' + result;
            else break;
        }
        return result || '1';
    });
};

// ------------------------------------------------------------------
// SIGN TRANSACTIONS (without sending)
// ------------------------------------------------------------------

/**
 * Signs transactions without broadcasting them.
 * Returns signed Transaction objects.
 */
export const mwaSignTransactions = async (
    transactions: Transaction[],
    authToken: string,
): Promise<Transaction[]> => {
    const signed = await transact(async (wallet: Web3MobileWallet) => {
        await wallet.authorize({
            chain: `solana:${CLUSTER}`,
            identity: APP_IDENTITY,
            auth_token: authToken,
        });

        const result = await wallet.signTransactions({
            transactions,
        });

        return result;
    });

    return signed;
};

// ------------------------------------------------------------------
// SIGN MESSAGES
// ------------------------------------------------------------------

/**
 * Signs arbitrary messages using the connected wallet.
 * Returns Uint8Array signatures.
 */
export const mwaSignMessages = async (
    messages: Uint8Array[],
    addresses: string[],
    authToken: string,
): Promise<Uint8Array[]> => {
    const signatures = await transact(async (wallet: Web3MobileWallet) => {
        await wallet.authorize({
            chain: `solana:${CLUSTER}`,
            identity: APP_IDENTITY,
            auth_token: authToken,
        });

        const result = await wallet.signMessages({
            addresses,
            payloads: messages,
        });

        return result;
    });

    return signatures;
};

// ------------------------------------------------------------------
// GET CAPABILITIES
// ------------------------------------------------------------------

export interface WalletCapabilities {
    supportsSignAndSendTransactions: boolean;
    supportsSignTransactions: boolean;
    supportsSignMessages: boolean;
    supportsCloneAuthorization: boolean;
    maxTransactionsPerRequest: number;
    maxMessagesPerRequest: number;
}

/**
 * Query the connected wallet's capabilities.
 * This is useful for adapting the UI based on what the wallet supports.
 */
export const mwaGetCapabilities = async (
    authToken: string,
): Promise<WalletCapabilities> => {
    const caps = await transact(async (wallet: Web3MobileWallet) => {
        await wallet.authorize({
            chain: `solana:${CLUSTER}`,
            identity: APP_IDENTITY,
            auth_token: authToken,
        });

        // get_capabilities may not be supported by all wallets
        try {
            const result = await (wallet as any).getCapabilities();
            return result;
        } catch {
            // Return defaults if not supported
            return null;
        }
    });

    return {
        supportsSignAndSendTransactions: caps?.supports_sign_and_send_transactions ?? true,
        supportsSignTransactions: caps?.supports_sign_transactions ?? true,
        supportsSignMessages: caps?.supports_sign_messages ?? true,
        supportsCloneAuthorization: caps?.supports_clone_authorization ?? false,
        maxTransactionsPerRequest: caps?.max_transactions_per_request ?? 1,
        maxMessagesPerRequest: caps?.max_messages_per_request ?? 1,
    };
};

// ------------------------------------------------------------------
// DEAUTHORIZE
// ------------------------------------------------------------------

/**
 * Deauthorize the current session with the wallet.
 */
export const mwaDeauthorize = async (authToken: string): Promise<void> => {
    await transact(async (wallet: Web3MobileWallet) => {
        await wallet.authorize({
            chain: `solana:${CLUSTER}`,
            identity: APP_IDENTITY,
            auth_token: authToken,
        });

        await (wallet as any).deauthorize({ auth_token: authToken });
    });
};
