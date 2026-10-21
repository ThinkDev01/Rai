import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type {
  ApiResponse, Project, ProjectSummary,
  CreateProjectPayload, UpdateProjectPayload,
} from '@/types/api.types';

// ── Query keys ────────────────────────────────────────────────────────────────
//
// Every tenant-scoped queryKey starts with ['org', orgId, ...] per
// standards.md §3 "React Query cache keys start with orgId". The orgId
// argument is `string | null | undefined` so callers can pass it directly
// from the auth store without nullish-handling at the call site; we coerce
// to the literal 'none' sentinel when orgId is missing so the key shape
// stays uniform (still useful for invalidation when an org switch arrives
// before currentOrgId is repopulated).

type OrgIdArg = string | null | undefined;
const orgSlug = (orgId: OrgIdArg) => orgId ?? 'none';

export const projectKeys = {
  all:    (orgId: OrgIdArg)              => ['org', orgSlug(orgId), 'projects'] as const,
  detail: (orgId: OrgIdArg, id: string)  => ['org', orgSlug(orgId), 'projects', id] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

export function useProjects() {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useQuery({
    queryKey: projectKeys.all(orgId),
    queryFn: () =>
      api.get<ApiResponse<ProjectSummary[]>>('/projects').then(r => r.data.data),
    enabled: Boolean(orgId),
  });
}

export function useProject(id: string) {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useQuery({
    queryKey: projectKeys.detail(orgId, id),
    queryFn: () =>
      api.get<ApiResponse<Project>>(`/projects/${id}`).then(r => r.data.data),
    enabled: !!id && Boolean(orgId),
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateProject() {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) =>
      api.post<ApiResponse<Project>>('/projects', payload).then(r => r.data.data),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      toast.success(`Project "${project.name}" created`);
    },
    onError: (err) => {
      const message = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? 'Failed to create project')
        : 'Failed to create project';
      toast.error(message);
    },
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (payload: UpdateProjectPayload) =>
      api.patch<ApiResponse<Project>>(`/projects/${id}`, payload).then(r => r.data.data),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, id) });
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      toast.success(`Project "${project.name}" updated`);
    },
    onError: () => toast.error('Failed to update project'),
  });
}

export function useArchiveProject(id: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: () =>
      api.patch<ApiResponse<Project>>(`/projects/${id}`, { archived: true }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, id) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
      toast.success('Project archived');
    },
    onError: () => toast.error('Failed to archive project'),
  });
}

// Unarchive - re-enables a previously archived project. Per rbac.md the gate
// is owner / admin / PM-in / PM-on-public (same as archive). Backend clears
// archived_at when archived flips back to false (column stays for audit
// after v3 picks up the date display).
export function useUnarchiveProject(id: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: () =>
      api.patch<ApiResponse<Project>>(`/projects/${id}`, { archived: false }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, id) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
      toast.success('Project unarchived');
    },
    onError: () => toast.error('Failed to unarchive project'),
  });
}

// Delete is OTP-gated (action 'delete_project'): the caller passes the 6-digit
// code from the confirm modal, sent in the request body. Backend re-verifies
// the code + the owner/admin role before the cascade delete.
export function useDeleteProject(id: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (otpCode: string) => api.delete(`/projects/${id}`, { data: { otpCode } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      qc.removeQueries({ queryKey: projectKeys.detail(orgId, id) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
      toast.success('Project deleted');
    },
    onError: () => toast.error('Failed to delete project'),
  });
}

// ── Pinning (personal, My Work quick-access) ───────────────────────────────────
//
// Pins are a *me* resource (`/me/pins/projects/:id`), but the pinned flag rides
// on the projects list response, so toggling invalidates the projects query to
// re-fetch fresh `isPinned` flags + re-float pinned projects to the top. Per
// standards we never optimistically patch — the server is the source of truth.
// The backend caps pins at 3/type and returns a 422 message we surface verbatim.

export function useToggleProjectPin() {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: ({ projectId, pin }: { projectId: string; pin: boolean }) =>
      pin
        ? api.put(`/me/pins/projects/${projectId}`)
        : api.delete(`/me/pins/projects/${projectId}`),
    onSuccess: (_data, { pin }) => {
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      toast.success(pin ? 'Project pinned' : 'Project unpinned');
    },
    onError: (err) => {
      const message = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? 'Could not update pin')
        : 'Could not update pin';
      toast.error(message);
    },
  });
}

export function useAddProjectMember(projectId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (userId: string) =>
      api.post<ApiResponse<Project>>(`/projects/${projectId}/members`, { userId }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      toast.success('Member added');
    },
    onError: () => toast.error('Failed to add member'),
  });
}

export function useRemoveProjectMember(projectId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/projects/${projectId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
  });
}
