import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type {
  Project,
  ProjectSummary,
  Ticket,
  CreateProjectPayload,
  UpdateProjectPayload,
} from '@/types/api.types';

const useOrgId = () => useAuthStore(s => s.currentOrgId);

// ── Runtime shape guards ──────────────────────────────────────────────────────
// TypeScript only describes the *expected* shape; it can't stop a malformed (but
// `success: true`) API response from omitting an array field. Render code that
// does `project.sprints.filter(...)` / `sprint.tickets.map(...)` would then throw,
// and with the app-wide ErrorBoundary that becomes a full recovery screen. These
// helpers normalise every collection to a real array at the single fetch
// chokepoint, so downstream screens can trust the shape.
const asArray = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

function normalizeTicket(t: Ticket): Ticket {
  return { ...t, subTicketKeys: asArray(t?.subTicketKeys), comments: asArray(t?.comments) };
}

function normalizeProject(p: Project): Project {
  if (!p) return p; // null/undefined → let screens hit their `!project` guard
  return {
    ...p,
    members: asArray(p.members),
    backlog: asArray(p.backlog).map(normalizeTicket),
    sprints: asArray(p.sprints).map(s => ({ ...s, tickets: asArray(s?.tickets).map(normalizeTicket) })),
  };
}

export function useProjects() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects(orgId),
    enabled: !!orgId,
    queryFn: async () => asArray(await unwrap<ProjectSummary[]>(api.get('/projects'))),
  });
}

export function useProject(id: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.project(orgId, id),
    enabled: !!orgId && !!id,
    queryFn: async () => normalizeProject(await unwrap<Project>(api.get(`/projects/${id}`))),
  });
}

export function useCreateProject() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) =>
      unwrap<Project>(api.post('/projects', payload)),
    onSuccess: p => {
      qc.invalidateQueries({ queryKey: qk.projects(orgId) });
      toast.success(`Project “${p.name}” created`);
    },
    onError: e => toast.error(extractApiError(e, 'Could not create project')),
  });
}

export function useUpdateProject(id: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateProjectPayload) =>
      unwrap<Project>(api.patch(`/projects/${id}`, payload)),
    onSuccess: p => {
      qc.invalidateQueries({ queryKey: qk.project(orgId, id) });
      qc.invalidateQueries({ queryKey: qk.projects(orgId) });
      qc.invalidateQueries({ queryKey: qk.myWork(orgId) });
      toast.success(`Project “${p.name}” updated`);
    },
    onError: e => toast.error(extractApiError(e, 'Could not update project')),
  });
}

export function useArchiveProject(id: string) {
  const u = useUpdateProject(id);
  return {
    ...u,
    archive: () => u.mutate({ archived: true }),
    unarchive: () => u.mutate({ archived: false }),
  };
}

export function useDeleteProject(id: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (otpCode: string) => unwrap<unknown>(api.delete(`/projects/${id}`, { data: { otpCode } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects(orgId) });
      toast.success('Project deleted');
    },
    onError: e => toast.error(extractApiError(e, 'Could not delete project')),
  });
}

export function useAddProjectMember(projectId: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap<unknown>(api.post(`/projects/${projectId}/members`, { userId })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.project(orgId, projectId) });
      toast.success('Member added');
    },
    onError: e => toast.error(extractApiError(e, 'Failed to add member')),
  });
}

export function useRemoveProjectMember(projectId: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap<unknown>(api.delete(`/projects/${projectId}/members/${userId}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.project(orgId, projectId) });
      toast.success('Member removed');
    },
    onError: e => toast.error(extractApiError(e, 'Failed to remove member')),
  });
}

export function useToggleProjectPin() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      pinned
        ? unwrap<unknown>(api.delete(`/me/pins/projects/${id}`))
        : unwrap<unknown>(api.put(`/me/pins/projects/${id}`)),
    onMutate: async ({ id, pinned }) => {
      await qc.cancelQueries({ queryKey: qk.projects(orgId) });
      const prev = qc.getQueryData<ProjectSummary[]>(qk.projects(orgId));
      qc.setQueryData<ProjectSummary[]>(qk.projects(orgId), old =>
        old?.map(p => (p.id === id ? { ...p, isPinned: !pinned } : p)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.projects(orgId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.projects(orgId) }),
  });
}
