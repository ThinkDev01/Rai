import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { initialsOf } from '@/lib/colors';
import type {
  MyWorkItem,
  SearchResult,
  Member,
  BurndownData,
  SprintReportData,
  VelocityPoint,
} from '@/types/api.types';
import type { OrgMemberWire, OrgRole } from '@/types/auth.types';

const useOrgId = () => useAuthStore(s => s.currentOrgId);

// ── My Work ───────────────────────────────────────────────────────────────────
export function useMyWork() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.myWork(orgId),
    enabled: !!orgId,
    queryFn: () => unwrap<MyWorkItem[]>(api.get('/me/tickets')),
  });
}

// ── Search ────────────────────────────────────────────────────────────────────
export function useSearch(q: string) {
  const orgId = useOrgId();
  const enabled = !!orgId && q.trim().length >= 2;
  return useQuery({
    queryKey: qk.search(orgId, q),
    enabled,
    staleTime: 0,
    placeholderData: [] as SearchResult[],
    queryFn: () => unwrap<SearchResult[]>(api.get(`/search?q=${encodeURIComponent(q.trim())}`)),
  });
}

// ── Team (org members) ──────────────────────────────────────────────────────────
function adaptMember(w: OrgMemberWire): Member {
  return {
    id: w.user_id,
    name: w.name,
    email: w.email,
    role_type: w.role,
    role_name: w.role_label ?? '',
    initials: initialsOf(w.name || w.email),
    joinedAt: w.joined_at,
  };
}

export function useTeamMembers() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.team(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      // Backend wraps: data = { members: [...] }.
      const data = await unwrap<{ members: OrgMemberWire[] }>(api.get(`/orgs/${orgId}/members`));
      return (data.members ?? []).map(adaptMember);
    },
  });
}

export function useUpdateMemberRole() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const hydrate = useAuthStore(s => s.hydrate);
  return useMutation({
    mutationFn: ({
      memberId,
      role_type,
      role_name,
    }: {
      memberId: string;
      role_type?: OrgRole;
      role_name?: string;
    }) =>
      unwrap<unknown>(
        api.patch(`/orgs/${orgId}/members/${memberId}`, { role_type, role_name }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.team(orgId) });
      hydrate();
      toast.success('Role updated');
    },
    onError: e => toast.error(extractApiError(e, 'Could not update role')),
  });
}

export function useRemoveMember() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      unwrap<unknown>(api.delete(`/orgs/${orgId}/members/${memberId}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.team(orgId) });
      toast.success('Member removed');
    },
    onError: e => toast.error(extractApiError(e, 'Could not remove member')),
  });
}

// ── Ticket pin ────────────────────────────────────────────────────────────────
export function useToggleTicketPin() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      pinned
        ? unwrap<unknown>(api.delete(`/me/pins/tickets/${id}`))
        : unwrap<unknown>(api.put(`/me/pins/tickets/${id}`)),
    onMutate: async ({ id, pinned }) => {
      await qc.cancelQueries({ queryKey: qk.myWork(orgId) });
      const prev = qc.getQueryData<MyWorkItem[]>(qk.myWork(orgId));
      qc.setQueryData<MyWorkItem[]>(qk.myWork(orgId), old =>
        old?.map(item =>
          item.ticket.id === id
            ? { ...item, ticket: { ...item.ticket, isPinned: !pinned } }
            : item,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.myWork(orgId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.myWork(orgId) }),
  });
}

// ── Feedback ──────────────────────────────────────────────────────────────────
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: ({ title, body }: { title: string; body: string }) =>
      unwrap<unknown>(api.post('/feedback', { title, body })),
    onSuccess: () => toast.success('Feedback sent — thank you!'),
    onError: e => toast.error(extractApiError(e, 'Could not send feedback')),
  });
}

// ── Reports ────────────────────────────────────────────────────────────────────
export function useBurndown(projectId: string, sprintId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.burndown(orgId, projectId, sprintId),
    enabled: !!orgId && !!projectId && !!sprintId,
    queryFn: () =>
      unwrap<BurndownData>(
        api.get(`/projects/${projectId}/reports/burndown?sprintId=${sprintId}`),
      ),
  });
}

export function useSprintReport(projectId: string, sprintId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.sprintReport(orgId, projectId, sprintId),
    enabled: !!orgId && !!projectId && !!sprintId,
    queryFn: () =>
      unwrap<SprintReportData>(
        api.get(`/projects/${projectId}/reports/sprint-report?sprintId=${sprintId}`),
      ),
  });
}

export function useVelocity(projectId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.velocity(orgId, projectId),
    enabled: !!orgId && !!projectId,
    queryFn: () => unwrap<VelocityPoint[]>(api.get(`/projects/${projectId}/reports/velocity`)),
  });
}
