'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { confirmSignUp, resendSignUpCode } from '@/lib/cognito-client';
import { logger } from '@/lib/logger';
import { Logo } from '@/components/Logo';

function VerifyForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';
  const inviteToken  = searchParams.get('invite');

  const [email, setEmail]           = useState(initialEmail);
  const [code, setCode]             = useState('');
  const [loading, setLoading]       = useState(false);
  const [resending, setResending]   = useState(false);
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError]   = useState('');

  function validate(): boolean {
    let ok = true;
    setEmailError('');
    setCodeError('');

    if (!email.trim() || !email.includes('@')) {
      setEmailError('Enter a valid email address');
      ok = false;
    }
    if (!code.trim() || code.trim().length < 4) {
      setCodeError('Enter the code from your email');
      ok = false;
    }
    return ok;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    logger.info('VerifyPage', 'Submitting the email verification code', { userId: email });

    try {
      await confirmSignUp(email.toLowerCase(), code.trim());
      logger.info('VerifyPage', 'Email verified — routing to sign-in', { userId: email });
      toast.success('Email verified! Please sign in.');
      const loginUrl = inviteToken
        ? `/auth/login?email=${encodeURIComponent(email.toLowerCase())}&invite=${encodeURIComponent(inviteToken)}`
        : `/auth/login?email=${encodeURIComponent(email.toLowerCase())}`;
      router.push(loginUrl);
    } catch (err: unknown) {
      const message = parseAuthError(err, 'Verification failed. Check the code and try again.');
      logger.error('VerifyPage', 'Email verification failed', { userId: email, error: message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email.trim() || !email.includes('@')) {
      setEmailError('Enter your email first');
      return;
    }
    setResending(true);
    try {
      await resendSignUpCode(email.toLowerCase());
      toast.success('A new code was sent to your email.');
    } catch (err: unknown) {
      const message = parseAuthError(err, 'Could not resend code');
      toast.error(message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={40} />
          <p className="text-sm text-text-subtle">Verify your email</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            <p className="text-xs text-text-subtle">
              We sent a 6-digit code to your email. Enter it below to confirm your account.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-text">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                placeholder="you@example.com"
                disabled={loading}
                className={`rounded border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary disabled:opacity-60 ${emailError ? 'border-danger' : 'border-border'}`}
              />
              {emailError && <p className="text-xs text-danger">{emailError}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-sm font-medium text-text">Verification code</label>
              <input
                id="code"
                type="text"
                autoComplete="one-time-code"
                inputMode="numeric"
                value={code}
                onChange={e => { setCode(e.target.value); if (codeError) setCodeError(''); }}
                placeholder="123456"
                disabled={loading}
                className={`rounded border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary disabled:opacity-60 ${codeError ? 'border-danger' : 'border-border'}`}
              />
              {codeError && <p className="text-xs text-danger">{codeError}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded bg-primary px-4 py-2 text-sm font-medium text-white outline-none transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Verifying…' : 'Verify email'}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-xs text-text-link hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending ? 'Resending…' : 'Resend code'}
            </button>

          </form>
        </div>

        <p className="mt-4 text-center text-sm text-text-subtle">
          Wrong email?{' '}
          <Link href="/auth/register" className="font-medium text-text-link hover:underline">
            Start over
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}

function parseAuthError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.name === 'CodeMismatchException')  return 'Incorrect code. Try again.';
    // Cognito returns ExpiredCodeException for both an actually-expired code AND
    // for invalid codes once internal thresholds are crossed - message honestly
    // covers both so users aren't told "expired" when they typed gibberish.
    if (err.name === 'ExpiredCodeException')   return 'Invalid or expired code. Try again, or request a new one.';
    if (err.name === 'LimitExceededException') return 'Too many attempts. Try again in a few minutes.';
    if (err.name === 'NotAuthorizedException') return 'This account is already verified. Please sign in.';
    return err.message || fallback;
  }
  return fallback;
}
