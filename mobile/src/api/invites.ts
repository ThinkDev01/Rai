import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type { OrgRole } from '@/types/auth.types';

const useOrgId = () => useAuthStore(s => s.currentOrgId);

export interface PendingInvite {
  id: string;
  invited_email: string;
  role: OrgRole;
  invited_by_name: string | null;
  invited_by_email: string;
  expires_at: string;
  created_at: string;
}

/** Matches backend PreviewInviteResponse (snake_case). */
export interface InvitePreview {
  org_name: string;
  role: OrgRole;
  invited_email: string;
  state: 'pending' | 'used' | 'revoked' | 'expired';
  expires_at: string;
}

export function usePendingInvites() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.pendingInvites(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      // Backend wraps: data = { invites: [...] }.
      const data = await unwrap<{ invites: PendingInvite[] }>(api.get(`/orgs/${orgId}/invites`));
      return data.invites ?? [];
    },
  });
}

export function useCreateInvite() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: OrgRole }) =>
      unwrap<unknown>(api.post(`/orgs/${orgId}/invites`, { email: email.trim().toLowerCase(), role })),
    onSuccess: (_d, { email }) => {
      qc.invalidateQueries({ queryKey: qk.pendingInvites(orgId) });
      toast.success(`Invite sent to ${email}`);
    },
    onError: e => toast.error(extractApiError(e, 'Could not send invite')),
  });
}

export function useRevokeInvite() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => unwrap<unknown>(api.post(`/invites/${inviteId}/revoke`, {})),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pendingInvites(orgId) });
      toast.success('Invite revoked');
    },
    onError: e => toast.error(extractApiError(e, 'Could not revoke invite')),
  });
}

/** Public preview (no auth needed). */
export function fetchInvitePreview(token: string) {
  return unwrap<InvitePreview>(api.get(`/invites/preview/${token}`));
}

export function useAcceptInvite() {
  const hydrate = useAuthStore(s => s.hydrate);
  return useMutation({
    mutationFn: (token: string) =>
      unwrap<{ orgSlug: string; orgId: string }>(api.post('/invites/accept', { token })),
    onSuccess: () => hydrate(),
    onError: e => toast.error(extractApiError(e, 'Could not accept invite')),
  });
}
