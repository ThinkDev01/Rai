'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { X, UserPlus } from '@/lib/icons';
import api from '@/lib/api';
import { logger } from '@/lib/logger';
import type { ApiResponse } from '@/types/api.types';

type InvitableRole = 'admin' | 'project_manager' | 'user';

const ROLE_OPTIONS: { value: InvitableRole; label: string; hint: string }[] = [
  { value: 'user',            label: 'Member',          hint: 'Project work - tickets, comments' },
  { value: 'project_manager', label: 'Project manager', hint: 'Project-level admin' },
  { value: 'admin',           label: 'Admin',           hint: 'Full org control + billing' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  orgId:   string;
  onClose: () => void;
}

export function InviteMemberModal({ orgId, onClose }: Props) {
  const qc                            = useQueryClient();
  const [email, setEmail]             = useState('');
  const [role, setRole]               = useState<InvitableRole>('user');
  const [emailError, setEmailError]   = useState('');
  const [formError, setFormError]     = useState('');

  const invite = useMutation({
    mutationFn: async (payload: { email: string; role: InvitableRole }) => {
      logger.info('InviteMemberModal', 'Sending a member invite', { userId: 'self', orgId, email: payload.email, role: payload.role });
      try {
        const res = await api.post<ApiResponse<unknown>>(`/orgs/${orgId}/invites`, payload);
        if (!res.data.success) throw new Error(res.data.error || 'Failed to send invite');
        return res.data;
      } catch (err) {
        throw new Error(extractAxiosError(err, 'Failed to send invite'));
      }
    },
    onSuccess: () => {
      toast.success(`Invite sent to ${email}`);
      qc.invalidateQueries({ queryKey: ['pending-invites', orgId] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not send invite';
      logger.error('InviteMemberModal', 'Could not send the invite', { userId: 'self', orgId, error: msg });
      setFormError(msg);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setEmailError('');

    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError('Enter a valid email address');
      return;
    }
    invite.mutate({ email: trimmed, role });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-raised shadow-xl">

        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-text">Invite a member</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 p-6">
          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium text-text">Email address</label>
            <input
              id="invite-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (emailError) setEmailError('');
                if (formError)  setFormError('');
              }}
              placeholder="teammate@company.com"
              disabled={invite.isPending}
              className={`w-full rounded border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary disabled:opacity-60 ${emailError ? 'border-danger' : 'border-border'}`}
            />
            {emailError && <p className="text-xs text-danger">{emailError}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-role" className="text-sm font-medium text-text">Role</label>
            <select
              id="invite-role"
              value={role}
              onChange={e => setRole(e.target.value as InvitableRole)}
              disabled={invite.isPending}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary disabled:opacity-60"
            >
              {ROLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-text-placeholder">
              {ROLE_OPTIONS.find(o => o.value === role)?.hint}
            </p>
          </div>

          {formError && (
            <div className="rounded border border-danger bg-danger/10 px-3 py-2 text-xs text-danger">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={invite.isPending}
              className="rounded border border-border px-4 py-1.5 text-sm text-text-subtle transition-colors hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={invite.isPending || !email.trim()}
              className="flex items-center gap-1.5 rounded bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus size={13} />
              {invite.isPending ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>

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
