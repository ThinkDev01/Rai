'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from '@/lib/icons';
import { toast } from 'sonner';
import { signUp } from '@/lib/cognito-client';
import { logger } from '@/lib/logger';
import { Logo } from '@/components/Logo';

function RegisterForm() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';
  const inviteToken  = searchParams.get('invite');

  const router = useRouter();
  const [name, setName]                   = useState('');
  const [email, setEmail]                 = useState(initialEmail);
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [nameError, setNameError]         = useState('');
  const [emailError, setEmailError]       = useState('');
  const [passwordError, setPasswordError] = useState('');

  function validate(): boolean {
    let ok = true;
    setNameError('');
    setEmailError('');
    setPasswordError('');

    if (!name.trim() || name.trim().length < 2) {
      setNameError(name.trim() ? 'Name must be at least 2 characters' : 'Full name is required');
      ok = false;
    }

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
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      ok = false;
    }

    return ok;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    logger.info('RegisterPage', 'Submitting the sign-up form', { userId: 'anonymous', email });

    try {
      await signUp(email.toLowerCase(), password, name.trim());
      logger.info('RegisterPage', 'Account created — routing to email verification', { userId: email });
      toast.success('Account created! Check your email for the verification code.');
      const verifyUrl = inviteToken
        ? `/auth/verify?email=${encodeURIComponent(email.toLowerCase())}&invite=${encodeURIComponent(inviteToken)}`
        : `/auth/verify?email=${encodeURIComponent(email.toLowerCase())}`;
      router.push(verifyUrl);
    } catch (err: unknown) {
      const message = parseAuthError(err, 'Registration failed. Please try again.');
      logger.error('RegisterPage', 'Sign-up failed', { userId: 'anonymous', error: message });
      toast.error(message);
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={40} />
          <p className="text-sm text-text-subtle">Create your account</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium text-text">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={e => { setName(e.target.value); if (nameError) setNameError(''); }}
                placeholder="Ada Lovelace"
                disabled={loading}
                className={`rounded border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors duration-150 placeholder:text-text-placeholder focus:border-primary disabled:opacity-60 ${nameError ? 'border-danger' : 'border-border'}`}
              />
              {nameError && <p className="text-xs text-danger">{nameError}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-text">
                Email
              </label>
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
              <label htmlFor="password" className="text-sm font-medium text-text">
                Password
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
              {loading ? 'Creating account…' : 'Create account'}
            </button>

          </form>
        </div>

        <p className="mt-4 text-center text-sm text-text-subtle">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-text-link hover:underline">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function parseAuthError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (err.name === 'UsernameExistsException')  return 'An account with this email already exists';
    if (err.name === 'InvalidPasswordException') return err.message;
    if (err.name === 'InvalidParameterException') return err.message;
    return err.message || fallback;
  }
  return fallback;
}
