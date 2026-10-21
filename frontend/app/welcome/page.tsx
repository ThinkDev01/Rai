'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { ChevronLeft, ArchiveRestore } from '@/lib/icons';
import { getTokens, refreshTokens, signOut } from '@/lib/cognito-client';
import { queryClient } from '@/lib/queryClient';
import api from '@/lib/api';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/store/auth.store';
import { Logo } from '@/components/Logo';
import { defaultDashboardRoute, orgRoute } from '@/lib/routes';
import { confirmModal } from '@/lib/confirmModal';
import { useDomainPeers } from '@/hooks/useDomainPeers';
import { useDeletedOrgs, useRestoreOrg, deletedOrgSubLabel, type DeletedOrg } from '@/hooks/useDeletedOrgs';
import type { MeResponseData } from '@/types/auth.types';
import type { ApiResponse } from '@/types/api.types';

// /welcome - empty-state + auto-pick router (RF-4).
//   - Zero memberships                 → CreateOrgSection
//   - 1+ memberships + currentOrgId set → redirect to /dashboard
//   - 1+ memberships + currentOrgId null → auto-pick first org → redirect to /dashboard
// The switcher UI that used to live here moved to <Header />. Auto-pick stays
// here because federated sign-ins (Google/Microsoft) land with currentOrgId null
// - without auto-pick we'd loop with the (app) layout's no-currentOrgId guard.
//
// StrictMode runs effects twice in dev: a useRef would reset across mount→
// unmount→remount, so we use a module-scoped Set keyed by user id instead.
// Clears on full page reload (which is the right semantics - user explicitly retried).
const autoPickedForUser = new Set<string>();

// Circuit breaker for /welcome's auto-redirect. /welcome and the org layout
// each decide redirects from their OWN view of /me - /welcome via React Query
// (['me']), the org layout via the zustand store. If those two views disagree
// (classic case: an org you just left/deleted is still in /welcome's cache but
// gone from the store), they ping-pong /welcome ↔ /orgs/<slug>/dashboard
// forever. The fresh-on-mount /me below is the real fix; this counter is the
// hard backstop required by [[feedback_redirect_loops_forbidden]]: after a few
// bounces in one page session we STOP redirecting and render an escape screen
// instead of spinning. Module-scoped so it survives StrictMode remounts;
// resets on full page reload (an explicit user retry).
const MAX_AUTO_REDIRECTS = 3;
let welcomeRedirectCount = 0;

interface OrgRow {
  id:                  string;
  name:                string;
  slug:                string;
  subscription_status: 'trial' | 'active' | 'suspended' | 'cancelled';
}

interface CreateOrgResponseData {
  org:              OrgRow;
  mustRefreshToken: boolean;
}

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,49}$/;

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function extractAxiosError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data) {
    const body = err.response.data as { error?: string };
    if (body.error) return body.error;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

// Default export wraps the inner page in Suspense — Next 16 build fails the
// static prerender pass for any page that calls useSearchParams() at the
// top level without a Suspense boundary above it. `/welcome` is a static
// (non-dynamic) route, so it gets prerendered; the wrapper makes the
// search-param read happen client-side after hydration. Fallback is null
// because the page typically redirects within a tick anyway — flashing a
// loader would be more disruptive than a blank moment.
export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomePageInner />
    </Suspense>
  );
}

function WelcomePageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  // `?create=1` - force-show the create-org form even when memberships exist.
  // Used by the Header org-switcher and Settings page's "Add another org"
  // button so logged-in users with existing orgs can create another one.
  // `?from=<slug>` - remembered "previous org" slug so the back link in this
  // intentional-create flow lands the user back where they were.
  const forceCreate = searchParams.get('create') === '1';
  const fromSlug    = searchParams.get('from');

  // Gate render on client mount - page depends on localStorage tokens.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Set when the circuit breaker trips - renders an escape screen instead of
  // redirecting again.
  const [loopBroken, setLoopBroken] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    if (!getTokens()) {
      logger.warn('WelcomePage', 'No session tokens — redirecting to login', { userId: 'anonymous' });
      router.replace('/auth/login');
    }
  }, [router, mounted]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      logger.info('WelcomePage', 'Loading your account', { userId: 'anonymous' });
      const res = await api.get<ApiResponse<MeResponseData>>('/me');
      if (!res.data.success) throw new Error(res.data.error || 'Failed to load /me');
      return res.data.data;
    },
    enabled: mounted && Boolean(getTokens()),
    retry:   false,
    // Authoritative-on-mount. The global default is staleTime 60s, which let
    // /welcome redirect off up-to-60s-stale memberships and ping-pong with the
    // org layout (which reads the live store). Force a fresh /me every time
    // /welcome mounts and never serve the cached copy for the redirect
    // decision below. Per [[feedback_db_state_authoritative]].
    staleTime:      0,
    refetchOnMount: 'always',
  });

  // Auto-pick first org if memberships exist but currentOrgId is null. This is
  // the federation landing path - Cognito doesn't set custom:current_org_id on
  // first sign-in, so without auto-pick we'd ping-pong between /welcome and
  // /dashboard forever (the (app) layout requires currentOrgId).
  const autoPick = useMutation({
    mutationFn: async (orgId: string) => {
      logger.info('WelcomePage', 'Auto-selecting your first organization', { userId: data?.user.id, orgId });
      const res = await api.post<ApiResponse<{ orgId: string; mustRefreshToken: boolean }>>(
        '/auth/switch-org',
        { orgId },
      );
      if (!res.data.success) throw new Error(res.data.error || 'Auto-pick failed');
      return res.data.data;
    },
    onSuccess: async (result) => {
      if (result.mustRefreshToken) await refreshTokens();
      await useAuthStore.getState().hydrate();
      const ms = useAuthStore.getState().memberships;
      router.replace(defaultDashboardRoute(ms, result.orgId));
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not select organization';
      logger.error('WelcomePage', 'Could not auto-select an organization', { userId: data?.user.id, error: msg });
      toast.error(msg);
      // Don't redirect - leave user on /welcome so they can see the error and
      // retry by reloading. Better than infinite loop on backend outage.
    },
  });

  useEffect(() => {
    if (!data) return;
    // Never decide a redirect off stale cache - wait for the fresh /me to land.
    // With staleTime:0 + refetchOnMount:'always', a cached value renders first
    // with isFetching=true; we hold until the refetch settles so the redirect
    // uses the SAME memberships the org layout sees. This is what actually
    // breaks the /welcome ↔ /dashboard loop.
    if (isFetching) return;
    const { user, memberships } = data;

    // No memberships → render CreateOrgSection below; no redirect. Reset the
    // loop counter - we've reached a stable, non-redirecting state.
    if (memberships.length === 0) { welcomeRedirectCount = 0; return; }

    // Intentional "Create another org" flow - skip auto-redirect; let the user
    // see + submit the create form even though they already have memberships.
    if (forceCreate) return;

    // Circuit breaker. If we've already auto-redirected several times this page
    // session, a loop is in progress - stop and render an escape screen rather
    // than bouncing again. Per [[feedback_redirect_loops_forbidden]].
    if (welcomeRedirectCount >= MAX_AUTO_REDIRECTS) {
      logger.error('WelcomePage', 'Auto-redirect loop detected — stopping on /welcome so you can recover', {
        userId: user.id, attempts: welcomeRedirectCount,
      });
      setLoopBroken(true);
      return;
    }

    // Has currentOrgId → redirect to that org's dashboard.
    if (user.currentOrgId) {
      welcomeRedirectCount += 1;
      router.replace(defaultDashboardRoute(memberships, user.currentOrgId));
      return;
    }

    // Has memberships but no currentOrgId → auto-pick first one (once per user).
    if (autoPickedForUser.has(user.id) || autoPick.isPending) return;
    const first = memberships[0];
    if (!first) return;
    autoPickedForUser.add(user.id);
    welcomeRedirectCount += 1;
    autoPick.mutate(first.org_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isFetching, router]);

  if (!mounted) return null;

  async function handleSignOut() {
    logger.info('WelcomePage', 'Sign out clicked — asking for confirmation', { userId: data?.user.id ?? 'anonymous' });
    const ok = await confirmModal({
      title:        'Sign out?',
      description:  'You will be signed out of all tabs in this browser.',
      confirmLabel: 'Sign out',
      variant:      'danger',
    });
    if (!ok) {
      logger.info('WelcomePage', 'Sign out cancelled', { userId: data?.user.id ?? 'anonymous' });
      return;
    }
    try {
      // "Last org" Cognito write is handled continuously by the org layout's
      // slug effect on org-scoped routes. /welcome is outside that tree, so
      // by the time we sign out the attribute already reflects the user's
      // most recent org-scoped activity. No extra write needed here.
      await signOut();
      queryClient.clear();
      toast.success('Signed out');
      router.replace('/auth/login');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('WelcomePage', 'Sign-out failed', { userId: data?.user.id ?? 'anonymous', error: msg });
      toast.error('Sign-out failed');
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <p className="text-sm text-text-subtle">Loading your account…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="max-w-md text-center space-y-3">
          <p className="text-sm text-danger">Could not load your account</p>
          <p className="text-xs text-text-subtle">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <button
            onClick={() => router.replace('/auth/login')}
            className="text-xs text-text-link hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // Circuit breaker tripped - we were stuck bouncing between /welcome and an
  // org dashboard. Stop and give the user explicit ways out instead of looping.
  if (loopBroken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="max-w-md text-center space-y-3">
          <p className="text-sm text-danger">We couldn&apos;t open your workspace</p>
          <p className="text-xs text-text-subtle">
            Something kept redirecting in a loop. Reload to try again, or sign out and back in.
          </p>
          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-text-link hover:underline"
            >
              Reload
            </button>
            <button
              onClick={handleSignOut}
              className="text-xs text-text-link hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // memberships > 0 and we're NOT in the intentional "create another" flow:
  // either redirecting to /dashboard or auto-picking. Specific copy so user
  // knows which state they're in (esp. on slower auto-pick where a generic
  // "Loading…" feels stuck).
  if (data.memberships.length > 0 && !forceCreate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <p className="text-sm text-text-subtle">
          {data.user.currentOrgId ? 'Loading your workspace…' : 'Selecting your organization…'}
        </p>
      </div>
    );
  }

  const { user } = data;
  // Resolve the back-link target for the intentional create flow. Prefer the
  // `?from=<slug>` value if it matches a real membership; otherwise pick the
  // default dashboard (currentOrgId or first membership). Used to give the
  // user an explicit way out - they came from somewhere; they can return.
  const backTarget = (() => {
    if (!forceCreate) return null;
    if (data.memberships.length === 0) return null;
    const fromMatch = fromSlug
      ? data.memberships.find(m => m.org_slug === fromSlug)
      : null;
    if (fromMatch) return orgRoute(fromMatch.org_slug, '/dashboard');
    return defaultDashboardRoute(data.memberships, data.user.currentOrgId);
  })();

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">

        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={40} />
          <p className="text-sm text-text-subtle">
            {forceCreate ? 'New organization' : 'Welcome to Rai'}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-8 shadow-sm space-y-4">

          {backTarget && (
            <button
              type="button"
              onClick={() => router.push(backTarget)}
              className="flex cursor-pointer items-center gap-1 -mt-2 -ml-2 px-2 py-1 text-xs text-text-placeholder transition-colors hover:text-text-subtle"
            >
              <ChevronLeft size={13} />
              Back
            </button>
          )}

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-text-placeholder">Signed in as</p>
            <p className="text-sm font-medium text-text">{user.email}</p>
            <p className="text-xs text-text-subtle">
              {user.emailVerified ? 'Email verified' : 'Email not yet verified'}
            </p>
          </div>

          <RecentlyDeletedOrgs />

          <div className="border-t border-border pt-4">
            <CreateOrgSection userId={user.id} userEmail={user.email} startWithForm={forceCreate} />
          </div>

          {/* Sign-out is hidden in the intentional-create flow - user is
              already in their app, not stranded on /welcome. */}
          {!forceCreate && (
            <button
              onClick={handleSignOut}
              className="w-full rounded border border-border bg-surface px-4 py-2 text-sm font-medium text-text outline-none transition-colors duration-150 hover:bg-surface-hover"
            >
              Sign out
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Create-org section (shown when memberships is empty) ─────────────────────
//
// Two-step UX: prompt screen → form. New users landing here are commonly
// here to ACCEPT AN INVITE (which arrives by email), not to create an org.
// Auto-revealing the form invited an accidental "I'll just fill this in"
// mistake - they'd end up as the owner of a new org instead of a member of
// the org that invited them. The gate is a deliberate confirm: "I want to
// create an org" vs "Wait, I'm here for an invite".
function CreateOrgSection({ userId, userEmail, startWithForm = false }: { userId: string; userEmail: string; startWithForm?: boolean }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName]               = useState('');
  const [slug, setSlug]               = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [nameError, setNameError]     = useState('');
  const [slugError, setSlugError]     = useState('');
  const [formError, setFormError]     = useState('');
  // `startWithForm` jumps straight to the form (used when this section is
  // rendered from the Header/Settings "Create new org" flow - user already
  // intended to create, so the two-path prompt would be redundant).
  const [showForm, setShowForm]       = useState(startWithForm);

  // Domain peer check - informational only. Empty for public-email-domain
  // signups (gmail/outlook/etc.) since backend skips those.
  // Pass userEmail explicitly because the welcome page doesn't hydrate the
  // zustand auth store (it uses its own raw /me query), so the hook's
  // default zustand-derived email would be null here.
  const { data: peerOrgs = [] } = useDomainPeers(userEmail);

  const createOrg = useMutation({
    mutationFn: async (payload: { name: string; slug: string }) => {
      logger.info('WelcomePage', 'Creating your new organization', { userId, slug: payload.slug });
      try {
        const res = await api.post<ApiResponse<CreateOrgResponseData>>('/orgs', payload);
        if (!res.data.success) throw new Error(res.data.error || 'Failed to create org');
        return res.data.data;
      } catch (err) {
        throw new Error(extractAxiosError(err, 'Failed to create org'));
      }
    },
    onSuccess: async (result) => {
      logger.info('WelcomePage', 'Organization created — opening it', { userId, orgId: result.org.id });
      if (result.mustRefreshToken) await refreshTokens();
      await qc.invalidateQueries({ queryKey: ['me'] });
      await useAuthStore.getState().hydrate();
      toast.success(`${result.org.name} created`);
      // Land directly in the newly-created org by slug.
      router.replace(`/orgs/${encodeURIComponent(result.org.slug)}/dashboard`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not create organization';
      logger.error('WelcomePage', 'Could not create the organization', { userId, error: msg });
      toast.error(msg);
      setFormError(msg);
    },
  });

  function validate(): boolean {
    let ok = true;
    setNameError('');
    setSlugError('');

    const nameTrimmed = name.trim();
    if (nameTrimmed.length < 2 || nameTrimmed.length > 100) {
      setNameError('Org name must be 2-100 characters');
      ok = false;
    }
    if (!SLUG_REGEX.test(slug)) {
      setSlugError('Lowercase letters, numbers, hyphens. Start with a letter. 2-50 chars.');
      ok = false;
    }
    return ok;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;
    createOrg.mutate({ name: name.trim(), slug });
  }

  function handleNameChange(value: string) {
    setName(value);
    if (nameError) setNameError('');
    if (formError) setFormError('');
    if (!slugTouched) setSlug(deriveSlug(value));
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugTouched(true);
    if (slugError) setSlugError('');
    if (formError) setFormError('');
  }

  const loading = createOrg.isPending;

  // Soft warning block - rendered above whichever sub-view is shown. Only
  // appears if backend returned domain peers (skips public-email domains).
  // Informational; doesn't block the user from creating anyway.
  const domainWarning = peerOrgs.length > 0 ? (
    <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-text-subtle">
      <p className="font-medium text-warning">An organization with your email domain already exists:</p>
      <p className="mt-1 text-text">
        {peerOrgs.map(o => o.name).join(', ')}
      </p>
      <p className="mt-1 text-text-placeholder">
        Ask an admin there for an invite if it&apos;s your team&apos;s workspace. Otherwise continue below.
      </p>
    </div>
  ) : null;

  // Gate state: prompt the user about which path they're on before
  // showing the create-org form. Most new accounts land here intending to
  // accept an invite - auto-showing the form was an easy mis-click into
  // creating an unwanted second org.
  //
  // When the domain warning is showing, the "Waiting for an invite?" bullet
  // becomes redundant (the warning itself already directs the user to ask
  // an admin for an invite). Hide it; only the "Starting fresh?" bullet
  // stays. When there's no warning (totally new domain), both bullets show
  // as before.
  const hasPeers = peerOrgs.length > 0;
  if (!showForm) {
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-text-placeholder">Get started</p>
          <p className="text-sm text-text-subtle">
            {hasPeers
              ? 'You\'re not part of any organization yet.'
              : 'You\'re not part of any organization yet. Two paths from here:'}
          </p>
        </div>

        {domainWarning}

        <ul className="space-y-2 pt-1 text-sm text-text-subtle">
          {!hasPeers && (
            <li className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
              <span>
                <span className="font-medium text-text">Waiting for an invite?</span> Check <span className="font-medium text-text">your email</span> - the invite link will sign you straight into the inviting organization. You can stay on this page until it arrives.
              </span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-success" />
            <span>
              <span className="font-medium text-text">Starting fresh?</span> Create your own organization and invite teammates from inside it.
            </span>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-white outline-none transition-colors duration-150 hover:bg-primary-hover"
        >
          Create an organization
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-text-placeholder">New organization</p>
          <p className="text-sm text-text-subtle">
            You&apos;ll be the owner. You can rename or transfer later.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(false); setName(''); setSlug(''); setSlugTouched(false); setNameError(''); setSlugError(''); setFormError(''); }}
          disabled={loading}
          className="flex-shrink-0 text-xs text-text-placeholder transition-colors hover:text-text disabled:opacity-50"
        >
          ← Back
        </button>
      </div>

      {domainWarning}

      {/* Trial note — sets expectations before they create (no card, 30 days). */}
      <div className="rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-xs text-text">
        <span className="font-medium">Starts with a 30-day free trial.</span>{' '}
        <span className="text-text-subtle">No card required — add billing anytime from Settings. After the trial, the org goes read-only until you subscribe.</span>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 pt-2">

        <div className="flex flex-col gap-1.5">
          <label htmlFor="org-name" className="text-sm font-medium text-text">
            Organization name
          </label>
          <input
            id="org-name"
            type="text"
            autoComplete="organization"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Acme Corp"
            disabled={loading}
            className={`rounded border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary disabled:opacity-60 ${nameError ? 'border-danger' : 'border-border'}`}
          />
          {nameError && <p className="text-xs text-danger">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="org-slug" className="text-sm font-medium text-text">
            Org identifier
            <span className="ml-1 font-normal text-text-placeholder">(used in URLs)</span>
          </label>
          <input
            id="org-slug"
            type="text"
            value={slug}
            onChange={e => handleSlugChange(e.target.value)}
            placeholder="acme"
            disabled={loading}
            className={`rounded border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary disabled:opacity-60 ${slugError ? 'border-danger' : 'border-border'}`}
          />
          {slugError && <p className="text-xs text-danger">{slugError}</p>}
        </div>

        {formError && (
          <div className="rounded border border-danger bg-danger/10 px-3 py-2 text-xs text-danger">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !name.trim() || !slug}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-white outline-none transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Creating…' : 'Create organization'}
        </button>

      </form>
    </div>
  );
}

// ── Recently deleted orgs (restore / recycle bin) ────────────────────────────
//
// Shows the caller's soft-deleted orgs that are still inside the 30-day recovery
// window, so an owner who accidentally deleted their org can get it back. Only
// the OWNER sees an org here (backend filters by role). Renders nothing when the
// list is empty — the common case — so it stays invisible for normal new users.
//
// Restore is a two-step confirm (per-row): click "Restore" → inline confirm →
// fire. On success we hard-navigate into the restored org so the org-layout
// guard re-hydrates cleanly (same pattern the delete flow uses).
function RecentlyDeletedOrgs() {
  const { data: deletedOrgs = [], isLoading } = useDeletedOrgs();
  const { mutate: restore, isPending } = useRestoreOrg();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [restoringId, setRestoringId]   = useState<string | null>(null);

  if (isLoading || deletedOrgs.length === 0) return null;

  function daysLeft(restoreUntil: string): number {
    const ms = new Date(restoreUntil).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  }

  function handleRestore(org: DeletedOrg) {
    setRestoringId(org.id);
    restore(org.id, {
      onSuccess: () => {
        toast.success(`${org.name} restored`);
        // Hard navigation so the org layout re-hydrates memberships cleanly.
        window.location.assign(`/orgs/${encodeURIComponent(org.slug)}/dashboard`);
      },
      onSettled: () => {
        setRestoringId(null);
        setConfirmingId(null);
      },
    });
  }

  return (
    <div className="border-t border-border pt-4 space-y-2">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-text-placeholder">Recently deleted</p>
        <p className="text-xs text-text-subtle">Restore an organization within 30 days of deleting it.</p>
      </div>

      <ul className="space-y-2">
        {deletedOrgs.map(org => {
          const left       = daysLeft(org.restore_until);
          const confirming = confirmingId === org.id;
          const busy       = isPending && restoringId === org.id;
          return (
            <li
              key={org.id}
              className="rounded border border-border bg-surface px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{org.name}</p>
                  <p className="text-xs text-text-placeholder">
                    @{org.slug} · {left} {left === 1 ? 'day' : 'days'} left to restore
                  </p>
                  {deletedOrgSubLabel(org) && (
                    <p className="text-xs text-text-placeholder">{deletedOrgSubLabel(org)}</p>
                  )}
                </div>
                {!confirming && (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(org.id)}
                    className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover"
                  >
                    <ArchiveRestore size={13} />
                    Restore
                  </button>
                )}
              </div>

              {confirming && (
                <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border pt-2.5">
                  <p className="text-xs text-text-subtle">Restore this organization?</p>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={busy}
                      className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestore(org)}
                      disabled={busy}
                      className="rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
