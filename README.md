# 🎮 SolPin Arcade

A minimal, monochrome 2D pinball staking game built with **Expo + TypeScript + Solana**.

> Skill-based arcade staking on Solana Devnet — keep the ball alive, beat the timer, win rewards.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
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
| **Wallet** | Connect Phantom via deep link, view SOL balance |
| **Setup** | Select stake, duration, difficulty with descriptive cards |
| **Game** | Full HTML5 Canvas pinball table rendered in WebView |
| **Result** | Win/lose display with reward details |
| **Leaderboard** | Top player rankings |

---

## 🕹 Game Engine

The pinball engine is a self-contained HTML5 Canvas game rendered inside a `react-native-webview`. All physics, collision detection, rendering, and sound are handled in a single file (`PinballGame.ts`) that generates the complete HTML/JS.

### Physics

- **Custom 2D engine** — no external physics library
- **12 collision sub-steps** per frame (CCD) for stability
- **Circle-circle** collision for bumpers and corner vertices
- **Circle-segment** collision for walls with accumulated normal averaging
- **Wall restitution**: 0.9 | **Friction**: 0.02
- **Fixed gravity**: 0.42 (consistent across all difficulties)
- **Velocity clamping**: min floor (1.0) + max cap per difficulty
- **Anti-stuck detection**: 300ms threshold → impulse toward board center

### Board Elements

| Element | Type | Details |
|---------|------|---------|
| Outer walls | Line segments | 5° outward tilt, continuous rails |
| Gutters + funnel | Line segments | Angled slopes to drain |
| Slingshot triangles | 2 collision edges + 1 visual-only | Outward-facing edges only (no concave trap) |
| Corner vertices | Circles (r=8) | Rounded deflectors at wall junctions |
| Score bumpers | Circles | 300, 200×2, 100×2, 500, 150×2, 180×2, 120×2, 80×3 |
| Flippers | Rotating segments | Directional impulse, timed-hit bonus |
| Drain zone | Detection area | Skip flipper collision, increased gravity, zero restitution |

### Difficulty System

Physics are **identical** across all modes. Only geometry/speed differs:

| Parameter | Easy | Medium | Hard |
|-----------|------|--------|------|
| Flipper length | 64 | 58 | 52 |
| Max velocity | 17 | 19 | 21 |
| Flipper power | 15.5 | 14 | 12.5 |

### Scoring

- **Bumper hits**: 50–500 points per hit
- **Combo system**: consecutive hits chain up to 8x multiplier
- **Flipper bonus**: 30 points per active flipper hit
- **Timed hit**: +12% bonus if flipped within 80ms

### Multiplier Table

| Duration | Easy | Medium | Hard |
|----------|------|--------|------|
| 30s | 1.2x | 1.4x | 1.8x |
| 60s | 1.5x | 1.8x | 2.2x |
| 90s | 1.8x | 2.2x | 2.5x |

---

## 🔐 Solana Integration

### Wallet Connection

Uses **Phantom deep linking** (compatible with Expo Go):

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
├── src/
│   ├── components/
│   │   ├── NeonButton.tsx           # Arcade-style button
│   │   ├── NeonCard.tsx             # Card container
│   │   ├── GlowText.tsx            # Text with glow effect
│   │   └── AnimatedNumber.tsx       # Animated counting numbers
│   ├── screens/
│   │   ├── WalletScreen.tsx
│   │   ├── SetupScreen.tsx
│   │   ├── GameScreen.tsx
│   │   ├── ResultScreen.tsx
│   │   └── LeaderboardScreen.tsx
│   ├── game/
│   │   ├── PinballGame.ts           # ★ Full HTML5 Canvas engine
│   │   ├── physics.ts               # Vec2 math, collision helpers
│   │   ├── table.ts                 # Table geometry definitions
│   │   ├── engine.ts                # Game loop coordination
│   │   ├── scoring.ts               # Points, combos, multipliers
│   │   ├── PinballCanvas.tsx        # WebView wrapper
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
│   │   └── index.ts                 # Colors, spacing, config
│   └── utils/
│       └── audio.ts                 # Sound manager
└── anchor/
    └── programs/solpin/src/lib.rs   # Anchor smart contract
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 + React Native 0.81 |
| Language | TypeScript 5.9 |
| Game Engine | HTML5 Canvas in WebView |
| State | Zustand 5 |
| Navigation | React Navigation 7 |
| Animation | React Native Animated API |
| Blockchain | @solana/web3.js v1 |
| Wallet | Phantom deep linking |
| Smart Contract | Anchor (Rust) |
| Haptics | expo-haptics |
| Crypto | expo-crypto, tweetnacl |

---

## 🏗 Build & Deploy

### Expo Dev Build

```bash
npm install -g eas-cli
eas build:configure
eas build --platform android --profile preview
```

### Deploy Smart Contract

```bash
cd anchor
anchor build
anchor deploy --provider.cluster devnet
```

---

## 📄 License

MIT
