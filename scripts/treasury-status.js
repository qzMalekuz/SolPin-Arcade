#!/usr/bin/env node
// Operator tool: shows what the treasury holds vs what it owes players,
// and therefore what is safe to sweep to cold storage.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   RPC_URL=<solana-rpc-url> \
//   TREASURY_ADDRESS=<treasury-pubkey> \
//   node scripts/treasury-status.js
//
// The service role key bypasses RLS — run this only from your own machine,
// never ship it in the app.
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const need = (key) => {
    const v = process.env[key];
    if (!v) { console.error(`Missing env: ${key}`); process.exit(1); }
    return v;
};

const SUPABASE_URL = need('SUPABASE_URL');
const SERVICE_KEY = need('SUPABASE_SERVICE_ROLE_KEY');
const RPC_URL = need('RPC_URL');
const TREASURY = need('TREASURY_ADDRESS');

const rest = async (path) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
    return res.json();
};

// ponytail: paginated full scan — fine for thousands of players; switch to a
// SQL aggregate function if the tables ever get big enough to feel it.
const sumColumn = async (table, column, filter = '') => {
    let total = 0n, from = 0;
    const page = 1000;
    for (;;) {
        const rows = await rest(`${table}?select=${column}${filter}&offset=${from}&limit=${page}`);
        for (const r of rows) total += BigInt(r[column]);
        if (rows.length < page) return total;
        from += page;
    }
};

const sol = (lamports) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);

(async () => {
    const conn = new Connection(RPC_URL, 'confirmed');
    const [treasuryLamports, liabilities, processing] = await Promise.all([
        conn.getBalance(new PublicKey(TREASURY)).then(BigInt),
        sumColumn('players', 'lamports'),
        sumColumn('withdrawals', 'lamports', '&status=eq.processing'),
    ]);

    const owed = liabilities + processing;
    const sweepable = treasuryLamports - owed;

    console.log(`Treasury (${TREASURY.slice(0, 6)}…${TREASURY.slice(-4)})`);
    console.log(`  on-chain balance:      ${sol(treasuryLamports)} SOL`);
    console.log(`  player balances owed:  ${sol(liabilities)} SOL`);
    console.log(`  withdrawals in flight: ${sol(processing)} SOL`);
    console.log(`  ------------------------------------------`);
    console.log(`  sweepable profit:      ${sol(sweepable)} SOL`);
    if (sweepable < 0n) {
        console.log('\n  WARNING: the treasury holds LESS than it owes players.');
        console.log('  Top up the float before players hit "treasury_unavailable".');
        process.exit(2);
    }
})().catch((e) => { console.error(e.message); process.exit(1); });
