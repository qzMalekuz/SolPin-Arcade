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
            const r = await fetch('https://price.jup.ag/v6/price?ids=SOL');
            const d = await r.json();
            const p = d.data.SOL.price as number;
            cache = { usd: p, ts: Date.now() };
            return p;
        } catch {
            return cache?.usd ?? 130;
        }
    }
};

export const solToUsd = (sol: number, price: number): number => sol * price;
export const usdToSol = (usd: number, price: number): number => usd / price;
