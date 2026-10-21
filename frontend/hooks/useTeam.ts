import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse, Member, UserRole } from '@/types/api.types';

// ── Query keys ────────────────────────────────────────────────────────────────
//
// Standards.md §3 - every tenant-scoped queryKey starts with ['org', orgId, ...].
// The `orgId ?? 'none'` sentinel keeps the key shape uniform when no org is
// active (between switches, during sign-in race) and gives invalidation a
// stable target.

type OrgIdArg = string | null | undefined;
const orgSlug = (orgId: OrgIdArg) => orgId ?? 'none';

export const teamKeys = {
  all:         (orgId: OrgIdArg)                     => ['org', orgSlug(orgId), 'team'] as const,
  userTickets: (orgId: OrgIdArg, userId: string)     => ['org', orgSlug(orgId), 'user-tickets', userId] as const,
};

// ── Org-members → Member[] adapter ────────────────────────────────────────────
//
// v1 had a global /users endpoint. v2 lists members per org at
// /api/v1/orgs/:orgId/members (orgs module owns membership). The shape on the
// wire is `{user_id, email, name, role, role_label, joined_at}` per org; the
// frontend Member contract is `{id, name, email, role_type, role_name,
// initials}`. We adapt at the hook boundary so callers (AddMemberModal,
// project member pickers, etc.) keep using the legacy `Member` type unchanged.

interface OrgMemberWire {
  user_id:    string;
  email:      string;
  name:       string | null;
  role:       UserRole;
  role_label: string | null;
  joined_at:  string;
}

const ROLE_LABEL_FALLBACK: Record<UserRole, string> = {
  owner:           'Owner',
  admin:           'Admin',
  project_manager: 'Project Manager',
  user:            'Member',
};

function computeInitials(name: string | null, email: string): string {
  const source = (name && name.trim()) ? name : email;
  const cleaned = source.includes('@')
    ? (source.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim()
    : source.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return (parts[0]!.slice(0, 2) || '?').toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function adaptOrgMember(row: OrgMemberWire): Member {
  return {
    id:        row.user_id,
    name:      row.name ?? row.email,
    email:     row.email,
    role_type: row.role,
    role_name: row.role_label ?? ROLE_LABEL_FALLBACK[row.role],
    initials:  computeInitials(row.name, row.email),
    joinedAt:  row.joined_at,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * All members of the caller's current org, in `Member` shape. Idle while no
 * `currentOrgId` is set (e.g. between org switches). Cancelled orgs surface
 * through the org-scope middleware as a 403 - react-query will show it as an
 * error so callers can react.
 */
export function useTeamMembers() {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);

  return useQuery({
    queryKey: teamKeys.all(orgId),
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ members: OrgMemberWire[] }>>(`/orgs/${orgId}/members`);
      return res.data.data.members.map(adaptOrgMember);
    },
    enabled: Boolean(orgId),
  });
}

/** Cross-project assignee listing - AI agent / drilling into a member. */
export function useUserTickets(userId: string) {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useQuery({
    queryKey: teamKeys.userTickets(orgId, userId),
    queryFn: () => api.get<ApiResponse<unknown[]>>(`/users/${userId}/tickets`).then(r => r.data.data),
    enabled: !!userId && Boolean(orgId),
  });
}

// ── Admin mutations ──────────────────────────────────────────────────────────
//
// PATCH /orgs/:orgId/members/:userId   - change role + display label
// DELETE /orgs/:orgId/members/:userId  - remove from org
//
// Backend enforces every rbac.md guard (only owner/admin can call; no self;
// owner cannot be demoted or removed). Frontend surfaces backend errors
// verbatim so the user sees the rejection reason.

function teamError(err: unknown, fallback: string): string {
  return axios.isAxiosError(err)
    ? (err.response?.data?.error ?? fallback)
    : fallback;
}

// Both `role_type` and `role_name` are optional - backend accepts either or
// both. Self-edits (including owner self-renaming a custom label) send
// `role_name` only and skip `role_type`.
export function useUpdateMemberRole() {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);

  return useMutation({
    mutationFn: async ({ memberId, role_type, role_name }: {
      memberId: string;
      role_type?: UserRole;
      role_name?: string;
    }) => {
      const body: { role_type?: UserRole; role_name?: string } = {};
      if (role_type !== undefined) body.role_type = role_type;
      if (role_name !== undefined) body.role_name = role_name;
      const res = await api.patch<ApiResponse<{ member: unknown }>>(
        `/orgs/${orgId}/members/${memberId}`,
        body,
      );
      return res.data.data.member;
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: teamKeys.all(orgId) });
      // Self-edits (label rename) also need to update the auth store so
      // the renamed label flows to Header / Sidebar / Settings right away.
      await useAuthStore.getState().hydrate();
      toast.success('Role updated');
    },
    onError: (err) => toast.error(teamError(err, 'Failed to update role')),
  });
}

