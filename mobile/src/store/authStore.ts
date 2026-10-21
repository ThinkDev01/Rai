import { create } from 'zustand';
import api, { setActiveOrgId } from '@/lib/api';
import { getTokens, signOut as cognitoSignOut } from '@/lib/cognito';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser, Membership, MeResponseData, OrgRole } from '@/types/auth.types';

const LAST_ORG_KEY = 'rai.lastOrgId';

interface AuthState {
  user: AuthUser | null;
  memberships: Membership[];
  isAuthenticated: boolean;
  isHydrating: boolean;
  hydrateAttempted: boolean;
  /** Active org id (replaces the web URL slug as the per-session org context). */
  currentOrgId: string | null;

  setAuth: (user: AuthUser, memberships: Membership[]) => void;
  hydrate: () => Promise<void>;
  refreshMemberships: () => Promise<void>;
  setCurrentOrg: (orgId: string) => void;
  updateName: (name: string) => void;
  signOut: () => Promise<void>;
}

let inflightHydrate: Promise<void> | null = null;
let lastHydrateError: string | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  memberships: [],
  isAuthenticated: false,
  isHydrating: false,
  hydrateAttempted: false,
  currentOrgId: null,

  setAuth: (user, memberships) => {
    set({ user, memberships, isAuthenticated: true, hydrateAttempted: true });
  },

  hydrate: () => {
    if (inflightHydrate) return inflightHydrate;
    inflightHydrate = runHydrate(set, get).finally(() => {
      inflightHydrate = null;
    });
    return inflightHydrate;
  },

  refreshMemberships: async () => {
    try {
      const res = await api.get<{ success: boolean; data: MeResponseData }>('/me');
      if (res.data.success) set({ memberships: res.data.data.memberships });
    } catch {
      /* best-effort */
    }
  },

  setCurrentOrg: orgId => {
    setActiveOrgId(orgId);
    AsyncStorage.setItem(LAST_ORG_KEY, orgId).catch(() => {});
    set({ currentOrgId: orgId });
  },

  updateName: name => {
    const u = get().user;
    if (u) set({ user: { ...u, name } });
  },

  signOut: async () => {
    // Clear local session FIRST so the UI navigates to Login instantly — don't
    // block on the Cognito network round-trip. hydrateAttempted stays TRUE: we
    // know we're unauthenticated, so the RootNavigator gate shows the auth
    // stack rather than the splash loader (which would otherwise spin forever
    // because hydrate() only runs once at app startup).
    inflightHydrate = null;
    setActiveOrgId(null);
    set({
      user: null,
      memberships: [],
      isAuthenticated: false,
      hydrateAttempted: true,
      isHydrating: false,
      currentOrgId: null,
    });
    // Best-effort server-side revoke + local token clear, in the background.
    cognitoSignOut().catch(() => {});
  },
}));

async function runHydrate(
  set: (partial: Partial<AuthState>) => void,
  get: () => AuthState,
): Promise<void> {
  set({ isHydrating: true });
  try {
    const tokens = await getTokens();
    if (!tokens) {
      set({
        isHydrating: false,
        user: null,
        memberships: [],
        isAuthenticated: false,
        hydrateAttempted: true,
      });
      return;
    }
    const res = await api.get<{ success: boolean; data: MeResponseData; error: string }>('/me');
    const { user, memberships } = res.data.data;

    // Resolve the active org: keep current if still valid, else last-used, else
    // user.currentOrgId (Cognito default), else first membership.
    const existing = get().currentOrgId;
    const lastUsed = await AsyncStorage.getItem(LAST_ORG_KEY).catch(() => null);
    const validIds = new Set(memberships.map(m => m.org_id));
    let orgId: string | null = null;
    if (existing && validIds.has(existing)) orgId = existing;
    else if (lastUsed && validIds.has(lastUsed)) orgId = lastUsed;
    else if (user.currentOrgId && validIds.has(user.currentOrgId)) orgId = user.currentOrgId;
    else if (memberships.length > 0) orgId = memberships[0].org_id;

    if (orgId) {
      setActiveOrgId(orgId);
      AsyncStorage.setItem(LAST_ORG_KEY, orgId).catch(() => {});
    }

    lastHydrateError = null;
    set({
      user,
      memberships,
      currentOrgId: orgId,
      isAuthenticated: true,
      isHydrating: false,
      hydrateAttempted: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Store the error so LoginScreen can surface it without making hydrate() throw.
    lastHydrateError = msg;
    set({
      user: null,
      memberships: [],
      isAuthenticated: false,
      isHydrating: false,
      hydrateAttempted: true,
    });
  }
}

/** Returns (and clears) the error from the most recent failed hydration. */
export function popHydrateError(): string | null {
  const e = lastHydrateError;
  lastHydrateError = null;
  return e;
}

// ── Selectors ────────────────────────────────────────────────────────────────
export function useCurrentMembership(): Membership | null {
  return useAuthStore(s => {
    if (!s.currentOrgId) return null;
    return s.memberships.find(m => m.org_id === s.currentOrgId) ?? null;
  });
}

export function useCurrentRole(): OrgRole | null {
  return useAuthStore(s => {
    if (!s.currentOrgId) return null;
    return s.memberships.find(m => m.org_id === s.currentOrgId)?.role ?? null;
  });
}
