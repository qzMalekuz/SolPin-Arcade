import { Connection, clusterApiUrl } from '@solana/web3.js';
import {
    getSolanaNetworkLabel as getClusterLabel,
    type SupportedSolanaCluster,
    useNetworkStore,
} from '../store/networkStore';

const CONNECTION_CONFIG = {
    commitment: 'confirmed' as const,
    confirmTransactionInitialTimeout: 30000,
};

const RPC_ENDPOINTS: Record<SupportedSolanaCluster, string[]> = {
    'mainnet-beta': [
        'https://api.mainnet-beta.solana.com',
        'https://solana-mainnet.rpc.extrnode.com',
        'https://rpc.ankr.com/solana',
    ],
    devnet: [
        clusterApiUrl('devnet'),
        'https://rpc.ankr.com/solana_devnet',
    ],
};

const connections = new Map<SupportedSolanaCluster, Connection>();

export const getSolanaCluster = (): SupportedSolanaCluster =>
    useNetworkStore.getState().cluster;

export const getRpcEndpoints = (
    cluster: SupportedSolanaCluster = getSolanaCluster(),
): string[] => RPC_ENDPOINTS[cluster];

export const SOLANA_RPC_URL = (): string => getRpcEndpoints()[0];

export const getConnection = (
    cluster: SupportedSolanaCluster = getSolanaCluster(),
): Connection => {
    const cached = connections.get(cluster);
    if (cached) {
        return cached;
    }

    const connection = new Connection(getRpcEndpoints(cluster)[0], CONNECTION_CONFIG);
    connections.set(cluster, connection);
    return connection;
};

/** Try each RPC endpoint until one returns a valid blockhash */
export const getLatestBlockhashWithFallback = async (
    cluster: SupportedSolanaCluster = getSolanaCluster(),
) => {
    const errors: string[] = [];
    for (const url of getRpcEndpoints(cluster)) {
        try {
            const conn = new Connection(url, CONNECTION_CONFIG);
            const result = await conn.getLatestBlockhash('confirmed');
            connections.set(cluster, conn);
            return result;
        } catch (e: any) {
            errors.push(`${url}: ${e?.message ?? 'unknown'}`);
        }
    }
    throw new Error(`All ${cluster} RPC endpoints failed:\n${errors.join('\n')}`);
};

export const getSolanaNetworkLabel = (): 'Mainnet' | 'Devnet' =>
    getClusterLabel(getSolanaCluster());
