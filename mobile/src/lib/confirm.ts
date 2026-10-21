export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ShowFn = (opts: ConfirmOptions) => Promise<boolean>;

let showFn: ShowFn | null = null;

/** Internal: ConfirmHost registers its imperative show function here. */
export function registerConfirm(fn: ShowFn | null) {
  showFn = fn;
}

/**
 * Promise-based confirm rendered as an in-app themed dialog (not the OS Alert).
 * Mirrors web lib/confirmModal.tsx. Falls back to true→false if the host isn't
 * mounted yet (should never happen in practice).
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (!showFn) return Promise.resolve(false);
  return showFn(opts);
}
