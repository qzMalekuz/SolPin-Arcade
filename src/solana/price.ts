// SOL/USD price feed — CoinGecko primary, Jupiter fallback, cached 2 min
let cache: { usd: number; ts: number } | null = null;
const TTL = 2 * 60 * 1000;

export const getSolPrice = async (): Promise<number> => {
    if (cache && Date.now() - cache.ts < TTL) return cache.usd;

    try {
        const r = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        );
        const d = await r.json();
        const p = d.solana.usd as number;
        cache = { usd: p, ts: Date.now() };
        return p;
    } catch {
        try {
            // price.jup.ag was decommissioned — lite-api is the free replacement
            const SOL_MINT = 'So11111111111111111111111111111111111111112';
            const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`);
            const d = await r.json();
            const p = d[SOL_MINT].usdPrice as number;
            cache = { usd: p, ts: Date.now() };
            return p;
        } catch {
            return cache?.usd ?? 130;
        }
    }
};

export const solToUsd = (sol: number, price: number): number => sol * price;
export const usdToSol = (usd: number, price: number): number => usd / price;
