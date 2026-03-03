// Theme constants — Refined Monochrome Design System

// ──── COLORS ────
export const Colors = {
  // Backgrounds
  bg: '#0a0a0a',
  bgCard: '#131313',
  bgElevated: '#1a1a1a',
  bgOverlay: 'rgba(10, 10, 10, 0.92)',
  bgSubtle: 'rgba(255, 255, 255, 0.04)',
  bgSelected: 'rgba(255, 255, 255, 0.08)',

  // Monotone accent palette
  neonBlue: '#d0d0d0',
  neonPurple: '#b0b0b0',
  neonPink: '#a0a0a0',
  neonGreen: '#e0e0e0',
  neonYellow: '#f0f0f0',
  neonOrange: '#c0c0c0',

  // Semantic
  primary: '#ffffff',
  secondary: '#aaaaaa',
  success: '#e0e0e0',
  danger: '#888888',
  warning: '#cccccc',

  // Text
  textPrimary: '#f2f2f2',
  textSecondary: '#999999',
  textMuted: '#555555',
  textCaption: '#666666',

  // Borders & glow (reduced intensity)
  border: '#1e1e1e',
  borderLight: 'rgba(255, 255, 255, 0.06)',
  glowBlue: 'rgba(255, 255, 255, 0.08)',
  glowPurple: 'rgba(200, 200, 200, 0.06)',
  glowPink: 'rgba(180, 180, 180, 0.05)',
} as const;

// ──── SPACING (8pt grid) ────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ──── FONT SIZES ────
export const FontSizes = {
  xs: 10,
  sm: 12,
  body: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  hero: 44,
} as const;

// ──── BORDER RADIUS ────
export const BorderRadius = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 30,
  round: 9999,
} as const;

// ──── ANIMATION CONSTANTS ────
export const Animations = {
  fast: 150,
  normal: 250,
  smooth: 350,
  slow: 500,
  stagger: 60,
  springConfig: { tension: 300, friction: 20, useNativeDriver: true },
} as const;

// ──── SHADOW PRESETS ────
export const Shadows = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  glow: (color: string, intensity: number = 0.12) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: intensity,
    shadowRadius: 10,
    elevation: 4,
  }),
} as const;

// ──── BUTTON SIZES ────
export const ButtonSizes = {
  sm: { height: 40, paddingHorizontal: 16 },
  md: { height: 48, paddingHorizontal: 24 },
  lg: { height: 56, paddingHorizontal: 32 },
} as const;

// ──── GAME CONSTANTS ────
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Duration = 30 | 60 | 90;

export const MULTIPLIER_TABLE: Record<Duration, Record<Difficulty, number>> = {
  30: { easy: 1.2, medium: 1.4, hard: 1.8 },
  60: { easy: 1.5, medium: 1.8, hard: 2.2 },
  90: { easy: 1.8, medium: 2.2, hard: 2.5 },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const DURATION_OPTIONS: Duration[] = [30, 60, 90];
