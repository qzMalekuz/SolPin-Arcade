import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import { PublicKey, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';

const PHANTOM_BASE = 'https://phantom.app/ul/';
const PHANTOM_CONNECT = 'v1/connect';
const PHANTOM_SIGN_AND_SEND = 'v1/signAndSendTransaction';
const PHANTOM_DISCONNECT = 'v1/disconnect';
const PHANTOM_SESSION_STORAGE_KEY = 'phantom-session-mainnet';
const PHANTOM_CLUSTER = 'mainnet-beta';

type StoredPhantomSession = {
    dappPublicKey: string;
    dappSecretKey: string;
    phantomEncryptionPublicKey: string;
    session: string;
    walletPublicKey: string;
};

export interface PhantomSessionState {
    publicKey: PublicKey;
    session: string;
    walletName: 'Phantom';
}

const getRedirectUri = (path: string): string => Linking.createURL(path);

const getQueryParams = (url: string): Record<string, string> => {
    try {
        const parsed = new URL(url.replace('solpin://', 'https://solpin/'));
        const params: Record<string, string> = {};
        parsed.searchParams.forEach((value, key) => {
            params[key] = value;
        });
        return params;
    } catch {
        const parsed = Linking.parse(url);
        return (parsed.queryParams ?? {}) as Record<string, string>;
    }
};

let dappKeyPair: nacl.BoxKeyPair | null = null;
let phantomEncryptionPublicKey: Uint8Array | null = null;

const setDappKeyPair = (publicKey: string, secretKey: string): void => {
    dappKeyPair = {
        publicKey: bs58.decode(publicKey),
        secretKey: bs58.decode(secretKey),
    };
};

const getDappKeyPair = (): nacl.BoxKeyPair => {
    if (!dappKeyPair) {
        dappKeyPair = nacl.box.keyPair();
    }

    return dappKeyPair;
};

const saveSession = async (
    session: StoredPhantomSession,
): Promise<void> => {
    await AsyncStorage.setItem(PHANTOM_SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const clearPhantomSession = async (): Promise<void> => {
    dappKeyPair = null;
    phantomEncryptionPublicKey = null;
    await AsyncStorage.removeItem(PHANTOM_SESSION_STORAGE_KEY);
};

export const hydratePhantomSession = async (): Promise<PhantomSessionState | null> => {
    const storedValue = await AsyncStorage.getItem(PHANTOM_SESSION_STORAGE_KEY);
    if (!storedValue) {
        return null;
    }

    try {
        const parsed = JSON.parse(storedValue) as StoredPhantomSession;
        setDappKeyPair(parsed.dappPublicKey, parsed.dappSecretKey);
        phantomEncryptionPublicKey = parsed.phantomEncryptionPublicKey
            ? bs58.decode(parsed.phantomEncryptionPublicKey)
            : null;

        if (!parsed.phantomEncryptionPublicKey || !parsed.session || !parsed.walletPublicKey) {
            return null;
        }

        return {
            publicKey: new PublicKey(parsed.walletPublicKey),
            session: parsed.session,
            walletName: 'Phantom',
        };
    } catch {
        await clearPhantomSession();
        return null;
    }
};

export const hasPhantomSession = (): boolean => {
    return Boolean(dappKeyPair && phantomEncryptionPublicKey);
};

const normalizePhantomError = (
    errorMessage?: string,
    fallback?: string,
): string => {
    const message = errorMessage?.trim().toLowerCase() ?? '';

    if (message.includes('reject') || message.includes('declin')) {
        return 'Connection request was cancelled in Phantom.';
    }

    if (message.includes('timeout')) {
        return 'Phantom did not respond in time. Please try again.';
    }

    if (message.includes('not installed')) {
        return 'Phantom is not installed on this device.';
    }

    return fallback ?? 'Phantom could not complete the request.';
};

export const getPhantomErrorMessage = (
    url: string,
    fallback?: string,
): string | null => {
    try {
        const params = getQueryParams(url);
        if (!params.errorCode && !params.errorMessage) {
            return null;
        }

        return normalizePhantomError(params.errorMessage, fallback);
    } catch {
        return fallback ?? 'Phantom could not complete the request.';
    }
};

export const buildConnectUrl = async (): Promise<string> => {
    const keyPair = getDappKeyPair();
    await saveSession({
        dappPublicKey: bs58.encode(keyPair.publicKey),
        dappSecretKey: bs58.encode(keyPair.secretKey),
        phantomEncryptionPublicKey: '',
        session: '',
        walletPublicKey: '',
    });

    const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(keyPair.publicKey),
        cluster: PHANTOM_CLUSTER,
        app_url: 'https://solpin.arcade',
        redirect_link: getRedirectUri('onConnect'),
    });

    return `${PHANTOM_BASE}${PHANTOM_CONNECT}?${params.toString()}`;
};

export const parseConnectResponse = async (
    url: string,
): Promise<PhantomSessionState | null> => {
    try {
        const params = getQueryParams(url);
        if (params.errorCode) {
            return null;
        }

        if (!params.phantom_encryption_public_key || !params.nonce || !params.data) {
            return null;
        }

        const phantomPublicKey = bs58.decode(params.phantom_encryption_public_key);
        const nonce = bs58.decode(params.nonce);
        const data = bs58.decode(params.data);
        const keyPair = getDappKeyPair();
        const decrypted = nacl.box.open(
            data,
            nonce,
            phantomPublicKey,
            keyPair.secretKey,
        );

        if (!decrypted) {
            return null;
        }

        phantomEncryptionPublicKey = phantomPublicKey;
        const payload = JSON.parse(Buffer.from(decrypted).toString('utf-8'));
        const publicKey = new PublicKey(payload.public_key);

        await saveSession({
            dappPublicKey: bs58.encode(keyPair.publicKey),
            dappSecretKey: bs58.encode(keyPair.secretKey),
            phantomEncryptionPublicKey: bs58.encode(phantomPublicKey),
            session: payload.session,
            walletPublicKey: publicKey.toBase58(),
        });

        return {
            publicKey,
            session: payload.session,
            walletName: 'Phantom',
        };
    } catch {
        return null;
    }
};

const encryptPayload = (payload: object): { nonce: string; payload: string } => {
    if (!phantomEncryptionPublicKey) {
        throw new Error('Phantom session is not available. Please reconnect your wallet.');
    }

    const keyPair = getDappKeyPair();
    const nonce = nacl.randomBytes(24);
    const encryptedPayload = nacl.box(
        Buffer.from(JSON.stringify(payload)),
        nonce,
        phantomEncryptionPublicKey,
        keyPair.secretKey,
    );

    return {
        nonce: bs58.encode(nonce),
        payload: bs58.encode(encryptedPayload),
    };
};

export const buildSignAndSendUrl = (
    transaction: Transaction,
    session: string,
): string => {
    const keyPair = getDappKeyPair();
    const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
    });

    const encrypted = encryptPayload({
        transaction: bs58.encode(serializedTransaction),
        session,
    });

    const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(keyPair.publicKey),
        nonce: encrypted.nonce,
        redirect_link: getRedirectUri('onSignAndSend'),
        payload: encrypted.payload,
    });

    return `${PHANTOM_BASE}${PHANTOM_SIGN_AND_SEND}?${params.toString()}`;
};

