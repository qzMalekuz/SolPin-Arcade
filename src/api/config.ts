import { IS_DEVNET } from '../store/networkStore';

// Supabase project config. Dashboard -> Project Settings -> API.
// The anon key is public by design — it can only read the leaderboard;
// all money paths verify a wallet signature server-side.

// Production project (mainnet). Used by release builds ONLY.
const PROD_SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const PROD_SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

// Test project (devnet: RPC_URL=https://api.devnet.solana.com, devnet
// treasury keypair in its secrets). Used by dev builds ONLY — keeps test
// rounds/balances out of the production ledger.
const DEV_SUPABASE_URL = 'https://odqxnorbvllfsufaneie.supabase.co';
const DEV_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kcXhub3JidmxsZnN1ZmFuZWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTM4NDUsImV4cCI6MjEwMjgyOTg0NX0.226qu5oSQm0zS0GsN4kU4VwDWhGRt2OQnCAe7ikeNsk';

export const SUPABASE_URL = IS_DEVNET ? DEV_SUPABASE_URL : PROD_SUPABASE_URL;
export const SUPABASE_ANON_KEY = IS_DEVNET ? DEV_SUPABASE_ANON_KEY : PROD_SUPABASE_ANON_KEY;

export const isBackendConfigured = (): boolean =>
    !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.startsWith('YOUR-');
