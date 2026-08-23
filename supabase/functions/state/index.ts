// Player state: balance, active round, and recent history.
//   GET -> { balanceLamports, activeRound, history }
import {
    db,
    errorResponse,
    json,
    preflight,
    walletFromRequest,
} from '../_shared/mod.ts';
import { reconcileProcessingWithdrawals } from '../_shared/reconcile.ts';

interface HistoryEntry {
    type: 'TOP_UP' | 'WIN' | 'LOSS' | 'WITHDRAWAL';
    lamports: number;
    sig: string | null;
    status: 'pending' | 'completed' | 'failed';
    ts: number;
}

Deno.serve(async (req) => {
    const cors = preflight(req);
    if (cors) return cors;

    const wallet = await walletFromRequest(req);
    if (!wallet) return errorResponse(401, 'unauthorized');

    // Heal any interrupted withdrawal before reporting balances.
    await reconcileProcessingWithdrawals(wallet);

    const [player, topups, rounds, withdrawals, activeRound] = await Promise.all([
        db.from('players').select('lamports').eq('wallet', wallet).maybeSingle(),
        db.from('topups').select('sig, lamports, created_at')
            .eq('wallet', wallet).order('created_at', { ascending: false }).limit(25),
        db.from('rounds').select('stake_lamports, payout_lamports, status, settled_at')
            .eq('wallet', wallet).neq('status', 'active')
            .order('started_at', { ascending: false }).limit(50),
        db.from('withdrawals').select('lamports, status, tx_signature, created_at')
            .eq('wallet', wallet).order('created_at', { ascending: false }).limit(25),
        db.from('rounds').select('id, stake_lamports, multiplier, duration_secs, difficulty, started_at')
            .eq('wallet', wallet).eq('status', 'active').maybeSingle(),
    ]);

    const history: HistoryEntry[] = [];

    for (const t of topups.data ?? []) {
        history.push({
            type: 'TOP_UP',
            lamports: Number(t.lamports),
            sig: t.sig,
            status: 'completed',
            ts: new Date(t.created_at).getTime(),
        });
    }
    for (const r of rounds.data ?? []) {
        const won = r.status === 'won';
        history.push({
            type: won ? 'WIN' : 'LOSS',
            lamports: won ? Number(r.payout_lamports) : Number(r.stake_lamports),
            sig: null,
            status: 'completed',
            ts: r.settled_at ? new Date(r.settled_at).getTime() : Date.now(),
        });
    }
    for (const w of withdrawals.data ?? []) {
        history.push({
            type: 'WITHDRAWAL',
            lamports: Number(w.lamports),
            sig: w.tx_signature,
            status: w.status === 'sent' ? 'completed' : w.status === 'failed' ? 'failed' : 'pending',
            ts: new Date(w.created_at).getTime(),
        });
    }

    history.sort((a, b) => b.ts - a.ts);

    return json(200, {
        wallet,
        balanceLamports: Number(player.data?.lamports ?? 0),
        activeRound: activeRound.data
            ? {
                id: activeRound.data.id,
                stakeLamports: Number(activeRound.data.stake_lamports),
                multiplier: Number(activeRound.data.multiplier),
                duration: activeRound.data.duration_secs,
                difficulty: activeRound.data.difficulty,
                startedAt: new Date(activeRound.data.started_at).getTime(),
            }
            : null,
        history: history.slice(0, 50),
    });
});
