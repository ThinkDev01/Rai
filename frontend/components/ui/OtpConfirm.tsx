/**
 * OtpConfirm — the shared email-OTP step for sensitive-action confirm modals
 * (delete org, transfer ownership, delete project). Replaces the old typed-name
 * guard: instead of retyping the org/project name, the user requests a code,
 * we email it, and they enter it to authorize the action.
 *
 * Two states it owns internally:
 *   - not sent → a "send code" button + a line saying where it'll go
 *   - sent     → the 6-digit input + a Resend link
 *
 * The `code` itself is lifted to the PARENT (controlled), so the parent's
 * existing confirm button can gate on `code.length === 6` and pass it to the
 * mutation. Backend re-verifies the code on the action endpoint, so this is a
 * UX gate, not the security boundary.
 */

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Mail } from '@/lib/icons';
import { useAuthStore } from '@/store/auth.store';
import { useRequestActionOtp, otpError } from '@/hooks/useOtp';
import type { OtpAction } from '@/types/api.types';

export function OtpConfirm({
  action,
  targetId,
  code,
  onCodeChange,
  disabled = false,
}: {
  action: OtpAction;
  /** Org id or project id the code is minted against (must match the action). */
  targetId: string;
  code: string;
  onCodeChange: (code: string) => void;
  /** Locked while the parent mutation is in flight. */
  disabled?: boolean;
}) {
  const email = useAuthStore(s => s.user?.email ?? 'your email');
  const [sent, setSent] = useState(false);
  const { mutate: requestOtp, isPending } = useRequestActionOtp();

  function send() {
    requestOtp(
      { action, targetId },
      {
        onSuccess: () => {
          setSent(true);
          toast.success(`Verification code sent to ${email}`);
        },
        onError: (err) => toast.error(otpError(err, 'Could not send the verification code')),
      },
    );
  }

  if (!sent) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={send}
          disabled={disabled || isPending}
          className="inline-flex w-fit items-center gap-1.5 rounded border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Mail size={14} />
          {isPending ? 'Sending…' : 'Email me a verification code'}
        </button>
        <p className="text-xs text-text-subtle">
          We&apos;ll send a 6-digit code to <span className="font-medium text-text">{email}</span> to confirm this action.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="otp-code" className="text-xs font-medium text-text">Verification code</label>
      <input
        id="otp-code"
        type="text"
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        value={code}
        // Digits only, capped at 6 — keeps the value aligned with the backend's
        // /^\d{6}$/ check so the confirm button enables exactly when valid.
        onChange={e => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="123456"
        disabled={disabled}
        autoFocus
        className="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm tracking-[0.3em] text-text outline-none transition-colors duration-150 placeholder:tracking-normal placeholder:text-text-placeholder focus:border-primary disabled:opacity-60"
      />
      <p className="text-xs text-text-subtle">
        Code sent to <span className="font-medium text-text">{email}</span>.{' '}
        <button
          type="button"
          onClick={send}
          disabled={disabled || isPending}
          className="font-medium text-text-link hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Resending…' : 'Resend code'}
        </button>
      </p>
    </div>
  );
}
