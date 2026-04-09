import { Connection } from '@solana/web3.js';
import {
    getSolanaNetworkLabel as getClusterLabel,
    type SupportedSolanaCluster,
} from '../store/networkStore';

const CONNECTION_CONFIG = {
    commitment: 'confirmed' as const,
    confirmTransactionInitialTimeout: 30000,
};

const RPC_ENDPOINTS: string[] = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://rpc.ankr.com/solana',
];

let cachedConnection: Connection | null = null;

export const getSolanaCluster = (): SupportedSolanaCluster => 'mainnet-beta';

export const getRpcEndpoints = (): string[] => RPC_ENDPOINTS;

export const SOLANA_RPC_URL = (): string => RPC_ENDPOINTS[0];

export const getConnection = (): Connection => {
    if (cachedConnection) {
        return cachedConnection;
    }

    cachedConnection = new Connection(RPC_ENDPOINTS[0], CONNECTION_CONFIG);
    return cachedConnection;
};

/** Try each RPC endpoint until one returns a valid blockhash */
export const getLatestBlockhashWithFallback = async () => {
    const errors: string[] = [];
    for (const url of RPC_ENDPOINTS) {
        try {
            const conn = new Connection(url, CONNECTION_CONFIG);
            const result = await conn.getLatestBlockhash('confirmed');
            cachedConnection = conn;
            return result;
        } catch (e: any) {
            errors.push(`${url}: ${e?.message ?? 'unknown'}`);
        }
    }
    throw new Error(`All mainnet RPC endpoints failed:\n${errors.join('\n')}`);
};

export const getSolanaNetworkLabel = (): 'Mainnet' => getClusterLabel();
