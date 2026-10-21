import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  colorsFor,
  spacing,
  radius,
  fontSize,
  fontWeight,
  elevation,
  type ThemeColors,
  type ColorScheme,
} from './tokens';
import { applyNavBarTheme } from '@/lib/systemBars';

/**
 * Theme preference (mirrors web theme.store, extended with "system").
 * Persisted to AsyncStorage under `rai-theme` (same key family as web).
 */
export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'rai-theme';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  elevation: typeof elevation;
  dark: boolean;
}

interface ThemeContextValue extends Theme {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('system');
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  // Load persisted preference once on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw === 'light' || raw === 'dark' || raw === 'system') {
          setPrefState(raw);
        }
      })
      .catch(() => {});
  }, []);

  // Track OS-level appearance changes when following the system.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  }, []);

  const scheme: ColorScheme = pref === 'system' ? systemScheme : pref;

  // Colour the Android system navigation bar (back/home bar) to match the app
  // theme so it doesn't clash, and the buttons stay visible in dark/light mode.
  useEffect(() => {
    applyNavBarTheme(colorsFor(scheme).surface, scheme === 'dark');
  }, [scheme]);

  const toggle = useCallback(() => {
    setPref(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme, setPref]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      colors: colorsFor(scheme),
      spacing,
      radius,
      fontSize,
      fontWeight,
      elevation,
      dark: scheme === 'dark',
      pref,
      setPref,
      toggle,
    }),
    [scheme, pref, setPref, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
