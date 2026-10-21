import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '@/lib/logger';

interface ThemeState {
  dark: boolean;
  toggle: () => void;
}

// Cooldown for rapid taps. On mobile, every theme flip triggers all
// `transition-colors` elements to repaint for 150ms - clicking faster than
// the paint pipeline can drain causes the UI to feel "stuck". 200ms is just
// above the transition duration, so visible UI catches up before we accept
// the next flip. Module-scoped (not in state) so it doesn't trigger re-renders.
let lastToggleAt = 0;
const TOGGLE_COOLDOWN_MS = 200;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      dark: false,
      toggle: () => {
        const now = Date.now();
        if (now - lastToggleAt < TOGGLE_COOLDOWN_MS) return;
        lastToggleAt = now;
        const next = !get().dark;
        logger.info('themeStore', 'Theme switched', { to: next ? 'dark' : 'light' });
        set({ dark: next });
        document.documentElement.classList.toggle('dark', next);
      },
    }),
    { name: 'rai-theme' }
  )
);

// Apply persisted theme on initial load (called once in layout)
export function applyPersistedTheme() {
  try {
    const stored = localStorage.getItem('rai-theme');
    if (stored) {
      const { state } = JSON.parse(stored);
      if (state?.dark) document.documentElement.classList.add('dark');
    }
  } catch {}
}
