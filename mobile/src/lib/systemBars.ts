import { Platform } from 'react-native';

/**
 * Colour the Android system navigation bar (the back/home/recents bar) to match
 * the app theme. Uses react-native-system-navigation-bar when the native module
 * is linked (after a rebuild); no-ops gracefully otherwise so a JS-only reload
 * never crashes.
 *
 * @param color  background colour for the nav bar (the app surface)
 * @param dark   true when the app is in dark mode → use light (white) buttons
 */
export function applyNavBarTheme(color: string, dark: boolean): void {
  if (Platform.OS !== 'android') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-system-navigation-bar');
    const SystemNavigationBar = mod?.default ?? mod;
    // style 'light' = light buttons (for a dark bar); 'dark' = dark buttons.
    SystemNavigationBar.setNavigationColor(color, dark ? 'light' : 'dark');
  } catch {
    /* native module not linked yet — no-op until rebuild */
  }
}
