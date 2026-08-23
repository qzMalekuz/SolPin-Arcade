-- fn_place_bet, fn_settle_round, and the state function all look up a
-- wallet's ACTIVE rounds; rounds_wallet_idx (wallet, started_at) makes those
-- scans grow with the wallet's full round history while fn_place_bet holds
-- the players row lock. Partial index keeps them O(active rounds) = O(1).
create index if not exists rounds_active_idx
    on public.rounds (wallet)
    where status = 'active';
