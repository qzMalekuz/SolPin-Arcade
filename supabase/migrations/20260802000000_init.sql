-- SolPin Arcade — server-side money ledger.
-- All money movement happens inside the SQL functions below, under row locks,
-- so no client (or crashed Edge Function) can leave the ledger inconsistent.

create table public.players (
    wallet text primary key,
    lamports bigint not null default 0 check (lamports >= 0),
    banned boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- One row per verified on-chain top-up. The primary key on the transaction
-- signature is the double-credit protection: a signature can credit once, ever.
create table public.topups (
    sig text primary key,
    wallet text not null references public.players(wallet),
    lamports bigint not null check (lamports > 0),
    created_at timestamptz not null default now()
);
create index topups_wallet_idx on public.topups (wallet, created_at desc);

create table public.rounds (
    id uuid primary key default gen_random_uuid(),
    wallet text not null references public.players(wallet),
    stake_lamports bigint not null check (stake_lamports > 0),
    multiplier numeric(6, 2) not null check (multiplier >= 1),
    duration_secs int not null check (duration_secs in (30, 45, 60)),
    difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
    status text not null default 'active' check (status in ('active', 'won', 'lost', 'expired')),
    score int,
    payout_lamports bigint not null default 0,
    started_at timestamptz not null default now(),
    settled_at timestamptz
);
create index rounds_wallet_idx on public.rounds (wallet, started_at desc);

create table public.withdrawals (
    id uuid primary key default gen_random_uuid(),
    wallet text not null references public.players(wallet),
    lamports bigint not null check (lamports > 0),
    status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
    tx_signature text unique,
    last_valid_block_height bigint,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index withdrawals_wallet_idx on public.withdrawals (wallet, created_at desc);

create table public.leaderboard (
    id uuid primary key default gen_random_uuid(),
    wallet text not null,
    score int not null check (score >= 0),
    duration_secs int not null,
    difficulty text not null,
    reward_lamports bigint not null default 0,
    created_at timestamptz not null default now()
);
create index leaderboard_score_idx on public.leaderboard (score desc);

create table public.auth_nonces (
    nonce text primary key,
    expires_at timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Access control: clients may read the leaderboard, nothing else.
-- Everything money-related goes through Edge Functions (service role).
-- ---------------------------------------------------------------------------
alter table public.players enable row level security;
alter table public.topups enable row level security;
alter table public.rounds enable row level security;
alter table public.withdrawals enable row level security;
alter table public.leaderboard enable row level security;
alter table public.auth_nonces enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.leaderboard to anon, authenticated;

create policy "leaderboard is public" on public.leaderboard
    for select using (true);

-- ---------------------------------------------------------------------------
-- Atomic money operations. Called only by Edge Functions with the service
-- role; EXECUTE is revoked from client roles below.
-- ---------------------------------------------------------------------------

create or replace function public.fn_credit_topup(
    p_wallet text,
    p_lamports bigint,
    p_sig text
) returns table (balance bigint, credited boolean)
language plpgsql as $$
declare
    v_inserted boolean;
begin
    if p_lamports <= 0 then
        raise exception 'invalid_amount';
    end if;

    insert into public.players (wallet) values (p_wallet)
        on conflict (wallet) do nothing;

    insert into public.topups (sig, wallet, lamports)
        values (p_sig, p_wallet, p_lamports)
        on conflict (sig) do nothing;
    v_inserted := found;

    if v_inserted then
        update public.players
            set lamports = lamports + p_lamports, updated_at = now()
            where wallet = p_wallet;
    end if;

    return query
        select pl.lamports, v_inserted from public.players pl where pl.wallet = p_wallet;
end
$$;

create or replace function public.fn_place_bet(
    p_wallet text,
    p_stake bigint,
    p_multiplier numeric,
    p_duration int,
    p_difficulty text,
    p_grace_secs int,
    p_max_rounds_per_hour int
) returns table (round_id uuid, balance bigint)
language plpgsql as $$
declare
    v_player public.players%rowtype;
    v_count int;
    v_round uuid;
begin
    select * into v_player from public.players where wallet = p_wallet for update;
    if not found then
        raise exception 'unknown_wallet';
    end if;
    if v_player.banned then
        raise exception 'banned';
    end if;

    -- Rounds abandoned past their grace window lapse as losses
    -- (the stake was deducted when the bet was placed).
    update public.rounds
        set status = 'expired', settled_at = now()
        where wallet = p_wallet
          and status = 'active'
          and started_at + make_interval(secs => duration_secs + p_grace_secs) < now();

    select count(*) into v_count
        from public.rounds where wallet = p_wallet and status = 'active';
    if v_count > 0 then
        raise exception 'round_active';
    end if;

    select count(*) into v_count
        from public.rounds
        where wallet = p_wallet and started_at > now() - interval '1 hour';
    if v_count >= p_max_rounds_per_hour then
        raise exception 'rate_limited';
    end if;

    if v_player.lamports < p_stake then
        raise exception 'insufficient_balance';
    end if;

    update public.players
        set lamports = lamports - p_stake, updated_at = now()
        where wallet = p_wallet;

    insert into public.rounds (wallet, stake_lamports, multiplier, duration_secs, difficulty)
        values (p_wallet, p_stake, p_multiplier, p_duration, p_difficulty)
        returning id into v_round;

    return query
        select v_round, pl.lamports from public.players pl where pl.wallet = p_wallet;
end
$$;

create or replace function public.fn_settle_round(
    p_round uuid,
    p_wallet text,
    p_won boolean,
    p_score int,
    p_grace_secs int
) returns table (result text, payout bigint, balance bigint)
language plpgsql as $$
declare
    v_round public.rounds%rowtype;
    v_payout bigint := 0;
    v_result text;
begin
    select * into v_round from public.rounds
        where id = p_round and wallet = p_wallet
        for update;
    if not found then
        raise exception 'round_not_found';
    end if;

    -- Idempotent: a re-sent settle reports the recorded outcome, never re-credits.
    if v_round.status <> 'active' then
        return query
            select v_round.status, v_round.payout_lamports, pl.lamports
            from public.players pl where pl.wallet = p_wallet;
        return;
    end if;

    if now() > v_round.started_at + make_interval(secs => v_round.duration_secs + p_grace_secs) then
        update public.rounds
            set status = 'expired', settled_at = now(), score = p_score
            where id = p_round;
        v_result := 'expired';
    elsif p_won then
        -- A win means the player survived the full timer: a win reported
        -- before the timer could possibly have elapsed is a forged result.
        if now() < v_round.started_at + make_interval(secs => v_round.duration_secs) then
            raise exception 'too_early';
        end if;
        v_payout := floor(v_round.stake_lamports * v_round.multiplier)::bigint;
        update public.players
            set lamports = lamports + v_payout, updated_at = now()
            where wallet = p_wallet;
        update public.rounds
            set status = 'won', settled_at = now(), score = p_score, payout_lamports = v_payout
            where id = p_round;
        insert into public.leaderboard (wallet, score, duration_secs, difficulty, reward_lamports)
            values (p_wallet, p_score, v_round.duration_secs, v_round.difficulty, v_payout);
        v_result := 'won';
    else
        update public.rounds
            set status = 'lost', settled_at = now(), score = p_score
            where id = p_round;
        v_result := 'lost';
    end if;

    return query
        select v_result, v_payout, pl.lamports from public.players pl where pl.wallet = p_wallet;
end
$$;

create or replace function public.fn_request_withdrawal(
    p_wallet text,
    p_lamports bigint,
    p_min bigint,
    p_daily_cap bigint
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

-- Write-ahead: the signed transaction's signature is recorded BEFORE it is
-- broadcast, so a crash mid-withdrawal can always be reconciled against the chain.
create or replace function public.fn_attach_withdrawal_sig(
    p_id uuid,
    p_sig text,
    p_last_valid_block_height bigint
) returns void
language plpgsql as $$
begin
    update public.withdrawals
        set tx_signature = p_sig,
            last_valid_block_height = p_last_valid_block_height,
            updated_at = now()
        where id = p_id and status = 'processing';
end
$$;

create or replace function public.fn_finalize_withdrawal(
    p_id uuid,
    p_success boolean
) returns void
language plpgsql as $$
declare
    v_w public.withdrawals%rowtype;
begin
    select * into v_w from public.withdrawals where id = p_id for update;
    if not found or v_w.status <> 'processing' then
        return; -- already finalized; never refund twice
    end if;

    if p_success then
        update public.withdrawals set status = 'sent', updated_at = now() where id = p_id;
    else
        update public.withdrawals set status = 'failed', updated_at = now() where id = p_id;
        update public.players
            set lamports = lamports + v_w.lamports, updated_at = now()
            where wallet = v_w.wallet;
    end if;
end
$$;

-- Postgres grants EXECUTE to public by default: without this revoke, anyone
-- with the anon key could call the money functions through PostgREST.
revoke execute on all functions in schema public from public, anon, authenticated;
