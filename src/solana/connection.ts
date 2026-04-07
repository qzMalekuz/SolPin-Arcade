import { Connection, clusterApiUrl } from '@solana/web3.js';

export const SOLANA_CLUSTER = 'mainnet-beta' as const;

// Public RPC endpoints in priority order — first healthy one wins
const RPC_ENDPOINTS = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://rpc.ankr.com/solana',
];

export const SOLANA_RPC_URL = RPC_ENDPOINTS[0];

let connection: Connection | null = null;

export const getConnection = (): Connection => {
    if (!connection) {
        connection = new Connection(RPC_ENDPOINTS[0], {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 30000,
        });
    }
    return connection;
};

/** Try each RPC endpoint until one returns a valid blockhash */
export const getLatestBlockhashWithFallback = async () => {
    const errors: string[] = [];
    for (const url of RPC_ENDPOINTS) {
        try {
            const conn = new Connection(url, { commitment: 'confirmed', confirmTransactionInitialTimeout: 30000 });
            const result = await conn.getLatestBlockhash('confirmed');
            // Reuse this connection going forward if it works
            connection = conn;
            return result;
        } catch (e: any) {
            errors.push(`${url}: ${e?.message ?? 'unknown'}`);
        }
    }
    throw new Error(`All RPC endpoints failed:\n${errors.join('\n')}`);
};

export const getSolanaNetworkLabel = (): 'Mainnet' => 'Mainnet';