export const parseSignAndSendResponse = (
    url: string,
): { signature: string } | null => {
    try {
        if (!phantomEncryptionPublicKey) {
            return null;
        }

        const params = getQueryParams(url);
        if (params.errorCode) {
            return null;
        }

        if (!params.nonce || !params.data) {
            return null;
        }

        const nonce = bs58.decode(params.nonce);
        const data = bs58.decode(params.data);
        const keyPair = getDappKeyPair();
        const decrypted = nacl.box.open(
            data,
            nonce,
            phantomEncryptionPublicKey,
            keyPair.secretKey,
        );

        if (!decrypted) {
            return null;
        }

        const payload = JSON.parse(Buffer.from(decrypted).toString('utf-8'));
        return payload.signature ? { signature: payload.signature } : null;
    } catch {
        return null;
    }
};

export const getPhantomSignatureFromUrl = (url: string): string | null => {
    const result = parseSignAndSendResponse(url);
    return result?.signature ?? null;
};

export const buildDisconnectUrl = (session: string): string => {
    const keyPair = getDappKeyPair();
    const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(keyPair.publicKey),
        redirect_link: getRedirectUri('onDisconnect'),
        session,
    });

    return `${PHANTOM_BASE}${PHANTOM_DISCONNECT}?${params.toString()}`;
};

export const openPhantomLink = async (url: string): Promise<void> => {
    try {
        await Linking.openURL(url);
    } catch {
        throw new Error('Could not open Phantom. Install Phantom and try again.');
    }
};

export const truncateAddress = (address: string, chars = 4): string => {
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};
