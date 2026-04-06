import { Connection, clusterApiUrl } from '@solana/web3.js';

export type WalletNetwork = 'devnet' | 'mainnet-beta';

const DEFAULT_NETWORK: WalletNetwork = 'devnet';
const CUSTOM_RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL?.trim();

const normalizeNetwork = (value?: string): WalletNetwork => {
    switch (value?.trim().toLowerCase()) {
        case 'mainnet':
        case 'mainnet-beta':
        case 'mainnetbeta':
            return 'mainnet-beta';
        case 'devnet':
        default:
            return DEFAULT_NETWORK;
    }
};

const ACTIVE_NETWORK = normalizeNetwork(process.env.EXPO_PUBLIC_SOLANA_NETWORK);

export const DEVNET_RPC = clusterApiUrl('devnet');
export const MAINNET_RPC = clusterApiUrl('mainnet-beta');

const connectionCache = new Map<string, Connection>();

export const getSolanaNetwork = (): WalletNetwork => ACTIVE_NETWORK;

export const getSolanaNetworkLabel = (
    network: WalletNetwork = ACTIVE_NETWORK,
): 'Devnet' | 'Mainnet' => {
    return network === 'mainnet-beta' ? 'Mainnet' : 'Devnet';
};

export const getPhantomCluster = (
    network: WalletNetwork = ACTIVE_NETWORK,
): WalletNetwork => {
    return network;
};

export const getMwaCluster = (
    network: WalletNetwork = ACTIVE_NETWORK,
): 'devnet' | 'mainnet' => {
    return network === 'mainnet-beta' ? 'mainnet' : 'devnet';
};

export const getRpcUrl = (
    network: WalletNetwork = ACTIVE_NETWORK,
): string => {
    if (CUSTOM_RPC_URL && network === ACTIVE_NETWORK) {
        return CUSTOM_RPC_URL;
    }

    return network === 'mainnet-beta' ? MAINNET_RPC : DEVNET_RPC;
};

export const getConnection = (
    network: WalletNetwork = ACTIVE_NETWORK,
): Connection => {
    const rpcUrl = getRpcUrl(network);
    const cacheKey = `${network}:${rpcUrl}`;
    const existingConnection = connectionCache.get(cacheKey);

    if (existingConnection) {
        return existingConnection;
    }

    const connection = new Connection(rpcUrl, 'confirmed');
    connectionCache.set(cacheKey, connection);
    return connection;
};

export const resetConnection = (): void => {
    connectionCache.clear();
};
