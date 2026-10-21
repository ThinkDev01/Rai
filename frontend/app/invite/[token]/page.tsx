'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { toast } from 'sonner';
import { getTokens, refreshTokens } from '@/lib/cognito-client';
import api from '@/lib/api';
import { logger } from '@/lib/logger';
import { useAuthStore } from '@/store/auth.store';
import { Logo } from '@/components/Logo';
import type { ApiResponse } from '@/types/api.types';

// /invite/[token] - confirm-then-accept. Token is bound to invited_email at the
// backend; only the matching account can redeem. Lifecycle (Q6 + RF-12):
//   pending → user clicks Accept → POST /invites/accept → joined
//   pending → user clicks Cancel → token stays live (no DB write); they can come back
//   used / revoked / expired → friendly card, no action
//   wrong-account → "sign out + retry" path
//
// Flow stages:
//   1. Fetch preview (public, no auth) → render org name + role
//   2. If logged out → button = "Sign in to accept" (preserves ?invite=token)
//   3. If logged in with matching email → button = "Accept" → POST /invites/accept
//   4. If logged in with wrong email → "This invite is for X - sign out" button

type InvitableRole = 'admin' | 'project_manager' | 'user';

interface PreviewResponse {
  org_name:      string;
  role:          InvitableRole;
  invited_email: string;
  state:         'pending' | 'expired' | 'used' | 'revoked';
  expires_at:    string;
}

interface AcceptResponse {
  org: { id: string; name: string; slug: string };
  mustRefreshToken: boolean;
}

