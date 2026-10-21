'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getTokens, getStoredIdTokenSub } from '@/lib/cognito-client';
import { useAuthStore } from '@/store/auth.store';
import { logger } from '@/lib/logger';

// ── Pending account-swap marker (sessionStorage) ────────────────────────────
//
// Mirrors zustand `pendingAccountSwap` into sessionStorage so the banner
// survives full-page refresh. Lives at the GLOBAL component level (mounted in
// root layout) so the refire runs on any page, not just /orgs/[slug]/*.

const PENDING_SWAP_KEY = 'rai.pendingAccountSwap';

interface StoredPendingSwap {
  oldUserEmail: string;
  newSub:       string;
}

function readPendingSwap(): StoredPendingSwap | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(PENDING_SWAP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPendingSwap;
    if (typeof parsed?.oldUserEmail !== 'string' || typeof parsed?.newSub !== 'string') return null;
    return parsed;
  } catch {
    window.sessionStorage.removeItem(PENDING_SWAP_KEY);
    return null;
  }
}

function writePendingSwap(s: StoredPendingSwap): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PENDING_SWAP_KEY, JSON.stringify(s));
}

function clearPendingSwap(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_SWAP_KEY);
}

// ── Global cross-tab sync ───────────────────────────────────────────────────
//
// Mounted at root layout. Handles:
//   A. Cross-tab sign-out detection (localStorage tokens removed elsewhere)
//   B. Cross-tab account-swap (localStorage tokens replaced with different sub)
//   C. On-mount marker refire so banner persists across page refresh on ANY page
//
// Previously these handlers lived only in orgs/[slug]/layout.tsx, which meant
// refreshing on `/`, `/welcome`, `/auth/login` would lose the banner state.
// Moving them global guarantees the banner re-appears wherever the user is
// after a refresh, until they explicitly resolve it.

export function CrossTabSync() {
  const router = useRouter();
  const qc     = useQueryClient();
  const setPendingAccountSwap = useAuthStore(s => s.setPendingAccountSwap);

  // Mount-time: rehydrate pending account-swap banner from sessionStorage.
  // Stale marker (token sub no longer matches) gets cleared.
  useEffect(() => {
    const marker = readPendingSwap();
    if (!marker) return;

    const currentSub = getStoredIdTokenSub();
    if (!currentSub || currentSub !== marker.newSub) {
      logger.info('CrossTabSync', 'Stale account-swap marker on load — clearing it', {
        markerNewSub: marker.newSub, currentSub,
      });
      clearPendingSwap();
      return;
    }

    logger.warn('CrossTabSync', 'Account-swap still pending on load — re-showing the banner', {
      oldUserEmail: marker.oldUserEmail, newUserId: marker.newSub,
    });
    setPendingAccountSwap(marker);
    showAccountSwapBanner({
      oldUserEmail: marker.oldUserEmail,
      newSub:       marker.newSub,
      qc,
      router,
      onResolve:    () => setPendingAccountSwap(null),
    });
  }, [qc, router, setPendingAccountSwap]);

  // Storage event listener - fires when another tab mutates localStorage.
  useEffect(() => {
    function onStorage(_e: StorageEvent) {
      const stillAuthed    = useAuthStore.getState().isAuthenticated;
      const stillHasTokens = Boolean(getTokens());
      const currentUserId  = useAuthStore.getState().user?.id ?? null;
      const currentEmail   = useAuthStore.getState().user?.email ?? null;

      // Case A - sign-out in another tab.
      if (stillAuthed && !stillHasTokens) {
        logger.info('CrossTabSync', 'Signed out in another tab — showing a notice, then signing out here', {
          userId: currentUserId ?? 'anonymous',
        });
        toast.message('Signed out in another tab', {
          description: 'Redirecting to sign-in…',
          duration:    1500,
        });
        setTimeout(() => {
          qc.clear();
          useAuthStore.getState().clearAuth().then(() => {
            router.replace('/auth/login');
          });
        }, 1500);
        return;
      }

      // Case B - different account signed in in another tab.
      if (stillAuthed && stillHasTokens && currentUserId) {
        const newSub = getStoredIdTokenSub();
        if (!newSub || newSub === currentUserId) return;

        logger.warn('CrossTabSync', 'A different account signed in in another tab — showing the account-swap banner', {
          oldUserId: currentUserId,
          newUserId: newSub,
        });

        const oldUserEmail = currentEmail ?? 'another account';
        writePendingSwap({ oldUserEmail, newSub });
        setPendingAccountSwap({ oldUserEmail, newSub });
        showAccountSwapBanner({
          oldUserEmail, newSub, qc, router,
          onResolve: () => setPendingAccountSwap(null),
        });
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [qc, router, setPendingAccountSwap]);

  return null;
}

// ── Account-swap banner (sonner toast.custom) ──────────────────────────────
//
// Shared helper - same UI whether triggered by mount refire or live storage
// event. Stable toast id keyed off newSub so duplicate fires (storage + mount
// in same tick) coalesce into one banner instead of stacking.

import type { QueryClient } from '@tanstack/react-query';

function showAccountSwapBanner(args: {
  oldUserEmail: string;
  newSub:       string;
  qc:           QueryClient;
  router:       ReturnType<typeof useRouter>;
  onResolve:    () => void;
}): void {
  const { oldUserEmail, newSub, qc, router, onResolve } = args;
  const toastId = `account-swap-${newSub}`;
  toast.custom(
    (id) => (
      <div className="w-full max-w-md rounded-lg border border-warning/40 bg-surface-raised px-4 py-3 shadow-lg">
        <p className="text-sm font-semibold text-text">
          Different account signed in in another tab
        </p>
        <p className="mt-0.5 text-xs text-text-subtle">
          This tab is signed in as <span className="font-medium text-text">{oldUserEmail}</span>,
          but another tab signed in as a different account.
          Only one account can be active in this browser - pick what to do.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              clearPendingSwap();
              onResolve();
              toast.dismiss(id);
              logger.info('CrossTabSync', 'Account-swap: switching this tab to the new account', {
                oldUserEmail, newUserId: newSub,
              });
              qc.clear();
              useAuthStore.getState().hydrate();
            }}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
          >
            Switch this tab
          </button>
          <button
            type="button"
            onClick={() => {
              clearPendingSwap();
              onResolve();
              toast.dismiss(id);
              logger.info('CrossTabSync', 'Account-swap: signing out to sign back in (all tabs sign out too)', {
                oldUserEmail, newUserId: newSub,
              });
              qc.clear();
              useAuthStore.getState().clearAuth().then(() => {
                router.replace('/auth/login');
              });
            }}
            className="rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover"
          >
            Sign back in
          </button>
        </div>
      </div>
    ),
    { id: toastId, duration: Infinity },
  );
}
