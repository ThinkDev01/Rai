import { useParams } from 'next/navigation';

// Per-tab org context lives in the URL - every authenticated route is nested
// under /orgs/[slug]/... Slug is the source of truth; the auth store's
// currentOrgId is derived from it via the orgs/[slug]/layout.tsx effect.
//
// Why URL-driven (not store-driven):
//   - Two tabs sharing localStorage cannot independently hold "current org"
//     in any shared store. The URL is naturally per-tab - Tab A in orgA and
//     Tab B in orgB just works.
//   - Matches Jira / Linear / Notion / GitHub. The slug in the URL bar is the
//     unambiguous "where am I."
//   - Cognito `custom:current_org_id` becomes "default org on next fresh
//     login" only - we never write to it on a tab-local org switch.

/** Build a slug-prefixed route. Pass any subpath starting with or without `/`. */
export function orgRoute(slug: string, subpath: string = ''): string {
  const safeSlug = encodeURIComponent(slug);
  if (!subpath) return `/orgs/${safeSlug}`;
  const prefixed = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return `/orgs/${safeSlug}${prefixed}`;
}

/**
 * Returns the current org slug from the URL, or null if not on an /orgs/[slug]/
 * route (e.g. /welcome, /auth/*, /invite/*).
 *
 * Reads from Next's route params - synchronous, no network. Works inside any
 * component rendered under the orgs/[slug]/layout.tsx tree.
 */
export function useCurrentSlug(): string | null {
  const params = useParams<{ slug?: string }>();
  const raw = params?.slug;
  if (!raw) return null;
  // useParams returns the raw segment; decode in case of edge-case slugs.
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * Resolve the org we should land in for first-render after sign-in / org
 * creation / invite acceptance. Caller passes the memberships array and the
 * optional "preferred" org id (typically `user.currentOrgId` from /me, which
 * reflects the Cognito `custom:current_org_id` default).
 *
 * Returns the slug-prefixed dashboard route, or `/welcome` if the user has
 * no memberships yet.
 */
export function defaultDashboardRoute(
  memberships: { org_id: string; org_slug: string }[],
  preferredOrgId?: string | null,
): string {
  if (memberships.length === 0) return '/welcome';
  const preferred = preferredOrgId
    ? memberships.find(m => m.org_id === preferredOrgId)
    : null;
  const target = preferred ?? memberships[0]!;
  return orgRoute(target.org_slug, '/dashboard');
}
