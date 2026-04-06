/**
 * Mobile Wallet Adapter (MWA) 2.0 integration
 *
 * Provides standardized wallet connection for Android using the
 * solana-wallet:// URI scheme and Android Intent-based local association.
 *
 * Supports: authorize, reauthorize, signAndSendTransactions,
 *           signTransactions, signMessages, get_capabilities
 */

import { NativeModules, Platform } from 'react-native';
import type { Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {
    PublicKey,
    Transaction,
} from '@solana/web3.js';
import { getMwaCluster, getSolanaNetworkLabel } from './connection';


// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const APP_IDENTITY = {
    name: 'SolPin-Arcade',
    uri: 'https://solpin.arcade',
    icon: 'favicon.png',
};

const CLUSTER = getMwaCluster();
const REQUEST_TIMEOUT_MS = 45000;
const MWA_NATIVE_MODULE = 'SolanaMobileWalletAdapter';

// ------------------------------------------------------------------
// Platform check
// ------------------------------------------------------------------

/**
 * Check if MWA is available (Android only).
 * On iOS or web, this returns false and the app falls back to
 * Phantom deep links.
 */
export const isMWAAvailable = (): boolean => {
    if (Platform.OS !== 'android') {
        return false;
    }

    return Boolean((NativeModules as Record<string, unknown>)[MWA_NATIVE_MODULE]);
};

const getTransact = async () => {
    const mwa = await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
    return mwa.transact;
};

// ------------------------------------------------------------------
// AUTHORIZE — initial wallet connection
// ------------------------------------------------------------------

export interface MWAAuthResult {
    publicKey: PublicKey;
    authToken: string;
    walletName: string;
}

const withTimeout = async <T>(
    promise: Promise<T>,
    timeoutMessage: string,
): Promise<T> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(timeoutMessage));
                }, REQUEST_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
};

const getWalletName = (walletUriBase?: string): string => {
    if (!walletUriBase) {
        return 'Mobile Wallet';
    }

    try {
        return new URL(walletUriBase).hostname.replace(/^www\./, '');
    } catch {
        return walletUriBase;
    }
};

const normalizeMWAError = (
    error: unknown,
    action: 'connect' | 'reconnect' | 'disconnect' | 'sign',
): Error => {
    const rawMessage =
        error instanceof Error ? error.message.trim() : 'Unknown wallet error.';
    const normalizedMessage = rawMessage.toLowerCase();

    if (!isMWAAvailable()) {
        return new Error('Mobile Wallet Adapter is only available on supported Android devices.');
    }

    if (normalizedMessage.includes('declin') || normalizedMessage.includes('reject')) {
        return new Error(
            action === 'connect'
                ? 'Connection request was cancelled in your wallet.'
                : 'The wallet request was cancelled before it completed.',
        );
    }

    if (normalizedMessage.includes('timeout')) {
        return new Error('Wallet request timed out. Please reopen your wallet and try again.');
    }

    if (normalizedMessage.includes('not found') || normalizedMessage.includes('no wallet')) {
        return new Error('No compatible mobile wallet was found on this device.');
    }

    if (normalizedMessage.includes('cluster') || normalizedMessage.includes('chain')) {
        return new Error(
            `The wallet could not authorize on ${getSolanaNetworkLabel()}. Confirm the selected network matches your wallet.`,
        );
    }

    if (action === 'disconnect') {
        return new Error('Wallet disconnection could not be completed.');
    }

    if (action === 'reconnect') {
        return new Error('Wallet session expired. Please reconnect your wallet.');
    }

    if (action === 'sign') {
        return new Error('The wallet could not approve this request.');
    }

    return new Error('The wallet connection could not be completed.');
};

const authorizeWithWallet = async (
    wallet: Web3MobileWallet,
    authToken?: string,
) => {
    const authResult = await wallet.authorize({
        chain: `solana:${CLUSTER}`,
        identity: APP_IDENTITY,
        ...(authToken
            ? { auth_token: authToken }
            : {
                sign_in_payload: {
                    domain: 'solpin.arcade',
                    statement: 'Sign in to SolPin-Arcade',
                    uri: 'https://solpin.arcade',
                },
            }),
    });

    const account = authResult.accounts?.[0];
    if (!account?.address) {
        throw new Error('No wallet account was returned.');
    }

    return {
        publicKey: new PublicKey(account.address),
        authToken: authResult.auth_token,
        walletName: getWalletName(authResult.wallet_uri_base),
    };
};

