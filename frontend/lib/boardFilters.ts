// Per-project, per-user localStorage persistence for the board's assignee
// filter (ProjectSubNav). Scoped by BOTH ids so one user's saved filter can
// never leak to the next login on a shared browser.
//
// A same-session page refresh restores the last-chosen filter (load/save
// below). A fresh sign-in does NOT: auth.store's hydrate() calls
// applyFreshLoginReset once /me resolves the caller's real (DB) user id, so
// the board always opens to "all tickets" on a new session even for a user
// who had "Me" selected last time.
//
// Why this is two-phase (mark now, apply later) instead of clearing directly
// at sign-in: cognito-client only has the Cognito `sub` at that point, but
// the app's user id (what ProjectSubNav's storageKey actually uses) is a
// separate DB-generated id from `users.id` - they are never the same value.
// Clearing by `sub` right after sign-in would silently no-op against a key
// that was never written. So sign-in just flags "a fresh login happened";
// hydrate() consumes that flag once it has the real id to clear by.
const KEY_PREFIX = 'board-assignee-filter';
const FRESH_LOGIN_FLAG = 'rai.freshLoginPendingFilterReset';

function storageKey(projectId: string, userId: string): string {
  return `${KEY_PREFIX}:${projectId}:${userId}`;
}

export function loadStoredAssignees(projectId: string, userId: string | undefined): string[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(projectId, userId));
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredAssignees(projectId: string, userId: string | undefined, assignees: string[]): void {
  if (typeof window === 'undefined' || !userId) return;
  window.localStorage.setItem(storageKey(projectId, userId), JSON.stringify(assignees));
}

// Wipes every project's saved filter for this user id.
function clearStoredAssigneesForUser(userId: string): void {
  if (typeof window === 'undefined') return;
  const suffix = `:${userId}`;
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(`${KEY_PREFIX}:`) && k.endsWith(suffix)) toRemove.push(k);
  }
  toRemove.forEach(k => window.localStorage.removeItem(k));
}

// Called by cognito-client right after a genuine new sign-in (password or
// federated) stores fresh tokens. Uses sessionStorage (not a JS variable) so
// the flag survives the client-side navigation from /auth/login or
// /auth/callback to wherever hydrate() actually runs.
export function markFreshLogin(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(FRESH_LOGIN_FLAG, '1');
}

// Called by auth.store's hydrate() once /me resolves the authoritative
// (DB) user id. One-shot: if a fresh login happened since the flag was last
// consumed, wipes this user's saved board filters and clears the flag, so
// subsequent hydrate() calls in the same session (org switch, silent /me
// refresh, etc.) don't repeatedly wipe a filter the user is actively using.
export function applyFreshLoginReset(userId: string): void {
  if (typeof window === 'undefined') return;
  if (window.sessionStorage.getItem(FRESH_LOGIN_FLAG) !== '1') return;
  window.sessionStorage.removeItem(FRESH_LOGIN_FLAG);
  clearStoredAssigneesForUser(userId);
}
