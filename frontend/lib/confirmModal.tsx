'use client';

import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AlertTriangle } from 'lucide-react';

// Imperative confirmation modal. Same shape as confirmToast - returns
// Promise<boolean> - but renders as a CENTERED overlay instead of a sonner
// toast. Use for blocking destructive confirmations (sign out, delete account)
// where the user must explicitly choose before continuing.
//
// confirmToast is still the right pick for non-blocking action prompts (the
// cross-tab account-swap banner). The distinction: a confirm modal stops you;
// a toast lets you keep working.
//
// Mounts into document.body via portal-style detached root so it overlays any
// surface and isn't constrained by parent stacking contexts.

export interface ConfirmModalOptions {
  title:        string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" = red accent + red confirm button. "warning" = amber. */
  variant?:     'danger' | 'warning';
}

export function confirmModal(opts: ConfirmModalOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    let settled = false;
    function settle(value: boolean) {
      if (settled) return;
      settled = true;
      // unmount on next tick so React's commit doesn't fight the unmount.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
      resolve(value);
    }

    root.render(
      <ConfirmModalView
        opts={opts}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />,
    );
  });
}

function ConfirmModalView({
  opts,
  onConfirm,
  onCancel,
}: {
  opts:      ConfirmModalOptions;
  onConfirm: () => void;
  onCancel:  () => void;
}) {
  const {
    title,
    description,
    confirmLabel,
    cancelLabel = 'Cancel',
    variant     = 'danger',
  } = opts;

  const cancelRef = useRef<HTMLButtonElement>(null);

  // Tailwind tokens for the destructive vs warning variants.
  const accentText  = variant === 'danger' ? 'text-danger'  : 'text-warning';
  const buttonCls   = variant === 'danger'
    ? 'bg-danger hover:bg-danger/90'
    : 'bg-warning hover:bg-warning/90';

  useEffect(() => {
    // Focus Cancel by default - safer for destructive flows (Enter shouldn't
    // accidentally confirm a sign-out).
    cancelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface-raised shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <AlertTriangle size={18} className={`flex-shrink-0 ${accentText}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text">{title}</h2>
            {description && (
              <p className="mt-1 text-xs text-text-subtle">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-xs font-medium text-white transition-colors ${buttonCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
