/**
 * ─────────────────────────────────────────────
 * RAI — DESIGN TOKENS (ported from web app/globals.css @theme)
 * Single source of truth for all colors. To retheme, change here only.
 * Never hardcode colors in components — always read from useTheme().
 * ─────────────────────────────────────────────
 */

export interface ThemeColors {
  // Brand / Primary
  primary: string;
  primaryHover: string;
  primarySubtle: string;
  primaryText: string;
  // Text
  text: string;
  textSubtle: string;
  textPlaceholder: string;
  textDisabled: string;
  textInverse: string;
  textLink: string;
  // Surfaces
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  surfaceOverlay: string;
  // Borders
  border: string;
  borderSubtle: string;
  borderFocus: string;
  // Status
  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  dangerSubtle: string;
  info: string;
  infoSubtle: string;
  // Ticket types
  epic: string;
  story: string;
  task: string;
  bug: string;
  // Priority
  priorityCritical: string;
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;
  priorityLowest: string;
  // Scrim / overlay backdrop
  backdrop: string;
}

export const lightColors: ThemeColors = {
  primary: '#0052CC',
  primaryHover: '#0065FF',
  primarySubtle: '#DEEBFF',
  primaryText: '#FFFFFF',

  text: '#172B4D',
  textSubtle: '#6B778C',
  textPlaceholder: '#97A0AF',
  textDisabled: '#C1C7D0',
  textInverse: '#FFFFFF',
  textLink: '#0052CC',

  surface: '#F4F5F7',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EBECF0',
  surfaceOverlay: '#FFFFFF',

  border: '#DFE1E6',
  borderSubtle: '#EBECF0',
  borderFocus: '#4C9AFF',

  success: '#36B37E',
  successSubtle: '#E3FCEF',
  warning: '#FFAB00',
  warningSubtle: '#FFFAE6',
  danger: '#DE350B',
  dangerSubtle: '#FFEBE6',
  info: '#0052CC',
  infoSubtle: '#DEEBFF',

  epic: '#6554C0',
  story: '#00B8D9',
  task: '#0052CC',
  bug: '#DE350B',

  priorityCritical: '#DE350B',
  priorityHigh: '#FF5630',
  priorityMedium: '#FFAB00',
  priorityLow: '#36B37E',
  priorityLowest: '#0065FF',

  backdrop: 'rgba(9, 30, 66, 0.54)',
};

export const darkColors: ThemeColors = {
  primary: '#4C9AFF',
  primaryHover: '#85B8FF',
  primarySubtle: '#0C2340',
  primaryText: '#FFFFFF',

  text: '#E6ECF2',
  textSubtle: '#8B96A5',
  textPlaceholder: '#55637A',
  textDisabled: '#3D4E63',
  textInverse: '#172B4D',
  textLink: '#4C9AFF',

  surface: '#161B27',
  surfaceRaised: '#1E2535',
  surfaceSunken: '#111520',
  surfaceOverlay: '#1E2535',

  border: '#2C3549',
  borderSubtle: '#232B3D',
  borderFocus: '#4C9AFF',

  success: '#2ECC87',
  successSubtle: '#0D2B1E',
  warning: '#FFAB00',
  warningSubtle: '#2B2000',
  danger: '#FF5630',
  dangerSubtle: '#2B0D00',
  info: '#4C9AFF',
  infoSubtle: '#0C2340',

  epic: '#8777D9',
  story: '#00C7E6',
  task: '#4C9AFF',
  bug: '#FF5630',

  priorityCritical: '#FF5630',
  priorityHigh: '#FF7452',
  priorityMedium: '#FFAB00',
  priorityLow: '#2ECC87',
  priorityLowest: '#4C9AFF',

  backdrop: 'rgba(0, 0, 0, 0.6)',
};

// ── Non-color scales (shared light/dark) ──────────────────────────────────────

/** 4px base spacing scale. */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

/** Border radius scale (matches Tailwind rounded / -md / -lg / -full). */
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 999,
} as const;

/** Typography scale. Base body = 14px (matches web). */
export const fontSize = {
  xxs: 9,
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Elevation presets (RN shadow + Android elevation). */
export const elevation = {
  sm: {
    shadowColor: '#091E42',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  md: {
    shadowColor: '#091E42',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  lg: {
    shadowColor: '#091E42',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const;

export type ColorScheme = 'light' | 'dark';

export const colorsFor = (scheme: ColorScheme): ThemeColors =>
  scheme === 'dark' ? darkColors : lightColors;
