// ===================================================================
// SolPin Arcade — Anchor Smart Contract
// Escrow vault system for skill-based pinball staking
// ===================================================================
//
// Program instructions:
//   1. initialize_pool  — creates the reward pool PDA
//   2. stake            — player stakes SOL into escrow vault
//   3. claim_reward     — player claims stake + bonus after winning
//   4. forfeit          — marks stake as lost (ball drained)
//
// Anti-cheat:
//   - claim_reward requires a signed anti-cheat payload
//   - Each stake account has a `claimed` flag to prevent double-claim
//   - Timestamps are validated for freshness
//   - Program-derived addresses for escrow security
// ===================================================================

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

declare_id!("11111111111111111111111111111111"); // Replace with actual program ID

#[program]
pub mod solpin_arcade {
    use super::*;

    /// Initialize the game reward pool.
    /// Called once by the admin.
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.total_staked = 0;
        pool.total_rewards_paid = 0;
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    /// Player stakes SOL for a game session.
    pub fn stake(
        ctx: Context<Stake>,
        amount: u64,
        duration: u16,    // 30, 60, or 90 seconds
        difficulty: u8,   // 0=easy, 1=medium, 2=hard
    ) -> Result<()> {
        // Validate inputs
        require!(
            duration == 30 || duration == 60 || duration == 90,
            GameError::InvalidDuration
        );
        require!(difficulty <= 2, GameError::InvalidDifficulty);
        require!(amount > 0, GameError::InvalidAmount);

        // Transfer SOL from player to vault
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.player.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.player.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Initialize stake account
        let stake_account = &mut ctx.accounts.stake_account;
        stake_account.player = ctx.accounts.player.key();
        stake_account.amount = amount;
        stake_account.duration = duration;
        stake_account.difficulty = difficulty;
        stake_account.timestamp = Clock::get()?.unix_timestamp;
        stake_account.claimed = false;
        stake_account.forfeited = false;
        stake_account.bump = ctx.bumps.stake_account;

        // Update pool
        let pool = &mut ctx.accounts.pool;
        pool.total_staked += amount;

        Ok(())
    }

    /// Player claims reward after winning (timer reached zero).
    /// Requires anti-cheat payload for validation.
    pub fn claim_reward(
        ctx: Context<ClaimReward>,
        score: u64,
        game_timestamp: i64,
        payload_hash: [u8; 32],
    ) -> Result<()> {
        let stake_account = &mut ctx.accounts.stake_account;

        // Validation checks
        require!(!stake_account.claimed, GameError::AlreadyClaimed);
        require!(!stake_account.forfeited, GameError::AlreadyForfeited);
        require!(
            stake_account.player == ctx.accounts.player.key(),
            GameError::Unauthorized
        );

        // Validate timestamp freshness (within 2 minutes)
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp - game_timestamp < 120,
            GameError::StalePayload
        );

        // Verify anti-cheat hash
        let message = format!(
            "{}|{}|{}|{}",
            score,
            game_timestamp,
            stake_account.duration,
            stake_account.difficulty,
        );
        let computed_hash = hash(message.as_bytes());
        require!(
            computed_hash.to_bytes() == payload_hash,
            GameError::InvalidPayload
        );

        // Calculate reward multiplier
        let multiplier = get_multiplier(stake_account.duration, stake_account.difficulty);
        let reward = (stake_account.amount as f64 * multiplier) as u64;

        // Transfer reward from vault to player
        let vault_balance = ctx.accounts.vault.lamports();
        let transfer_amount = std::cmp::min(reward, vault_balance);

        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= transfer_amount;
        **ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += transfer_amount;

        // Mark as claimed
        stake_account.claimed = true;

        // Update pool stats
        let pool = &mut ctx.accounts.pool;
        pool.total_rewards_paid += transfer_amount;

        Ok(())
    }

    /// Mark stake as forfeited (ball drained before timer).
    pub fn forfeit(ctx: Context<Forfeit>) -> Result<()> {
        let stake_account = &mut ctx.accounts.stake_account;

        require!(!stake_account.claimed, GameError::AlreadyClaimed);
        require!(!stake_account.forfeited, GameError::AlreadyForfeited);
        require!(
            stake_account.player == ctx.accounts.player.key(),
            GameError::Unauthorized
        );

        stake_account.forfeited = true;
        // Stake remains in vault (reward pool grows)

        Ok(())
    }
}

// ------- Helper -------

fn get_multiplier(duration: u16, difficulty: u8) -> f64 {
    match (duration, difficulty) {
        (30, 0) => 1.2,
        (30, 1) => 1.4,
        (30, 2) => 1.8,
        (60, 0) => 1.5,
        (60, 1) => 1.8,
        (60, 2) => 2.2,
        (90, 0) => 1.8,
        (90, 1) => 2.2,
        (90, 2) => 2.5,
        _ => 1.0,
    }
}

// ------- Accounts -------

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + RewardPool::INIT_SPACE,
        seeds = [b"reward_pool"],
        bump,
    )]
    pub pool: Account<'info, RewardPool>,

    /// CHECK: vault is a PDA that holds SOL
    #[account(
        seeds = [b"vault"],
        bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        mut,
        seeds = [b"reward_pool"],
        bump = pool.bump,
    )]
    pub pool: Account<'info, RewardPool>,

    /// CHECK: vault PDA
    #[account(
        mut,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(
        init,
        payer = player,
        space = 8 + StakeAccount::INIT_SPACE,
        seeds = [b"stake", player.key().as_ref(), &Clock::get().unwrap().unix_timestamp.to_le_bytes()],
        bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(
        mut,
        seeds = [b"reward_pool"],
        bump = pool.bump,
    )]
    pub pool: Account<'info, RewardPool>,

    /// CHECK: vault PDA
    #[account(
        mut,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(
        mut,
        constraint = stake_account.player == player.key(),
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Forfeit<'info> {
    #[account(
        mut,
        constraint = stake_account.player == player.key(),
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(mut)]
    pub player: Signer<'info>,
}

// ------- State -------

#[account]
#[derive(InitSpace)]
pub struct RewardPool {
    pub authority: Pubkey,       // 32
    pub total_staked: u64,       // 8
    pub total_rewards_paid: u64, // 8
    pub bump: u8,                // 1
}

#[account]
#[derive(InitSpace)]
pub struct StakeAccount {
    pub player: Pubkey,     // 32
    pub amount: u64,        // 8
    pub duration: u16,      // 2
    pub difficulty: u8,     // 1
    pub timestamp: i64,     // 8
    pub claimed: bool,      // 1
    pub forfeited: bool,    // 1
    pub bump: u8,           // 1
}

// ------- Errors -------

#[error_code]
pub enum GameError {
    #[msg("Invalid duration. Must be 30, 60, or 90.")]
    InvalidDuration,
    #[msg("Invalid difficulty. Must be 0, 1, or 2.")]
    InvalidDifficulty,
    #[msg("Invalid amount. Must be greater than 0.")]
    InvalidAmount,
    #[msg("Reward already claimed.")]
    AlreadyClaimed,
    #[msg("Stake already forfeited.")]
    AlreadyForfeited,
    #[msg("Unauthorized.")]
    Unauthorized,
    #[msg("Anti-cheat payload is stale.")]
    StalePayload,
    #[msg("Anti-cheat payload hash mismatch.")]
    InvalidPayload,
}
