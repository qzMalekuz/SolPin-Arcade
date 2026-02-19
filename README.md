# 🎮 SolPin Arcade

A retro-inspired 2D pinball staking game built with **Expo + TypeScript + Solana**.

> Skill-based arcade staking on Solana Devnet — keep the ball alive, beat the timer, win rewards.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **Expo CLI**: `npm install -g expo-cli`
- **Expo Go** app on your Android device
- **Phantom** wallet on your Android device (for wallet integration)

### Install & Run

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Scan the QR code with Expo Go on your Android device
```

### Devnet SOL

Get free Devnet SOL for testing:

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Airdrop to your Phantom wallet (switch Phantom to Devnet first)
solana airdrop 2 <YOUR_PHANTOM_DEVNET_ADDRESS> --url devnet
```

---

## 📱 App Screens

| Screen | Description |
|--------|-------------|
| **Wallet** | Connect Phantom via deep link, view balance |
| **Setup** | Select stake, duration, difficulty, preview multiplier |
| **Game** | Full pinball table with physics, flippers, bumpers |
| **Result** | Win/lose display with reward details |
| **Leaderboard** | Top player rankings |

---

## 🕹 Game Mechanics

- **Gravity physics** — difficulty-scaled (Easy: 800, Medium: 1100, Hard: 1400)
- **Flipper controls** — tap left/right half of screen
- **8 bumpers** — neon-colored, point values from 100-500
- **Combo system** — consecutive hits chain up to 5x multiplier
- **Timer** — survive until 0:00 to win
- **Score** — bumper hits + combo bonuses + survival ticks

### Multiplier Table

| Duration | Easy | Medium | Hard |
|----------|------|--------|------|
| 30s | 1.2x | 1.4x | 1.8x |
| 60s | 1.5x | 1.8x | 2.2x |
| 90s | 1.8x | 2.2x | 2.5x |

---

## 🔐 Solana Integration

### Wallet Connection

Uses **Phantom deep linking** (NOT Solana Mobile Stack) for Expo Go compatibility:

```
phantom://v1/connect?dapp_encryption_public_key=...&cluster=devnet&redirect_link=...
```

### Smart Contract (Anchor)

Located in `/anchor/programs/solpin/src/lib.rs`:

| Instruction | Description |
|-------------|-------------|
| `initialize_pool` | Create reward pool PDA (admin only) |
| `stake` | Transfer SOL to escrow vault |
| `claim_reward` | Claim stake + bonus (anti-cheat validated) |
| `forfeit` | Mark stake as lost |

### Anti-Cheat

- SHA-256 hashed payload: `score|timestamp|duration|difficulty|seed`
- Timestamp freshness check (2-minute window)
- Single-use `claimed` flag per stake account
- PDA-secured escrow vault

---

## 📂 Project Structure

```
├── App.tsx                          # Root navigator + polyfills
├── index.ts                         # Entry point
├── app.json                         # Expo config
├── src/
│   ├── components/
│   │   ├── NeonButton.tsx           # Glowing arcade button
│   │   ├── NeonCard.tsx             # Glowing card container
│   │   └── GlowText.tsx            # Neon text with shadow
│   ├── screens/
│   │   ├── WalletScreen.tsx
│   │   ├── SetupScreen.tsx
│   │   ├── GameScreen.tsx
│   │   ├── ResultScreen.tsx
│   │   └── LeaderboardScreen.tsx
│   ├── game/
│   │   ├── physics.ts               # Vec2 math, collision detection
│   │   ├── table.ts                 # Table geometry (walls, bumpers, flippers)
│   │   ├── engine.ts                # Game loop, physics stepping
│   │   ├── scoring.ts               # Points, combos, multipliers
│   │   ├── PinballCanvas.tsx        # View-based table renderer
│   │   └── FlipperControls.tsx      # Split-screen touch zones
│   ├── solana/
│   │   ├── phantom.ts               # Deep-link wallet integration
│   │   ├── connection.ts            # Devnet/Mainnet RPC
│   │   ├── transactions.ts          # Transaction builders
│   │   └── anticheat.ts             # Payload hashing & validation
│   ├── store/
│   │   ├── walletStore.ts           # Zustand wallet state
│   │   └── gameStore.ts             # Zustand game state
│   ├── theme/
│   │   └── index.ts                 # Colors, spacing, multiplier config
│   └── utils/
│       └── audio.ts                 # expo-av sound manager
└── anchor/
    ├── Anchor.toml
    └── programs/solpin/src/lib.rs    # Anchor smart contract
```

---

## 🏗 Build & Deploy

### Expo Dev Build (for Seeker phone)

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure build
eas build:configure

# Build Android APK
eas build --platform android --profile preview

# Build for production
eas build --platform android --profile production
```

### Deploy Smart Contract

```bash
cd anchor

# Build
anchor build

# Deploy to Devnet
anchor deploy --provider.cluster devnet

# Deploy to Mainnet
anchor deploy --provider.cluster mainnet-beta
```

### Mainnet Checklist

1. Update `DEVNET_RPC` → `MAINNET_RPC` in `src/solana/connection.ts`
2. Change `cluster: 'devnet'` → `cluster: 'mainnet-beta'` in `src/solana/phantom.ts`
3. Update `PROGRAM_ID` in `src/solana/transactions.ts` with deployed program ID
4. Update `Anchor.toml` with production program ID
5. Fund the reward pool vault PDA with SOL

---

## 🔄 Migration to Expo Dev Build (Seeker)

To run on the Solana Seeker phone with native modules:

1. Run `npx expo prebuild` to eject to bare workflow
2. Replace Phantom deep linking with **Solana Mobile Wallet Adapter**:
   ```bash
   npm install @solana-mobile/mobile-wallet-adapter-protocol
   ```
3. Enable Hermes + Proguard in `android/app/build.gradle`
4. Set `targetSdkVersion 34`
5. Build signed APK for Seeker dApp Store

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 + TypeScript |
| State | Zustand |
| Navigation | React Navigation 7 |
| Animation | React Native Reanimated |
| Blockchain | @solana/web3.js v1 |
| Wallet | Phantom deep linking |
| Smart Contract | Anchor (Rust) |
| Audio | expo-av |
| Crypto | expo-crypto, tweetnacl |

---

## 📄 License

MIT
