// Settle a round: report the outcome and (for wins) credit the payout.
//   POST { roundId, won, score } -> { result, payoutLamports, balanceLamports }
// Wins reported before the round timer could have elapsed are rejected;
// settles are idempotent (a resend reports the recorded outcome).
import {
    db,
    errorResponse,
    GRACE_SECS,
    json,
    MAX_SCORE,
    preflight,
    readBody,
    rpcErrorResponse,
    walletFromRequest,
} from '../_shared/mod.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
    const cors = preflight(req);
    if (cors) return cors;
    if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');

    const wallet = await walletFromRequest(req);
    if (!wallet) return errorResponse(401, 'unauthorized');

    const body = await readBody(req);
    const roundId = typeof body.roundId === 'string' ? body.roundId : '';
    const won = body.won === true;
    const score = typeof body.score === 'number' && Number.isSafeInteger(body.score)
        ? Math.min(Math.max(body.score, 0), MAX_SCORE)
        : 0;
    if (!UUID_RE.test(roundId)) return errorResponse(400, 'bad_request');

    const { data, error } = await db.rpc('fn_settle_round', {
        p_round: roundId,
        p_wallet: wallet,
        p_won: won,
        p_score: score,
        p_grace_secs: GRACE_SECS,
    });
    if (error) return rpcErrorResponse(error);

    const row = Array.isArray(data) ? data[0] : data;
    return json(200, {
        result: row?.result,
        payoutLamports: Number(row?.payout ?? 0),
        balanceLamports: Number(row?.balance ?? 0),
    });
});