const ROLE_LABEL: Record<InvitableRole, string> = {
  admin:           'Admin',
  project_manager: 'Project manager',
  user:            'Member',
};

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router    = useRouter();

  const [mounted, setMounted]   = useState(false);
  const [preview, setPreview]   = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // 1. Fetch preview on mount (public endpoint, no token interceptor needed
  //    but using `api` is fine - it just won't attach an auth header if there's
  //    no Cognito session).
  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      logger.info('AcceptInvitePage', 'Loading the invite details', { tokenPrefix: token.slice(0, 8) });
      try {
        const res = await api.get<ApiResponse<PreviewResponse>>(`/invites/preview/${encodeURIComponent(token)}`);
        if (!res.data.success) throw new Error(res.data.error || 'Could not load invite');
        if (!cancelled) {
          logger.info('AcceptInvitePage', 'Invite details loaded', { orgName: res.data.data.org_name, role: res.data.data.role, state: res.data.data.state });
          setPreview(res.data.data);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = extractAxiosError(err, 'Invite link is invalid');
        logger.error('AcceptInvitePage', 'Could not load the invite', { error: msg });
        setPreviewError(msg);
      }
    }
    if (mounted) loadPreview();
    return () => { cancelled = true; };
  }, [mounted, token]);

  // 2. Detect logged-in email for the matching-email check (purely UX -
  //    backend re-checks on accept regardless).
  const loggedInEmail = useAuthStore(s => s.user?.email ?? null);
  const hasLocalToken = mounted && Boolean(getTokens());

  // Trigger a store hydrate if we have a token but the store hasn't loaded yet
  // (e.g. user landed here directly from an email click, store hasn't run).
  useEffect(() => {
    if (mounted && hasLocalToken && loggedInEmail === null) {
      useAuthStore.getState().hydrate();
    }
  }, [mounted, hasLocalToken, loggedInEmail]);

  async function handleAccept() {
    if (!preview) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      logger.info('AcceptInvitePage', 'Accepting the invite', { userId: 'self' });
      const res = await api.post<ApiResponse<AcceptResponse>>('/invites/accept', { token });
      if (!res.data.success) throw new Error(res.data.error || 'Could not accept invite');

      const { org, mustRefreshToken } = res.data.data;
      if (mustRefreshToken) await refreshTokens();
      await useAuthStore.getState().hydrate();

      toast.success(`Joined ${org.name}`);
      // Land directly inside the freshly-joined org via slug-prefixed route.
      router.replace(`/orgs/${encodeURIComponent(org.slug)}/dashboard`);
    } catch (err) {
      const msg = extractAxiosError(err, 'Could not accept invite');
      logger.error('AcceptInvitePage', 'Could not accept the invite', { error: msg });
      setAcceptError(msg);
      setAccepting(false);
    }
  }

  async function handleSignOutAndRetry() {
    await useAuthStore.getState().clearAuth();
    router.replace(`/auth/login?invite=${encodeURIComponent(token)}`);
  }

  if (!mounted) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={40} />
          <p className="text-sm text-text-subtle">Organization invite</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-8 shadow-sm">
          {/* Preview not loaded yet */}
          {!preview && !previewError && (
            <p className="text-center text-sm text-text-subtle">Loading invite…</p>
          )}

          {/* Preview failed (404 / network) */}
          {previewError && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-danger">{previewError}</p>
              <Link href="/" className="text-xs text-text-link hover:underline">Back to Rai</Link>
            </div>
          )}

          {/* Lifecycle terminal states */}
          {preview && preview.state !== 'pending' && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium text-text">
                {preview.state === 'used'    && 'This invite has already been used.'}
                {preview.state === 'revoked' && 'This invite has been revoked.'}
                {preview.state === 'expired' && 'This invite has expired.'}
              </p>
              <p className="text-xs text-text-subtle">Ask the inviter for a new link.</p>
              <Link href="/" className="text-xs text-text-link hover:underline">Back to Rai</Link>
            </div>
          )}

          {/* Pending - render confirm card */}
          {preview && preview.state === 'pending' && (
            <div className="space-y-4">
              <div className="space-y-1 text-center">
                <p className="text-xs uppercase tracking-wide text-text-placeholder">You've been invited to</p>
                <p className="text-base font-semibold text-text">{preview.org_name}</p>
                <p className="text-xs text-text-subtle">as {ROLE_LABEL[preview.role]}</p>
              </div>

              <div className="rounded border border-border bg-surface px-3 py-2 text-xs text-text-subtle text-center">
                Invited address: <span className="font-medium text-text">{preview.invited_email}</span>
              </div>

              {acceptError && (
                <div className="rounded border border-danger bg-danger/10 px-3 py-2 text-xs text-danger cursor-text select-text">
                  {acceptError}
                </div>
              )}

              {/* Action: not logged in → Sign in / Create account */}
              {!hasLocalToken && (
                <div className="space-y-2">
                  <Link
                    href={`/auth/login?invite=${encodeURIComponent(token)}`}
                    className="block rounded bg-primary px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                  >
                    Sign in to accept
                  </Link>
                  <p className="text-center text-xs text-text-placeholder">
                    No account?{' '}
                    <Link
                      href={`/auth/register?invite=${encodeURIComponent(token)}`}
                      className="text-text-link hover:underline"
                    >
                      Create one
                    </Link>
                  </p>
                </div>
              )}

              {/* Action: logged in with matching email → Accept / Cancel */}
              {hasLocalToken && loggedInEmail && loggedInEmail.toLowerCase() === preview.invited_email.toLowerCase() && (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/"
                    className="rounded border border-border bg-surface px-4 py-2 text-center text-sm text-text-subtle transition-colors hover:bg-surface-hover"
                  >
                    Cancel
                  </Link>
                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                  >
                    {accepting ? 'Joining…' : 'Accept'}
                  </button>
                </div>
              )}

              {/* Action: logged in with wrong email → single combined block.
                  Warning text + actions consolidated so there's no ambiguity
                  about what's clickable. The previous version had a separate
                  warning div whose text mentioned "Sign out" and looked like
                  a button - confusing. */}
              {hasLocalToken && loggedInEmail && loggedInEmail.toLowerCase() !== preview.invited_email.toLowerCase() && (
                <div className="space-y-3">
                  <div className="rounded border border-warning bg-warning/10 px-3 py-2 text-xs text-warning cursor-text select-text">
                    You're signed in as <span className="font-medium">{loggedInEmail}</span>, but this invite is for <span className="font-medium">{preview.invited_email}</span>. Sign out and back in with the invited email to accept.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/"
                      className="rounded border border-border bg-surface px-4 py-2 text-center text-sm text-text-subtle transition-colors hover:bg-surface-hover"
                    >
                      Cancel
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOutAndRetry}
                      className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                    >
                      Sign out & switch
                    </button>
                  </div>
                </div>
              )}

              {/* Token loaded but store still hydrating */}
              {hasLocalToken && loggedInEmail === null && (
                <p className="text-center text-xs text-text-subtle">Checking your account…</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function extractAxiosError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data) {
    const body = err.response.data as { error?: string };
    if (body.error) return body.error;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
