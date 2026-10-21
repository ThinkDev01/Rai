'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from '@/lib/icons';
import { toast } from 'sonner';
import { confirmForgotPassword } from '@/lib/cognito-client';
import { logger } from '@/lib/logger';
import { Logo } from '@/components/Logo';

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';

  const [email, setEmail]                 = useState(initialEmail);
  const [code, setCode]                   = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [emailError, setEmailError]       = useState('');
  const [codeError, setCodeError]         = useState('');
  const [passwordError, setPasswordError] = useState('');

  function validate(): boolean {
    let ok = true;
    setEmailError('');
    setCodeError('');
    setPasswordError('');

    if (!email.trim() || !email.includes('@')) {
      setEmailError('Enter a valid email address');
      ok = false;
    }
    if (!code.trim() || code.trim().length < 4) {
      setCodeError('Enter the code from your email');
      ok = false;
    }
    if (!password || password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      ok = false;
    }
    return ok;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    logger.info('ResetPasswordPage', 'Submitting the new password with the reset code', { userId: email });

    try {
      await confirmForgotPassword(email.toLowerCase(), code.trim(), password);
      logger.info('ResetPasswordPage', 'Password reset — routing to sign-in', { userId: email });
      toast.success('Password reset. Please sign in.');
      router.push(`/auth/login?email=${encodeURIComponent(email.toLowerCase())}`);
    } catch (err: unknown) {
      const message = parseAuthError(err, 'Reset failed. Check the code and try again.');
      logger.error('ResetPasswordPage', 'Password reset failed', { userId: email, error: message });
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
          <p className="text-sm text-text-subtle">Choose a new password</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            <p className="text-xs text-text-subtle">
              Enter the code we emailed you and pick a new password.
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
              <label htmlFor="code" className="text-sm font-medium text-text">Reset code</label>
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-text">
                New password
                <span className="ml-1 font-normal text-text-placeholder">(min. 8 characters)</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError(''); }}
                  placeholder="••••••••"
                  disabled={loading}
                  className={`w-full rounded border bg-surface-raised px-3 py-2 pr-10 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary disabled:opacity-60 ${passwordError ? 'border-danger' : 'border-border'}`}
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

            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded bg-primary px-4 py-2 text-sm font-medium text-white outline-none transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Resetting…' : 'Reset password'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function parseAuthError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.name === 'CodeMismatchException')    return 'Incorrect code. Try again.';
    // Cognito returns ExpiredCodeException for both expired AND invalid codes
    // once internal thresholds are crossed - message honestly covers both.
    if (err.name === 'ExpiredCodeException')     return 'Invalid or expired code. Try again, or request a new one.';
    if (err.name === 'LimitExceededException')   return 'Too many attempts. Try again later.';
    if (err.name === 'InvalidPasswordException') return err.message;
    return err.message || fallback;
  }
  return fallback;
}
