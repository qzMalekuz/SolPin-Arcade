// Theme constants for SolPin Arcade - Retro neon sci-fi

export const Colors = {
  // Backgrounds
  bg: '#0a0a1a',
  bgCard: '#111128',
  bgOverlay: 'rgba(10, 10, 26, 0.85)',

  // Neon accent palette
  neonBlue: '#00d4ff',
  neonPurple: '#b44aff',
  neonPink: '#ff2aff',
  neonGreen: '#00ff88',
  neonYellow: '#ffe14d',
  neonOrange: '#ff6b35',

  // Semantic
  primary: '#00d4ff',
  secondary: '#b44aff',
  success: '#00ff88',
  danger: '#ff4444',
  warning: '#ffe14d',

  // Text
  textPrimary: '#e8e8ff',
  textSecondary: '#8888aa',
  textMuted: '#555577',

  // Borders & glow
  border: '#222244',
  glowBlue: 'rgba(0, 212, 255, 0.4)',
  glowPurple: 'rgba(180, 74, 255, 0.4)',
  glowPink: 'rgba(255, 42, 255, 0.3)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSizes = {
  xs: 10,
  sm: 12,
  body: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  hero: 48,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 30,
  round: 9999,
} as const;

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
