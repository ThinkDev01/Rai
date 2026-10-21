'use client';

import { useEffect, useRef } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/shell/Header';
import { Sidebar } from '@/components/shell/Sidebar';
import { Footer } from '@/components/shell/Footer';
import { SubscriptionBanner } from '@/components/billing/SubscriptionBanner';
import { Logo } from '@/components/Logo';
import { useAuthStore } from '@/store/auth.store';
import { getTokens } from '@/lib/cognito-client';
import { orgRoute } from '@/lib/routes';
import { rememberLastOrgForNextLogin } from '@/lib/lastOrg';
import { flushToastQueue } from '@/lib/toastQueue';
import { logger } from '@/lib/logger';

// Org-scoped shell layout. Path is /orgs/[slug]/... - slug in the URL is the
// per-tab source of truth for "current org" (Jira / Linear / Notion pattern).
//
// Cross-tab handling (storage events + account-swap banner refire from
// sessionStorage marker) lives in components/CrossTabSync.tsx, mounted at the
// ROOT layout - so the banner persists across page refresh on any page, not
// just /orgs/[slug]/*. This layout reads `pendingAccountSwap` from zustand
// for render-gating only.
//
// Gate decision tree:
//
//   1. pendingAccountSwap active             → loading shell (banner is up)
//   2. No tokens                             → /auth/login
//   3. Tokens but store has no user          → hydrate
//   4. Still hydrating                       → loading shell
//   5. Hydrated but not authenticated        → /auth/login (hydrate failed)
//   6. Authenticated but no memberships      → /welcome
//   7. URL slug doesn't match any membership → /orgs/<fallback-slug>/dashboard
//   8. All checks pass                       → render shell

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const router            = useRouter();
  const pathname          = usePathname();
  const qc                = useQueryClient();
  const params            = useParams<{ slug: string }>();
  const slug              = params?.slug ? decodeURIComponent(params.slug) : null;
  const { isAuthenticated, isHydrating, hydrateAttempted, memberships, user, hydrate, setCurrentOrgId, pendingAccountSwap } = useAuthStore();

  // Slug resolution. The URL slug determines which org this tab is operating
  // in. If it matches a membership, that's our orgId. If it doesn't, the gate
  // effect below redirects to a valid one.
  const resolvedMembership = slug ? memberships.find(m => m.org_slug === slug) ?? null : null;
  const resolvedOrgId      = resolvedMembership?.org_id ?? null;

  // Mount-time: flush any pending toast queued before a full-page reload
  // (e.g. org switcher).
  useEffect(() => {
    flushToastQueue();
  }, []);

  // Slug-transition qc.clear() - fires when the URL slug changes between two
  // valid orgs. Drops every cached query so the new org's pages don't render
  // the previous org's data while their refetches are in flight.
  const prevSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (!resolvedOrgId) {
      prevSlugRef.current = null;
      return;
    }
    if (prevSlugRef.current === null) {
      prevSlugRef.current = slug;
      return;
    }
    if (prevSlugRef.current !== slug) {
      logger.info('OrgLayout', 'Switched org in the URL — clearing the previous org cached data', {
        userId:   user?.id,
        fromSlug: prevSlugRef.current,
        toSlug:   slug,
      });
      qc.clear();
      prevSlugRef.current = slug;
    }
  }, [slug, resolvedOrgId, user?.id, qc]);

  // Mirror URL slug → zustand currentOrgId so existing selectors
  // (useCurrentRole, useCurrentMembership) keep working unchanged. Also fires
  // a fire-and-forget Cognito write so `custom:current_org_id` tracks the
  // most-recently-active org (covers explicit logout, session expiry,
  // cross-device sign-in). Failures swallowed inside rememberLastOrgForNextLogin.
  useEffect(() => {
    if (!resolvedOrgId) return;
    if (user?.currentOrgId === resolvedOrgId) return;
    logger.info('OrgLayout', 'Setting the active org from the URL and saving it for next login', {
      userId:    user?.id,
      slug,
      orgId:     resolvedOrgId,
      previous:  user?.currentOrgId ?? null,
    });
    setCurrentOrgId(resolvedOrgId);
    void rememberLastOrgForNextLogin(resolvedOrgId);
  }, [resolvedOrgId, slug, user?.currentOrgId, user?.id, setCurrentOrgId]);

  // Loading-screen watchdog. If `isHydrating` stays true longer than the
  // axios timeout (10s) + buffer, force-reset the flag so the gate effect
  // can re-evaluate and either redirect to /auth/login or render content
  // with what's in the store. This breaks the "stuck on loading screen
  // forever" case the user reported after cross-tab org-switch / sign-out
  // when the /me request's promise gets wedged (race with token mutation,
  // backgrounded-tab throttling, etc.). Bounded - one-shot reset, no retry
  // loop, per [[feedback_redirect_loops_forbidden]].
  useEffect(() => {
    if (!isHydrating) return;
    const t = setTimeout(() => {
      if (useAuthStore.getState().isHydrating) {
        logger.error('OrgLayout', 'Session load stuck past 12s — force-resetting to clear the loading screen', {
          userId:           useAuthStore.getState().user?.id ?? 'anonymous',
          hadTokens:        Boolean(getTokens()),
          membershipsCount: useAuthStore.getState().memberships.length,
        });
        useAuthStore.getState().forceResetHydrate();
      }
    }, 12_000);
    return () => clearTimeout(t);
  }, [isHydrating, user?.id]);

  // Tab-visibility re-hydration - picks up role/membership changes from
  // other sessions on tab focus. Throttled to 30s.
  //
  // Uses refreshMemberships() (silent /me) NOT hydrate(): hydrate() flips
  // isHydrating, which makes the render-gate below swap to <TransientShell />
  // and unmount `children`. That remount wiped out in-page state — e.g. an
  // open delete-project/OTP modal vanished the moment the user alt-tabbed to
  // copy the code and came back. refreshMemberships() updates the same
  // role/membership data with no isHydrating flip, so the page (and any open
  // modal) stays mounted. Per [[feedback_db_state_authoritative]].
  const lastHydrateRef = useRef<number>(0);
  useEffect(() => {
    function maybeHydrate(trigger: string) {
      if (document.visibilityState !== 'visible') return;
      if (!useAuthStore.getState().isAuthenticated) return;
      const now = Date.now();
      if (now - lastHydrateRef.current < 30_000) return;
      lastHydrateRef.current = now;
      logger.info('OrgLayout', `Refreshing your session (${trigger}) to pick up role or membership changes`, {
        userId: useAuthStore.getState().user?.id ?? 'anonymous',
      });
      void useAuthStore.getState().refreshMemberships();
    }
    function onVisibility() { maybeHydrate('visibilitychange'); }
    function onFocus()      { maybeHydrate('focus'); }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Auth gate. Logs only on an actual decision (a redirect) — not on every
  // render — so the console isn't flooded with a snapshot on each navigation.
  useEffect(() => {
    // Pending account-swap takes priority. Banner is up via CrossTabSync;
    // don't redirect, don't hydrate - wait for the user's banner choice.
    if (pendingAccountSwap) {
      return;
    }

    if (!getTokens()) {
      logger.info('OrgLayout', 'No session tokens — redirecting to login', { slug, pathname });
      router.replace('/auth/login');
      return;
    }

    // Fire hydrate only if we haven't attempted yet. Failed hydrate (429 etc.)
    // flips hydrateAttempted=true and we fall through to /auth/login instead
    // of looping.
    if (!user && !isHydrating && !hydrateAttempted) {
      hydrate();
      return;
    }

    if (isHydrating) return;

    if (!isAuthenticated) {
      logger.info('OrgLayout', 'Session check failed — redirecting to login', {
        userId: user?.id ?? 'anonymous', slug,
      });
      router.replace('/auth/login');
      return;
    }

    if (memberships.length === 0) {
      logger.info('OrgLayout', "You're not in any organization yet — sending you to the welcome page", {
        userId: user?.id,
      });
      router.replace('/welcome');
      return;
    }

    // Slug invalid - redirect to a real org.
    if (!resolvedMembership) {
      const fallback = memberships.find(m => m.org_id === user?.currentOrgId) ?? memberships[0];
      if (!fallback) {
        router.replace('/welcome');
        return;
      }
      logger.warn('OrgLayout', "You're not a member of the org in the URL — redirecting to one you can access", {
        userId:        user?.id,
        attemptedSlug: slug,
        fallbackSlug:  fallback.org_slug,
      });
      router.replace(orgRoute(fallback.org_slug, '/dashboard'));
      return;
    }
  }, [isHydrating, isAuthenticated, hydrateAttempted, memberships, user, hydrate, router, slug, resolvedMembership, resolvedOrgId, pathname, pendingAccountSwap]);

  // Render gate — stale-while-revalidate. Show the loading shell only when
  // there is NO usable session to render: account-swap banner up, not
  // authenticated, no memberships, or the URL slug doesn't resolve to one of
  // them (all of these also drive a redirect in the effect above).
  //
  // Deliberately NOT gated on `isHydrating`. A usable session that's merely
  // being re-validated in the background (the focus/visibility refresh, a
  // cross-tab hydrate) must keep rendering — blanking on `isHydrating`
  // unmounted `children` on every silent refresh and wiped in-progress
  // in-page state: open delete-org / delete-project OTP modals vanished the
  // instant the user alt-tabbed to copy the emailed code and came back,
  // half-filled forms reset, scroll jumped. We keep showing current (valid)
  // data and swap to fresh atomically when /me returns — hydrate() only
  // mutates the store on success, so there's no flicker or error window. The
  // initial load is still covered: `!isAuthenticated` holds until the first
  // hydrate succeeds, so the shell shows then.
  if (pendingAccountSwap || !isAuthenticated || memberships.length === 0 || !resolvedMembership) {
    return <TransientShell />;
  }

  const canManageBilling = resolvedMembership.role === 'owner' || resolvedMembership.role === 'admin';

  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <Sidebar />
      <SubscriptionBanner
        status={resolvedMembership.subscription_status}
        slug={resolvedMembership.org_slug}
        canManageBilling={canManageBilling}
      />
      <main className="md:ml-60 pt-14 pb-9 min-h-screen">
        <div className="h-full">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

// Minimal "we're working on it" shell. Replaces the previous null-return so
// transient states (hydrate in flight, redirect pending, account-swap banner
// up) never present as a fully blank screen. Logo + footer for visual
// continuity; main area shows a centered "Loading…" indicator.
function TransientShell() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex h-14 items-center border-b border-border bg-surface-raised px-4">
        <Logo size={28} />
      </header>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-text-subtle">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
