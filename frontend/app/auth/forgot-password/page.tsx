'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { forgotPassword } from '@/lib/cognito-client';
import { logger } from '@/lib/logger';
import { Logo } from '@/components/Logo';

function ForgotPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';

  const [email, setEmail]           = useState(initialEmail);
  const [loading, setLoading]       = useState(false);
  const [emailError, setEmailError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError('');

    if (!email.trim() || !email.includes('@')) {
      setEmailError('Enter a valid email address');
      return;
    }

    setLoading(true);
    logger.info('ForgotPasswordPage', 'Requesting a password-reset code', { userId: email });

    try {
      await forgotPassword(email.toLowerCase());
      toast.success('Reset code sent. Check your email.');
      router.push(`/auth/reset-password?email=${encodeURIComponent(email.toLowerCase())}`);
    } catch (err: unknown) {
      const message = parseAuthError(err, 'Could not send reset code');
      logger.error('ForgotPasswordPage', 'Could not send the password-reset code', { userId: email, error: message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={40} />
          <p className="text-sm text-text-subtle">Reset your password</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            <p className="text-xs text-text-subtle">
              Enter your account email and we&apos;ll send a 6-digit code to reset your password.
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

            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded bg-primary px-4 py-2 text-sm font-medium text-white outline-none transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Sending code…' : 'Send reset code'}
            </button>

          </form>
        </div>

        <p className="mt-4 text-center text-sm text-text-subtle">
          Remembered it?{' '}
          <Link href="/auth/login" className="font-medium text-text-link hover:underline">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}

function parseAuthError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.name === 'UserNotFoundException')  return 'No account with that email';
    if (err.name === 'LimitExceededException') return 'Too many attempts. Try again later.';
    return err.message || fallback;
  }
  return fallback;
}
