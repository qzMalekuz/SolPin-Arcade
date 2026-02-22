// Theme constants — Black & White Monotone

export const Colors = {
  // Backgrounds
  bg: '#0a0a0a',
  bgCard: '#141414',
  bgOverlay: 'rgba(10, 10, 10, 0.92)',

  // Monotone accent palette
  neonBlue: '#cccccc',
  neonPurple: '#aaaaaa',
  neonPink: '#999999',
  neonGreen: '#dddddd',
  neonYellow: '#eeeeee',
  neonOrange: '#bbbbbb',

  // Semantic
  primary: '#ffffff',
  secondary: '#aaaaaa',
  success: '#dddddd',
  danger: '#888888',
  warning: '#cccccc',

  // Text
  textPrimary: '#f0f0f0',
  textSecondary: '#999999',
  textMuted: '#555555',

  // Borders & glow
  border: '#222222',
  glowBlue: 'rgba(255, 255, 255, 0.15)',
  glowPurple: 'rgba(200, 200, 200, 0.12)',
  glowPink: 'rgba(180, 180, 180, 0.10)',
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
