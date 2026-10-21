import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { projectKeys } from '@/hooks/useProjects';
import type {
  ApiResponse, Ticket,
  CreateTicketPayload, UpdateTicketPayload,
} from '@/types/api.types';

// orgId-prefixed query keys per standards.md §3.
type OrgIdArg = string | null | undefined;
const orgSlug = (orgId: OrgIdArg) => orgId ?? 'none';
const ticketKey = (orgId: OrgIdArg, projectId: string, key: string) =>
  ['org', orgSlug(orgId), 'projects', projectId, 'tickets', key] as const;

function ticketError(err: unknown, fallback: string): string {
  return axios.isAxiosError(err)
    ? (err.response?.data?.error ?? fallback)
    : fallback;
}

export function useTicket(projectId: string, ticketKeyArg: string) {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useQuery({
    queryKey: ticketKey(orgId, projectId, ticketKeyArg),
    queryFn: () =>
      api.get<ApiResponse<Ticket>>(`/projects/${projectId}/tickets/${ticketKeyArg}`).then(r => r.data.data),
    enabled: !!projectId && !!ticketKeyArg && Boolean(orgId),
  });
}

export function useCreateTicket(projectId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (payload: CreateTicketPayload) =>
      api.post<ApiResponse<Ticket>>(`/projects/${projectId}/tickets`, payload).then(r => r.data.data),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      // Dashboard / sidebar list rolls up ticket counts + active sprint name +
      // last-active per project - invalidate the list so summaries stay in
      // sync with detail. Closes the v1 "dashboard ↔ project mismatch" item.
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
      toast.success(`Ticket ${ticket.key} created`);
    },
    onError: (err) => toast.error(ticketError(err, 'Failed to create ticket')),
  });
}

export function useUpdateTicket(projectId: string, ticketId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (payload: UpdateTicketPayload) =>
      api.patch<ApiResponse<Ticket>>(`/projects/${projectId}/tickets/${ticketId}`, payload).then(r => r.data.data),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      qc.invalidateQueries({ queryKey: ticketKey(orgId, projectId, ticket.key) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
      toast.success('Ticket updated');
    },
    onError: (err) => toast.error(ticketError(err, 'Failed to update ticket')),
  });
}

export function useMoveTicket(projectId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: string; status: string }) =>
      api.patch<ApiResponse<Ticket>>(`/projects/${projectId}/tickets/${ticketId}`, { status }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      // Dashboard / sidebar list rolls up ticket counts + active sprint name +
      // last-active per project - invalidate the list so summaries stay in
      // sync with detail. Closes the v1 "dashboard ↔ project mismatch" item.
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
    },
    onError: (err) => toast.error(ticketError(err, 'Failed to move ticket')),
  });
}

export function useDeleteTicket(projectId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (ticketId: string) =>
      api.delete(`/projects/${projectId}/tickets/${ticketId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      // Dashboard / sidebar list rolls up ticket counts + active sprint name +
      // last-active per project - invalidate the list so summaries stay in
      // sync with detail. Closes the v1 "dashboard ↔ project mismatch" item.
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
      toast.success('Ticket deleted');
    },
    onError: (err) => toast.error(ticketError(err, 'Failed to delete ticket')),
  });
}

export function useDeleteAttachment(projectId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete(`/attachments/${attachmentId}`),
    onSuccess: () => {
      // The full ticket detail query (which carries the attachment list) lives
      // under ['org', slug, 'projects', projectId, 'tickets', key] — invalidate
      // the tickets prefix + the project rollup so the tile disappears from the
      // detail page and any summary counts stay in sync.
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'projects', projectId, 'tickets'] });
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      toast.success('Attachment deleted');
    },
    onError: (err) => toast.error(ticketError(err, 'Failed to delete attachment')),
  });
}
