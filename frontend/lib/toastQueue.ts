import { toast } from 'sonner';
import { logger } from '@/lib/logger';

// Persisted toast queue. Survives full page reloads via sessionStorage so a
// destination-page toast can be enqueued before a `window.location.assign`
// and fire when the next layout mounts. Per-tab (sessionStorage) - never
// leaks to other tabs.
//
// Used primarily by the org switcher: we hard-reload on org switch (failsafe
// against React Query cache + zustand timing races), so the "Switched to X"
// toast can't render before the reload kills the page. Enqueue → reload →
// destination layout flushes → toast appears AFTER the new dashboard rendered.

const KEY = 'rai.pendingToast';

export type PendingToastKind = 'success' | 'info' | 'warning' | 'error' | 'message';

export interface PendingToast {
  kind:    PendingToastKind;
  message: string;
}

export function enqueueToast(t: PendingToast): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(t));
  } catch (err) {
    // Storage quota / disabled - non-fatal; just no toast across reload.
    logger.warn('toastQueue', 'Could not queue the toast to show after reload', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Called once on layout mount. Reads any pending toast from sessionStorage,
// fires it via sonner, and clears the slot.
export function flushToastQueue(): void {
  if (typeof window === 'undefined') return;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return;
  window.sessionStorage.removeItem(KEY);
  try {
    const parsed = JSON.parse(raw) as PendingToast;
    if (typeof parsed?.message !== 'string') return;
    const kind = parsed.kind ?? 'message';
    // Sonner's API uses different methods per kind. Map cleanly.
    switch (kind) {
      case 'success': toast.success(parsed.message); break;
      case 'info':    toast.info?.(parsed.message) ?? toast.message(parsed.message); break;
      case 'warning': toast.warning?.(parsed.message) ?? toast.message(parsed.message); break;
      case 'error':   toast.error(parsed.message); break;
      default:        toast.message(parsed.message);
    }
  } catch {
    // Corrupt entry - already removed above.
  }
}
