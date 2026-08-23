import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
    transact,
    Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { IS_DEVNET } from '../store/networkStore';

// Mobile Wallet Adapter (MWA) — native wallet signing on Android.
// Covers the Seeker/Saga Seed Vault wallet plus Phantom, Solflare, etc.
// iOS has no MWA; the Phantom deeplink flow in ./phantom.ts is used there.

const AUTH_TOKEN_KEY = 'mwa-auth-token';
const PUBKEY_KEY = 'mwa-wallet-pubkey';
const LABEL_KEY = 'mwa-wallet-label';

const APP_IDENTITY = {
    name: 'SolPin Arcade',
    uri: 'https://solpin.arcade',
};

// MWA spec chain identifiers — NOT 'solana:mainnet-beta', which the adapter
// passes through unnormalized and wallets reject as an unknown chain.
// Devnet in dev builds only; release builds are always mainnet.
const MWA_CHAIN = IS_DEVNET ? 'solana:devnet' : 'solana:mainnet';

export const isMWASupported = (): boolean => Platform.OS === 'android';

export interface MWASession {
    publicKey: PublicKey;
    authToken: string;
    walletLabel: string;
}

// MWA returns account addresses base64-encoded, not base58
const addressToPublicKey = (address: string): PublicKey =>
    new PublicKey(new Uint8Array(Buffer.from(address, 'base64')));

const authorize = async (wallet: Web3MobileWallet): Promise<MWASession> => {
    const cached = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    let auth;
    try {
        auth = await wallet.authorize({
            identity: APP_IDENTITY,
            chain: MWA_CHAIN,
            auth_token: cached ?? undefined,
        });
    } catch (err) {
        // A revoked/rotated cached token can make the wallet reject the
        // reauthorization outright. Retry once as a fresh authorize so the
        // user isn't permanently locked out until they clear app data.
        if (!cached) throw err;
        await clearMWASession();
        auth = await wallet.authorize({
            identity: APP_IDENTITY,
            chain: MWA_CHAIN,
        });
    }

    const account = auth.accounts[0];
    if (!account) {
        throw new Error('Wallet did not return an account.');
    }

    const session: MWASession = {
        publicKey: addressToPublicKey(account.address),
        authToken: auth.auth_token,
        walletLabel: account.label ?? 'Mobile Wallet',
    };

    await AsyncStorage.multiSet([
        [AUTH_TOKEN_KEY, session.authToken],
        [PUBKEY_KEY, session.publicKey.toBase58()],
        [LABEL_KEY, session.walletLabel],
    ]);

    return session;
};

/** Open the system wallet chooser and authorize (or silently reauthorize). */
export const connectMWA = async (): Promise<MWASession> =>
    transact((wallet) => authorize(wallet));

/** Restore a previously authorized session without opening the wallet. */
export const hydrateMWASession = async (): Promise<MWASession | null> => {
    const [[, authToken], [, pubkey], [, label]] = await AsyncStorage.multiGet([
        AUTH_TOKEN_KEY,
        PUBKEY_KEY,
        LABEL_KEY,
    ]);
    if (!authToken || !pubkey) {
        return null;
    }
    try {
        return {
            publicKey: new PublicKey(pubkey),
            authToken,
            walletLabel: label ?? 'Mobile Wallet',
        };
    } catch {
        await clearMWASession();
        return null;
    }
};

export const clearMWASession = async (): Promise<void> => {
    await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, PUBKEY_KEY, LABEL_KEY]);
};

/**
 * Sign a transaction with the MWA wallet. Reauthorizes with the cached
 * auth token inside the same session, so the user only sees the sign prompt.
 * The signed transaction is returned for local verification before sending.
 */
export const signTransactionWithMWA = async (
    transaction: Transaction,
): Promise<{ signedTransaction: Transaction; publicKey: PublicKey }> =>
    transact(async (wallet) => {
        const session = await authorize(wallet);
        const [signedTransaction] = await wallet.signTransactions({
            transactions: [transaction],
        });
        return { signedTransaction, publicKey: session.publicKey };
    });

/**
 * Authorize (silently, via cached token, when possible) and sign a sign-in
 * message in one wallet session. Returns the signed payload base64-encoded
 * for server-side ed25519 verification.
 */
export const signInWithMWA = async (
    message: string,
): Promise<{ session: MWASession; signedPayloadB64: string }> =>
    transact(async (wallet) => {
        const session = await authorize(wallet);
        const [signed] = await wallet.signMessages({
            addresses: [Buffer.from(session.publicKey.toBytes()).toString('base64')],
            payloads: [new Uint8Array(Buffer.from(message, 'utf8'))],
        });
        return {
            session,
            signedPayloadB64: Buffer.from(signed).toString('base64'),
        };
    });

export const disconnectMWA = async (): Promise<void> => {
    const authToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    if (authToken) {
        try {
            await transact(async (wallet) => {
                await wallet.deauthorize({ auth_token: authToken });
            });
        } catch {
            // Wallet unavailable — clearing local state is enough.
        }
    }
    await clearMWASession();
};
