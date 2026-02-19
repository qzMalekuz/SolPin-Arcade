import { Connection, clusterApiUrl } from '@solana/web3.js';

export const DEVNET_RPC = clusterApiUrl('devnet');
export const MAINNET_RPC = clusterApiUrl('mainnet-beta');

let _connection: Connection | null = null;

export const getConnection = (isMainnet = false): Connection => {
    if (!_connection) {
        _connection = new Connection(
            isMainnet ? MAINNET_RPC : DEVNET_RPC,
            'confirmed'
        );
    }
    return _connection;
};

export const resetConnection = (): void => {
    _connection = null;
};
