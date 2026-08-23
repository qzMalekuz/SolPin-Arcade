// Place a bet: deduct the stake and open a round, atomically.
//   POST { stakeLamports, duration, difficulty } -> { roundId, balanceLamports }
import {
    errorResponse,
    db,
    GRACE_SECS,
    json,
    MAX_ROUNDS_PER_HOUR,
    MAX_STAKE_LAMPORTS,
    MIN_STAKE_LAMPORTS,
    MULTIPLIER_TABLE,
    preflight,
    readBody,
    rpcErrorResponse,
    safePositiveInt,
    walletFromRequest,
} from '../_shared/mod.ts';

Deno.serve(async (req) => {
    const cors = preflight(req);
    if (cors) return cors;
    if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed');

    const wallet = await walletFromRequest(req);
    if (!wallet) return errorResponse(401, 'unauthorized');

    const body = await readBody(req);
    const stake = safePositiveInt(body.stakeLamports);
    const duration = safePositiveInt(body.duration);
    const difficulty = typeof body.difficulty === 'string' ? body.difficulty : '';

    // Multiplier comes from the server table, never from the client.
    const multiplier = duration ? MULTIPLIER_TABLE[String(duration)]?.[difficulty] : undefined;
    if (!stake || !multiplier) return errorResponse(400, 'bad_request');
    if (stake < MIN_STAKE_LAMPORTS || stake > MAX_STAKE_LAMPORTS) {
        return errorResponse(400, 'stake_out_of_range');
    }

    const { data, error } = await db.rpc('fn_place_bet', {
        p_wallet: wallet,
        p_stake: stake,
        p_multiplier: multiplier,
        p_duration: duration,
        p_difficulty: difficulty,
        p_grace_secs: GRACE_SECS,
        p_max_rounds_per_hour: MAX_ROUNDS_PER_HOUR,
    });
    if (error) return rpcErrorResponse(error);

    const row = Array.isArray(data) ? data[0] : data;
    return json(200, {
        roundId: row?.round_id,
        balanceLamports: Number(row?.balance ?? 0),
        multiplier,
    });
});
