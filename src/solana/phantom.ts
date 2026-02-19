import * as Linking from 'expo-linking';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import {
    PublicKey,
    Transaction,
    Connection,
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import { DEVNET_RPC } from './connection';

// ------------------------------------------------------------------
// Phantom deep-link integration for Expo Go
// Docs: https://docs.phantom.app/phantom-deeplinks/provider/connect
// ------------------------------------------------------------------

const PHANTOM_SCHEME = 'phantom://';
const PHANTOM_CONNECT = 'v1/connect';
const PHANTOM_SIGN_AND_SEND = 'v1/signAndSendTransaction';
const PHANTOM_SIGN_TX = 'v1/signTransaction';
const PHANTOM_DISCONNECT = 'v1/disconnect';

/**
 * dApp keypair used for encryption between app and Phantom.
 * In production, persist this in SecureStore.
 */
let _dappKeyPair: nacl.BoxKeyPair | null = null;

export const getDappKeyPair = (): nacl.BoxKeyPair => {
    if (!_dappKeyPair) {
        _dappKeyPair = nacl.box.keyPair();
    }
    return _dappKeyPair;
};

/** Redirect base URL that Phantom will callback to */
const getRedirectUri = (path: string): string => {
    const base = Linking.createURL(path);
    return base;
};

// ------------------------------------------------------------------
// CONNECT
// ------------------------------------------------------------------
export interface PhantomConnectResult {
    publicKey: PublicKey;
    session: string;
}

/**
 * Opens Phantom to request wallet connection.
 * After approval Phantom redirects back with encrypted payload.
 */
export const buildConnectUrl = (): string => {
    const kp = getDappKeyPair();
    const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(kp.publicKey),
        cluster: 'devnet',
        app_url: 'https://solpin.arcade',
        redirect_link: getRedirectUri('onConnect'),
    });
    return `${PHANTOM_SCHEME}${PHANTOM_CONNECT}?${params.toString()}`;
};

/**
 * Parse the redirect URL that Phantom sends back after connect.
 */
export const parseConnectResponse = (
    url: string
): PhantomConnectResult | null => {
    try {
        const parsed = Linking.parse(url);
        const params = parsed.queryParams as Record<string, string>;

        if (params.errorCode) {
            console.warn('Phantom connect error:', params.errorMessage);
            return null;
        }

        const phantomPubKey = bs58.decode(params.phantom_encryption_public_key);
        const nonce = bs58.decode(params.nonce);
        const encryptedData = bs58.decode(params.data);

        const kp = getDappKeyPair();
        const decrypted = nacl.box.open(encryptedData, nonce, phantomPubKey, kp.secretKey);
        if (!decrypted) {
            console.warn('Failed to decrypt Phantom connect payload');
            return null;
        }

        const payload = JSON.parse(Buffer.from(decrypted).toString('utf-8'));

        return {
            publicKey: new PublicKey(payload.public_key),
            session: payload.session,
        };
    } catch (err) {
        console.warn('parseConnectResponse error:', err);
        return null;
    }
};

// ------------------------------------------------------------------
// SIGN AND SEND TRANSACTION
// ------------------------------------------------------------------

/**
 * Build URL to send a transaction to Phantom for signing + sending.
 */
export const buildSignAndSendUrl = (
    transaction: Transaction,
    session: string,
): string => {
    const kp = getDappKeyPair();
    // We need the phantom public key from the session - store it during connect
    // For now, serialize the transaction
    const serialized = transaction.serialize({
        requireAllSignatures: false,
    });

    const payload = {
        transaction: bs58.encode(serialized),
        session,
    };

    const payloadStr = JSON.stringify(payload);

    const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(kp.publicKey),
        redirect_link: getRedirectUri('onSignAndSend'),
        // For simplicity in dev, send unencrypted payload:
        payload: bs58.encode(Buffer.from(payloadStr)),
    });

    return `${PHANTOM_SCHEME}${PHANTOM_SIGN_AND_SEND}?${params.toString()}`;
};

/**
 * Simplified: Build a URL that transfers SOL as a basic stake representation.
 * In production, this would call the Anchor escrow program.
 */
export const buildSignTransactionUrl = (
    transaction: Transaction,
    session: string,
): string => {
    const serialized = transaction.serialize({
        requireAllSignatures: false,
    });

    const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(getDappKeyPair().publicKey),
        nonce: bs58.encode(nacl.randomBytes(24)),
        redirect_link: getRedirectUri('onSignTransaction'),
        transaction: bs58.encode(serialized),
        session,
    });

    return `${PHANTOM_SCHEME}${PHANTOM_SIGN_TX}?${params.toString()}`;
};

/**
 * Parse Phantom's response after signing and sending.
 */
export const parseSignAndSendResponse = (
    url: string
): { signature: string } | null => {
    try {
        const parsed = Linking.parse(url);
        const params = parsed.queryParams as Record<string, string>;

        if (params.errorCode) {
            console.warn('Phantom sign error:', params.errorMessage);
            return null;
        }

        return { signature: params.signature ?? '' };
    } catch (err) {
        console.warn('parseSignAndSendResponse error:', err);
        return null;
    }
};

// ------------------------------------------------------------------
// DISCONNECT
// ------------------------------------------------------------------
export const buildDisconnectUrl = (session: string): string => {
    const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(getDappKeyPair().publicKey),
        redirect_link: getRedirectUri('onDisconnect'),
        session,
    });
    return `${PHANTOM_SCHEME}${PHANTOM_DISCONNECT}?${params.toString()}`;
};

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
export const openPhantomLink = async (url: string): Promise<void> => {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
        await Linking.openURL(url);
    } else {
        throw new Error(
            'Phantom wallet is not installed. Please install it from the Play Store.'
        );
    }
};

/**
 * Truncate a wallet address for display: Ab3F…xY9z
 */
export const truncateAddress = (address: string, chars = 4): string => {
    return `${address.slice(0, chars)}…${address.slice(-chars)}`;
};
