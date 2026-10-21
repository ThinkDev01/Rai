const PALETTE = ['#6554C0', '#00875A', '#FF5630', '#FF991F', '#00B8D9', '#E91E8C'];

// Members use a Jira-flavoured palette - distinct enough from PALETTE so
// project chips + member chips stay visually different in mixed surfaces
// (e.g. project sidebar shows a project icon AND a member avatar nearby).
const MEMBER_PALETTE = ['#0052CC', '#6554C0', '#00875A', '#FF5630', '#FF991F'];

/**
 * Deterministic color for a project based on its key.
 * Same key always returns the same color across the UI.
 */
export function projectColor(key: string): string {
  return PALETTE[key.charCodeAt(0) % PALETTE.length] ?? '#6554C0';
}

/**
 * Deterministic color for an org based on its slug. Same palette as projects
 * so the visual vocabulary stays consistent. Hash sums all chars (not just the
 * first) so two orgs whose slugs share the first letter still land on
 * different colors - important since switchers list multiple orgs together
 * and we want them visually distinguishable.
 */
export function orgColor(slug: string): string {
  let sum = 0;
  for (let i = 0; i < slug.length; i++) sum = (sum + slug.charCodeAt(i)) | 0;
  return PALETTE[sum % PALETTE.length] ?? '#6554C0';
}

/**
 * Deterministic color for a member's avatar based on their user id. The
 * single source of truth - used to be duplicated as a local function in
 * ProjectSubNav.tsx, which led to the same user rendering as blue on board
 * cards (hard-coded bg-primary) but orange in the filter (memberColor).
 * Now every avatar render site imports from here so a member's color is
 * stable across the entire app.
 */
export function memberColor(id: string): string {
  if (!id) return MEMBER_PALETTE[0]!;
  // Numeric id path is the v1 shape; v2 ids are Cognito subs (UUID-ish
  // strings) so the charCodeAt fallback is what actually fires in prod.
  // Sum all chars so the full id contributes (not just the first), which
  // spreads colors better when a team has many members whose ids share
  // a prefix.
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) | 0;
  return MEMBER_PALETTE[sum % MEMBER_PALETTE.length] ?? MEMBER_PALETTE[0]!;
}

// ── Permission helpers (mirror docs/rbac.md) ────────────────────────────────
//
// Single source of truth on the frontend for the "can this user create a
// ticket in this project?" rule. Backend remains authoritative - these
// functions only control button-disabled state + tooltips so the UI doesn't
// invite an action the server will reject.
//
// Per rbac.md §Ticket actions + §Project visibility:
//   - Owner / Admin (org-level)         → always (admin override on every project)
//   - PM-in-project                      → always
//   - PM-on-public-project (not a member) → ✓ (membership irrelevant on public)
//   - PM-on-private-project (not a member) → blocked (read-only)
//   - User-in-project                    → ✓
//   - User-not-in-project (any visibility) → blocked

import type { Project, UserRole, Member } from '@/types/api.types';

export function canCreateTicketInProject(
  project: Pick<Project, 'visibility' | 'members'>,
  user: { id: string } | null | undefined,
  role: UserRole | null | undefined,
): boolean {
  if (!user || !role) return false;
  if (role === 'owner' || role === 'admin') return true;

  const isMember = project.members.some((m: Member) => m.id === user.id);
  if (role === 'project_manager') {
    return project.visibility === 'public' || isMember;
  }
  // 'user' role: must be a project member
  return isMember;
}

/** Human-readable reason for the disabled state, surfaced as a tooltip. */
export function createTicketBlockedReason(
  project: Pick<Project, 'visibility' | 'members'>,
  user: { id: string } | null | undefined,
  role: UserRole | null | undefined,
): string {
  if (!user || !role) return 'Sign in to create tickets';
  const isMember = project.members.some((m: Member) => m.id === user.id);
  if (role === 'project_manager' && project.visibility === 'private' && !isMember) {
    return 'This project is private - ask a PM to add you, then you can create tickets';
  }
  if (!isMember) {
    return "You're not a member of this project - ask a PM to add you";
  }
  return '';
}