/**
 * Open any MWA-compliant wallet (Phantom, Solflare, Backpack, etc.)
 * and request authorization with Sign in with Solana (SIWS).
 */
export const mwaAuthorize = async (): Promise<MWAAuthResult> => {
    if (!isMWAAvailable()) {
        throw normalizeMWAError(
            new Error('No compatible mobile wallet was found on this device.'),
            'connect',
        );
    }

    try {
        const transact = await getTransact();
        return await withTimeout(
            transact(async (wallet: Web3MobileWallet) => authorizeWithWallet(wallet)),
            'Wallet request timed out. Please try again.',
        );
    } catch (error) {
        throw normalizeMWAError(error, 'connect');
    }
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
    if (!isMWAAvailable()) {
        throw normalizeMWAError(
            new Error('No compatible mobile wallet was found on this device.'),
            'reconnect',
        );
    }

    try {
        const transact = await getTransact();
        return await withTimeout(
            transact(async (wallet: Web3MobileWallet) => authorizeWithWallet(wallet, authToken)),
            'Wallet session timed out. Please reconnect.',
        );
    } catch (error) {
        throw normalizeMWAError(error, 'reconnect');
    }
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
    if (!isMWAAvailable()) {
        throw normalizeMWAError(
            new Error('No compatible mobile wallet was found on this device.'),
            'sign',
        );
    }

    try {
        const transact = await getTransact();
        const signatures = await withTimeout(
            transact(async (wallet: Web3MobileWallet) => {
                await authorizeWithWallet(wallet, authToken);

                return wallet.signAndSendTransactions({
                    transactions,
                });
            }),
            'Wallet request timed out. Please try again.',
        );

        return signatures.map((sig) => {
            if (typeof sig === 'string') return sig;
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

            for (const byte of bytes) {
                if (byte === 0) result = '1' + result;
                else break;
            }

            return result || '1';
        });
    } catch (error) {
        throw normalizeMWAError(error, 'sign');
    }
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
    if (!isMWAAvailable()) {
        throw normalizeMWAError(
            new Error('No compatible mobile wallet was found on this device.'),
            'sign',
        );
    }

    try {
        const transact = await getTransact();
        return await withTimeout(
            transact(async (wallet: Web3MobileWallet) => {
                await authorizeWithWallet(wallet, authToken);

                return wallet.signTransactions({
                    transactions,
                });
            }),
            'Wallet request timed out. Please try again.',
        );
    } catch (error) {
        throw normalizeMWAError(error, 'sign');
    }
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
    if (!isMWAAvailable()) {
        throw normalizeMWAError(
            new Error('No compatible mobile wallet was found on this device.'),
            'sign',
        );
    }

    try {
        const transact = await getTransact();
        return await withTimeout(
            transact(async (wallet: Web3MobileWallet) => {
                await authorizeWithWallet(wallet, authToken);

                return wallet.signMessages({
                    addresses,
                    payloads: messages,
                });
            }),
            'Wallet request timed out. Please try again.',
        );
    } catch (error) {
        throw normalizeMWAError(error, 'sign');
    }
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
    if (!isMWAAvailable()) {
        return {
            supportsSignAndSendTransactions: false,
            supportsSignTransactions: false,
            supportsSignMessages: false,
            supportsCloneAuthorization: false,
            maxTransactionsPerRequest: 0,
            maxMessagesPerRequest: 0,
        };
    }

    let caps: any = null;

    try {
        const transact = await getTransact();
        caps = await withTimeout(
            transact(async (wallet: Web3MobileWallet) => {
                await authorizeWithWallet(wallet, authToken);

                try {
                    return await (wallet as any).getCapabilities();
                } catch {
                    return null;
                }
            }),
            'Wallet request timed out. Please try again.',
        );
    } catch {
        caps = null;
    }

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
    if (!isMWAAvailable()) {
        return;
    }

    try {
        const transact = await getTransact();
        await withTimeout(
            transact(async (wallet: Web3MobileWallet) => {
                await authorizeWithWallet(wallet, authToken);
                await (wallet as any).deauthorize({ auth_token: authToken });
            }),
            'Wallet request timed out. Please try again.',
        );
    } catch (error) {
        throw normalizeMWAError(error, 'disconnect');
    }
};
