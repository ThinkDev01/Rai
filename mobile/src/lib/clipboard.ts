import { toast } from '@/lib/toast';

/**
 * Copy text to the clipboard. Uses @react-native-clipboard/clipboard when the
 * native module is linked (after a rebuild); degrades to a toast otherwise so
 * it never crashes on a JS-only reload.
 */
export async function copyToClipboard(text: string, successMsg?: string): Promise<void> {
  try {
    // Lazy require so a missing native module doesn't throw at import time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-clipboard/clipboard');
    const Clipboard = mod?.default ?? mod;
    Clipboard.setString(text);
    if (successMsg) toast.success(successMsg);
  } catch {
    toast.info(text);
  }
}
