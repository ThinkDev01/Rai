'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { completeFederatedSignIn, consumePostLoginRedirect } from '@/lib/cognito-client';
import { logger } from '@/lib/logger';
import { Logo } from '@/components/Logo';

// Module-level guard so we exchange each authorization code exactly once
// across every effect re-run (React 19 Strict Mode double-mount, Turbopack HMR).
// Codes are single-use at Cognito; a duplicate exchange returns invalid_grant.
const processedCodes = new Set<string>();

function CallbackInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const errParam = searchParams.get('error');
  const errDesc  = searchParams.get('error_description');
  const code     = searchParams.get('code');
  const state    = searchParams.get('state');

  useEffect(() => {
    if (errParam) {
      const msg = errDesc || errParam;
      logger.error('CallbackPage', 'Sign-in provider returned an error', { userId: 'anonymous', error: msg });
      setError(humanizeOauthError(msg));
      return;
    }
    if (!code) {
      setError('No authorization code in callback URL.');
      return;
    }
    if (processedCodes.has(code)) {
      logger.info('CallbackPage', 'Auth code already exchanged — skipping the duplicate run', { userId: 'anonymous' });
      return;
    }
    processedCodes.add(code);

    void (async () => {
      try {
        logger.info('CallbackPage', 'Exchanging the sign-in code for tokens', { userId: 'anonymous' });
        await completeFederatedSignIn(code, state);
        // Honor a pre-OAuth post-login path if one was stashed (e.g. user
        // came in via /auth/login?invite=<token> and clicked "Sign in with
        // Microsoft" - we need to land them on /invite/<token> so the accept
        // flow can resume, not /welcome which drops the invite context).
        const postLogin = consumePostLoginRedirect();
        const target    = postLogin ?? '/welcome';
        logger.info('CallbackPage', 'Federated sign-in complete — redirecting', { userId: 'anonymous', target });
        router.replace(target);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('CallbackPage', 'Federated sign-in callback failed', { userId: 'anonymous', error: msg });
        setError(msg);
      }
    })();
  }, [errParam, errDesc, code, state, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={40} />
          {error ? (
            <>
              <p className="text-sm text-danger">Sign-in failed</p>
              <p className="text-xs text-text-subtle break-words text-left">{error}</p>
              <button
                onClick={() => router.replace('/auth/login')}
                className="mt-4 text-xs text-text-link hover:underline"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <p className="text-sm text-text-subtle">Signing you in…</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}

function humanizeOauthError(msg: string): string {
  if (msg.includes('invalid_client'))          return 'Provider configuration error. Please contact support.';
  if (msg.includes('access_denied'))           return 'You declined the sign-in request.';
  if (msg.includes('invalid_request'))         return 'Bad sign-in request. Please try again.';
  if (msg.toLowerCase().includes('cancelled')) return 'Sign-in was cancelled.';
  return msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
}
