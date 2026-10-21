'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from '@/lib/icons';
import { toast } from 'sonner';
import { signIn, startFederatedSignIn, isFederationConfigured, getTokens } from '@/lib/cognito-client';
import { logger } from '@/lib/logger';
import { Logo } from '@/components/Logo';
import { GoogleLogo, MicrosoftLogo } from '@/components/BrandLogos';
import { useAuthStore } from '@/store/auth.store';
import { defaultDashboardRoute } from '@/lib/routes';

// Hard timeout around every network call - industry-standard pattern, can't hang
// the UI indefinitely. Forces a clear error if Cognito stalls.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[timeout] ${label} did not respond in ${ms}ms`)), ms),
    ),
  ]);
}

function LoginForm() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';
  const inviteToken  = searchParams.get('invite');
  // Safe relative-only redirect — prevents open-redirect attacks.
  const redirectParam = searchParams.get('redirect');
  const safeRedirect  = redirectParam?.startsWith('/') ? redirectParam : null;

  const router = useRouter();
  const [email, setEmail]                 = useState(initialEmail);
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [emailError, setEmailError]       = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError]         = useState('');
  const [loading, setLoading]             = useState(false);

  // Cross-tab propagation - if another tab signs in (or this tab was opened
  // while a sibling tab is already authenticated), bounce to the right
  // dashboard rather than making the user sign in again. Matches Jira /
  // Linear behavior.
  //
  // Two triggers:
  //   - On mount: if tokens already exist in localStorage, skip the form.
  //   - Storage event: another tab just signed in (tokens appeared) → same.
  //
  // Invite caveat: if `?invite=<token>` is on the URL, route to /invite/<token>
  // instead - user followed an invite link and the signed-in account can
  // accept the invite directly without going through /dashboard first.
  useEffect(() => {
    async function redirectIfSignedIn(reason: string) {
      if (!getTokens()) return;
      logger.info('LoginPage', `Already signed in (${reason}) — skipping the form and redirecting`, {
        userId: useAuthStore.getState().user?.id ?? 'unknown',
        hasInvite: Boolean(inviteToken),
      });
      if (inviteToken) {
        router.replace(`/invite/${encodeURIComponent(inviteToken)}`);
        return;
      }
      await useAuthStore.getState().hydrate();
      const { user, memberships } = useAuthStore.getState();
      // Circuit breaker (per [[feedback_redirect_loops_forbidden]]): if
      // hydrate left user=null (network error reaching /me, expired tokens,
      // backend unreachable), defaultDashboardRoute returns '/welcome' for
      // empty memberships - and /welcome can't hydrate either, so it
      // bounces right back here. Loop. Stay on /auth/login instead; the
      // user can sign in fresh once the network is back.
      if (!user) {
        logger.warn('LoginPage', `Could not load your account — staying on the login page to avoid a redirect loop`, { reason });
        setFormError('Could not reach the server. Sign in again or check your connection.');
        return;
      }
      router.replace(safeRedirect ?? defaultDashboardRoute(memberships, user.currentOrgId));
    }

    void redirectIfSignedIn('mount + tokens already present');

    function onStorage() {
      void redirectIfSignedIn('storage event with tokens');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [router, inviteToken, safeRedirect]);

  function validate(): boolean {
    let ok = true;
    setEmailError('');
    setPasswordError('');

    if (!email.trim()) {
      setEmailError('Email is required');
      ok = false;
    } else if (!email.includes('@') || email.indexOf('@') === email.length - 1) {
      setEmailError('Enter a valid email address');
      ok = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      ok = false;
    }

    return ok;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    logger.info('LoginPage', 'Submitting the sign-in form', { userId: 'anonymous', email });

    if (!validate()) return;

    setLoading(true);
    setFormError('');

    try {
      const result = await withTimeout(
        signIn(email.toLowerCase(), password),
        15000,
        'signIn',
      );
      logger.info('LoginPage', 'Sign-in result received from Cognito', {
        userId:     email,
        isSignedIn: result.isSignedIn,
        nextStep:   result.nextStep ?? 'none',
      });

      if (!result.isSignedIn) {
        const step = result.nextStep ?? 'UNKNOWN';
        if (step === 'CONFIRM_SIGN_UP') {
          toast.message('Please verify your email first');
          router.push(`/auth/verify?email=${encodeURIComponent(email.toLowerCase())}`);
          return;
        }
        if (step === 'RESET_REQUIRED') {
          toast.message('Password reset required');
          router.push(`/auth/forgot-password?email=${encodeURIComponent(email.toLowerCase())}`);
          return;
        }
        setFormError(humanizeChallenge(step));
        return;
      }

      logger.info('LoginPage', 'Signed in successfully — routing into the app', { userId: email });
      toast.success('Signed in');
      // If user landed here via an invite link, bounce back to /invite/<token>
      // so the accept flow can resume. Otherwise the (app) layout decides
      // between /dashboard and /welcome based on memberships.
      router.push(inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : safeRedirect ?? '/welcome');
    } catch (err: unknown) {
      // UserNotConfirmedException is thrown (not returned as a nextStep) by
      // Cognito's USER_PASSWORD_AUTH flow when the user hasn't verified email.
      // Bounce them to the verify page directly - clearer UX than an inline error.
      if (err instanceof Error && err.name === 'UserNotConfirmedException') {
        logger.info('LoginPage', 'Email not verified yet — routing to the verification page', { userId: email });
        toast.message('Please verify your email first');
        router.push(`/auth/verify?email=${encodeURIComponent(email.toLowerCase())}`);
        return;
      }
      // Same idea for password-reset-required.
      if (err instanceof Error && err.name === 'PasswordResetRequiredException') {
        logger.info('LoginPage', 'Password reset required — routing to the reset flow', { userId: email });
        toast.message('Password reset required');
        router.push(`/auth/forgot-password?email=${encodeURIComponent(email.toLowerCase())}`);
        return;
      }

      const message = parseAuthError(err);
      logger.error('LoginPage', 'Sign-in failed', { userId: 'anonymous', error: message });
      setFormError(message);
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  async function handleFederated(provider: 'Google' | 'Microsoft') {
    logger.info('LoginPage', 'Starting federated sign-in', { userId: 'anonymous', provider, hasInvite: Boolean(inviteToken) });
    setLoading(true);
    setFormError('');
    try {
      // Preserve invite link through the OAuth roundtrip - callback will
      // honor this and land the user on /invite/<token> instead of /welcome.
      const postLogin = inviteToken
        ? `/invite/${encodeURIComponent(inviteToken)}`
        : null;
      await startFederatedSignIn(provider, postLogin);
      // Page redirects; nothing more to do here.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not start federated sign-in';
      logger.error('LoginPage', 'Federated sign-in failed', { userId: 'anonymous', provider, error: message });
      setFormError(message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-6">
      <div className="w-full max-w-sm">

        <div className="mb-5 flex flex-col items-center gap-2">
          <Logo size={36} />
          <div className="text-center">
            <h1 className="text-base font-semibold text-text">Welcome back</h1>
            <p className="text-xs text-text-subtle">Sign in to continue to Rai</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-text">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                  if (formError)  setFormError('');
                }}
                placeholder="you@example.com"
                disabled={loading}
                className={`h-10 rounded-md border bg-surface-raised px-3 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 ${emailError ? 'border-danger' : 'border-border'}`}
              />
              {emailError && <p className="text-xs text-danger">{emailError}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-text">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                    if (formError)     setFormError('');
                  }}
                  placeholder="••••••••"
                  disabled={loading}
                  className={`h-10 w-full rounded-md border bg-surface-raised px-3 pr-10 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 ${passwordError ? 'border-danger' : 'border-border'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-placeholder transition-colors duration-150 hover:text-text-subtle"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passwordError && <p className="text-xs text-danger">{passwordError}</p>}
            </div>

            <div className="-mt-1 text-right">
              <Link
                href={email ? `/auth/forgot-password?email=${encodeURIComponent(email)}` : '/auth/forgot-password'}
                className="text-xs text-text-link hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            {formError && (
              <div className="rounded border border-danger bg-danger/10 px-3 py-2 text-xs text-danger">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white outline-none transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

          </form>

          {isFederationConfigured && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-text-placeholder">Or continue with</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleFederated('Google')}
                  disabled={loading}
                  aria-label="Continue with Google"
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text outline-none transition-colors duration-150 hover:bg-surface-hover hover:border-text-placeholder disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleLogo size={16} />
                  <span>Google</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleFederated('Microsoft')}
                  disabled={loading}
                  aria-label="Continue with Microsoft"
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text outline-none transition-colors duration-150 hover:bg-surface-hover hover:border-text-placeholder disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <MicrosoftLogo size={16} />
                  <span>Microsoft</span>
                </button>
              </div>
            </>
          )}

        </div>

        <p className="mt-4 text-center text-sm text-text-subtle">
          Don&apos;t have an account?{' '}
          <Link
            href={inviteToken ? `/auth/register?invite=${encodeURIComponent(inviteToken)}` : '/auth/register'}
            className="font-medium text-text-link hover:underline"
          >
            Create one
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function parseAuthError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'NotAuthorizedException')         return 'Invalid email or password';
    if (err.name === 'UserNotFoundException')          return 'Invalid email or password';
    if (err.name === 'UserNotConfirmedException')      return 'Please verify your email first';
    if (err.name === 'PasswordResetRequiredException') return 'Password reset required';
    if (err.message.startsWith('[timeout]'))            return 'Cognito did not respond. Check your network and retry.';
    return err.message || 'Login failed';
  }
  return 'Login failed';
}

function humanizeChallenge(step: string): string {
  if (step === 'NEW_PASSWORD_REQUIRED')                     return 'Password reset required';
  if (step === 'SMS_MFA' || step === 'SOFTWARE_TOKEN_MFA') return 'MFA verification required';
  return `Additional step required: ${step}`;
}
