import { Connection, clusterApiUrl } from '@solana/web3.js';

export const SOLANA_CLUSTER = 'mainnet-beta' as const;
export const SOLANA_RPC_URL = clusterApiUrl(SOLANA_CLUSTER);

let connection: Connection | null = null;

export const getConnection = (): Connection => {
    if (!connection) {
        connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    }

    return connection;
};

export const getSolanaNetworkLabel = (): 'Mainnet' => 'Mainnet';
