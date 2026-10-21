import { create } from 'zustand';
import { getTokens, signOut as cognitoSignOut } from '@/lib/cognito-client';
import { applyFreshLoginReset } from '@/lib/boardFilters';
import api from '@/lib/api';
import type { AuthUser, Membership, MeResponseData } from '@/types/auth.types';

export type { OrgRole } from '@/types/auth.types';

/**
 * Cross-tab account-swap pending state. Set when storage event detects a
 * different `sub` in localStorage tokens. Drives both:
 *   - The org layout's render-gate (hide shell while banner is up)
 *   - Idempotent banner refire (don't show twice for same newSub)
 *
 * Mirrors the `rai.pendingAccountSwap` sessionStorage marker. Two state
 * containers because zustand is in-memory (cleared on refresh) while
 * sessionStorage survives reload - we need both for the banner to persist
 * across page refresh AND to gate render within a single page session.
 */
export interface PendingAccountSwap {
  oldUserEmail: string;
  newSub:       string;
}

interface AuthState {
  user: AuthUser | null;
  memberships: Membership[];
  isAuthenticated: boolean;
  isHydrating: boolean;
  /**
   * True once hydrate() has run at least once (success OR failure). Layout's
   * gate-effect reads this to avoid an infinite retry loop when hydrate fails
   * - without the flag the gate sees `!user && !isHydrating` after a failed
   * hydrate and re-fires immediately, which 429s the backend forever.
   */
  hydrateAttempted: boolean;
  /** Cross-tab account-swap state (mirrors sessionStorage marker). */
  pendingAccountSwap: PendingAccountSwap | null;
  setAuth: (user: AuthUser, memberships: Membership[]) => void;
  clearAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
  /**
   * Update `user.currentOrgId` in-place. Used by the orgs/[slug]/layout effect
   * to mirror the URL slug into the store so selectors (useCurrentRole etc.)
   * keep working. The URL is the source of truth - this is a one-way sync.
   * Never written to Cognito; per-tab only.
   */
  setCurrentOrgId: (orgId: string) => void;
  setPendingAccountSwap: (swap: PendingAccountSwap | null) => void;
  /**
   * Silent re-fetch of memberships from /me. Unlike `hydrate()`, this does
   * NOT flip `isHydrating: true` - the layout's render-gate stays put, so
   * no transient shell. Use after a small mutation (e.g. toggle
   * discoverable) where we want the authoritative DB value but don't want
   * the whole layout to remount. Best-effort: on error, leaves state alone.
   */
  refreshMemberships: () => Promise<void>;
  /**
   * Watchdog escape hatch. If the layout sees `isHydrating: true` for longer
   * than its bounded wait, it calls this to forcibly drop the flag and clear
   * the in-flight dedupe singleton. The layout's gate effect re-evaluates
   * and either redirects to /auth/login (no tokens) or renders content (if
   * data already in the store). Bounded recovery per
   * [[feedback_redirect_loops_forbidden]] - one-shot reset, no retry loop.
   */
  forceResetHydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  memberships: [],
  isAuthenticated: false,
  // isHydrating = actively running /me round-trip. Starts false: an untouched
  // store is "haven't tried yet", not "in flight". hydrate() flips this to
  // true at its start and back to false on completion. Layout gates on this
  // value (renders null while hydrating + redirects after completion).
  isHydrating: false,
  hydrateAttempted: false,
  pendingAccountSwap: null,

  setAuth: (user, memberships) => {
    set({ user, memberships, isAuthenticated: true, hydrateAttempted: true });
  },

  clearAuth: async () => {
    try { await cognitoSignOut(); } catch { /* best-effort */ }
    // Reset hydrateAttempted - signing out is an intentional fresh start.
    set({ user: null, memberships: [], isAuthenticated: false, hydrateAttempted: false });
  },

  setCurrentOrgId: (orgId) => {
    const cur = useAuthStore.getState().user;
    if (!cur) return;
    if (cur.currentOrgId === orgId) return;
    set({ user: { ...cur, currentOrgId: orgId } });
  },

  setPendingAccountSwap: (swap) => {
    set({ pendingAccountSwap: swap });
  },

  refreshMemberships: async () => {
    try {
      const res = await api.get<{ success: boolean; data: MeResponseData }>('/me');
      if (res.data.success) set({ memberships: res.data.data.memberships });
    } catch {
      // best-effort - leave existing memberships in place on failure
    }
  },

  forceResetHydrate: () => {
    inflightHydrate = null;
    set({ isHydrating: false, hydrateAttempted: true });
  },

  // Called whenever the store needs to sync with the backend - on app mount,
  // after sign-in, after sign-out → re-sign-in, after org switch. Sets
  // isHydrating: true at the start so the (app) layout's gate-effect waits
  // for completion before deciding to redirect.
  //
  // Any error (no session, expired, backend rejected) lands in unauthenticated
  // state - never throws, never blocks render.
  //
  // Concurrent-call dedupe: any number of callers in the same tick share a
  // single in-flight Promise via module-scope `inflightHydrate`. Without this,
  // a sign-in flow that writes localStorage twice in quick succession fires
  // two storage events → two hydrate() → two /me requests → backend rate
  // limiter returns 429. Closes the "Hydrate inflight dedupe singleton" item
  // parked in convo-056.
  hydrate: () => {
    if (inflightHydrate) return inflightHydrate;
    inflightHydrate = runHydrate(set).finally(() => {
      inflightHydrate = null;
    });
    return inflightHydrate;
  },
}));

let inflightHydrate: Promise<void> | null = null;

async function runHydrate(set: (partial: Partial<AuthState>) => void): Promise<void> {
  set({ isHydrating: true });
  try {
    const tokens = getTokens();
    if (!tokens) {
      set({ isHydrating: false, user: null, memberships: [], isAuthenticated: false, hydrateAttempted: true });
      return;
    }
    const res = await api.get<{ success: boolean; data: MeResponseData; error: string }>('/me');
    // One-shot: no-ops unless a sign-in (password or federated) happened
    // since the flag was last consumed. Must run with the real DB user id -
    // cognito-client only has the Cognito sub, a different id.
    applyFreshLoginReset(res.data.data.user.id);
    set({
      user: res.data.data.user,
      memberships: res.data.data.memberships,
      isAuthenticated: true,
      isHydrating: false,
      hydrateAttempted: true,
    });
  } catch {
    set({ user: null, memberships: [], isAuthenticated: false, isHydrating: false, hydrateAttempted: true });
  }
}

// ── Selectors ────────────────────────────────────────────────────────────────
//
// Pulled into helpers because nearly every page needs the caller's current-org
// role for RBAC gating (admin nav visibility, sprint controls, etc.). Reading
// directly from the store keeps subscriptions narrow - components only re-render
// when their own slice changes.

/** Caller's membership row for the currently selected org, or null. */
export function useCurrentMembership(): Membership | null {
  return useAuthStore(s => {
    const orgId = s.user?.currentOrgId;
    if (!orgId) return null;
    return s.memberships.find(m => m.org_id === orgId) ?? null;
  });
}

/** Caller's role in the current org, or null when no org is selected. */
export function useCurrentRole(): Membership['role'] | null {
  return useAuthStore(s => {
    const orgId = s.user?.currentOrgId;
    if (!orgId) return null;
    return s.memberships.find(m => m.org_id === orgId)?.role ?? null;
  });
}