export function useDeleteMember() {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);

  return useMutation({
    mutationFn: (memberId: string) =>
      api.delete(`/orgs/${orgId}/members/${memberId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all(orgId) });
      toast.success('Member removed');
    },
    onError: (err) => toast.error(teamError(err, 'Failed to remove member')),
  });
}

// ── Ownership transfer ──────────────────────────────────────────────────────
//
// Atomic owner→admin + recipient→owner swap on the backend. After success:
//   - membership list updates (owner & former-owner roles changed)
//   - auth store must re-hydrate so the caller's UI reflects the new role
//   - React Query cache is cleared because role gating changes everywhere
//
// OTP-gated in v2 (action 'transfer_ownership'): the caller passes the 6-digit
// code from the confirm modal alongside the recipient. Backend re-verifies the
// code + owner role before the atomic swap.

export function useTransferOwnership() {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);

  return useMutation({
    mutationFn: async ({ recipientId, otpCode }: { recipientId: string; otpCode: string }) => {
      const res = await api.post<ApiResponse<unknown>>(
        `/orgs/${orgId}/transfer-ownership`,
        { recipientId, otpCode },
      );
      if (!res.data.success) throw new Error(res.data.error || 'Failed to transfer ownership');
    },
    onSuccess: async () => {
      // Re-hydrate so the caller's currentOrgRole flips to 'admin' immediately.
      await useAuthStore.getState().hydrate();
      // Nuke everything role-gated (project visibility, RBAC-derived UI).
      qc.clear();
      toast.success('Ownership transferred');
    },
    onError: (err) => toast.error(teamError(err, 'Failed to transfer ownership')),
  });
}

// ── Leave organization (self) ───────────────────────────────────────────────
//
// User-initiated exit. Backend rejects owners (must transfer first). Caller
// handles the post-mutation redirect since destination depends on remaining
// memberships (/welcome if none left, another org's dashboard otherwise).

export function useLeaveOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      const res = await api.post<ApiResponse<unknown>>(`/orgs/${orgId}/leave`);
      if (!res.data.success) throw new Error(res.data.error || 'Failed to leave organization');
    },
    onSuccess: async () => {
      await useAuthStore.getState().hydrate();
      qc.clear();
    },
    onError: (err) => toast.error(teamError(err, 'Failed to leave organization')),
  });
}

// ── Delete organization (owner only) ────────────────────────────────────────
//
// Soft-delete (recycle bin): the org is recoverable for 30 days, then a purge
// job hard-deletes it. OTP-gated in v2 (action 'delete_org'): the caller passes
// the 6-digit code from the confirm modal in the request body. Backend
// re-verifies the code + owner role. Caller handles the post-mutation redirect;
// the restore path lives in hooks/useDeletedOrgs.ts.

export function useDeleteOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, otpCode }: { orgId: string; otpCode: string }) => {
      const res = await api.delete<ApiResponse<unknown>>(`/orgs/${orgId}`, { data: { otpCode } });
      if (!res.data.success) throw new Error(res.data.error || 'Failed to delete organization');
    },
    onSuccess: async () => {
      await useAuthStore.getState().hydrate();
      qc.clear();
    },
    onError: (err) => toast.error(teamError(err, 'Failed to delete organization')),
  });
}
