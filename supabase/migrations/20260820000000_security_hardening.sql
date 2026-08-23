-- Security hardening:
-- 1. Global (all-wallets) daily withdrawal ceiling — bounds total treasury
--    outflow per 24h no matter how many wallets an attacker controls.
-- 2. Per-IP throttle support for auth nonce issuance.

alter table public.auth_nonces add column ip text;
create index auth_nonces_ip_idx on public.auth_nonces (ip);

-- New parameter changes the signature: drop the old overload so PostgREST
-- can't be pointed at the un-capped version.
drop function public.fn_request_withdrawal(text, bigint, bigint, bigint);

create function public.fn_request_withdrawal(
    p_wallet text,
    p_lamports bigint,
    p_min bigint,
    p_daily_cap bigint,
    p_global_cap bigint
) returns table (withdrawal_id uuid, balance bigint)
language plpgsql as $$
declare
    v_player public.players%rowtype;
    v_sum bigint;
    v_count int;
    v_id uuid;
begin
    select * into v_player from public.players where wallet = p_wallet for update;
    if not found then
        raise exception 'unknown_wallet';
    end if;
    if v_player.banned then
        raise exception 'banned';
    end if;
    if p_lamports < p_min then
        raise exception 'below_minimum';
    end if;
    if v_player.lamports < p_lamports then
        raise exception 'insufficient_balance';
    end if;

    select count(*) into v_count
        from public.withdrawals where wallet = p_wallet and status = 'processing';
    if v_count > 0 then
        raise exception 'withdrawal_in_progress';
    end if;

    select coalesce(sum(lamports), 0) into v_sum
        from public.withdrawals
        where wallet = p_wallet
          and status <> 'failed'
          and created_at > now() - interval '24 hours';
    if v_sum + p_lamports > p_daily_cap then
        raise exception 'daily_cap_exceeded';
    end if;

    -- Global ceiling across ALL wallets: caps total bleed-out if the game
    -- economy is ever exploited at scale (many farmed wallets).
    select coalesce(sum(lamports), 0) into v_sum
        from public.withdrawals
        where status <> 'failed'
          and created_at > now() - interval '24 hours';
    if v_sum + p_lamports > p_global_cap then
        raise exception 'treasury_unavailable';
    end if;

    update public.players
        set lamports = lamports - p_lamports, updated_at = now()
        where wallet = p_wallet;

    insert into public.withdrawals (wallet, lamports)
        values (p_wallet, p_lamports)
        returning id into v_id;

    return query
        select v_id, pl.lamports from public.players pl where pl.wallet = p_wallet;
end
$$;

-- Same lockdown as init.sql: newly created functions default to EXECUTE
-- for public.
revoke execute on all functions in schema public from public, anon, authenticated;
