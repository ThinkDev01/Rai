import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type {
  Ticket,
  CreateTicketPayload,
  UpdateTicketPayload,
  TicketStatus,
} from '@/types/api.types';

const useOrgId = () => useAuthStore(s => s.currentOrgId);

export function useTicket(projectId: string, ticketKey: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.ticket(orgId, projectId, ticketKey),
    enabled: !!orgId && !!projectId && !!ticketKey,
    queryFn: () => unwrap<Ticket>(api.get(`/projects/${projectId}/tickets/${ticketKey}`)),
  });
}

function invalidateTicketScopes(qc: ReturnType<typeof useQueryClient>, orgId: string | null, projectId: string) {
  qc.invalidateQueries({ queryKey: qk.project(orgId, projectId) });
  qc.invalidateQueries({ queryKey: qk.projects(orgId) });
  qc.invalidateQueries({ queryKey: qk.myWork(orgId) });
  qc.invalidateQueries({ queryKey: qk.reports(orgId) });
}

export function useCreateTicket(projectId: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTicketPayload) =>
      unwrap<Ticket>(api.post(`/projects/${projectId}/tickets`, payload)),
    onSuccess: t => {
      invalidateTicketScopes(qc, orgId, projectId);
      toast.success(`Ticket ${t.key} created`);
    },
    onError: e => toast.error(extractApiError(e, 'Could not create ticket')),
  });
}

export function useUpdateTicket(projectId: string, ticketId: string, ticketKey?: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateTicketPayload) =>
      unwrap<Ticket>(api.patch(`/projects/${projectId}/tickets/${ticketId}`, payload)),
    onSuccess: () => {
      invalidateTicketScopes(qc, orgId, projectId);
      if (ticketKey) qc.invalidateQueries({ queryKey: qk.ticket(orgId, projectId, ticketKey) });
      toast.success('Ticket updated');
    },
    onError: e => toast.error(extractApiError(e, 'Could not update ticket')),
  });
}

/** Board drag / status move — same PATCH, quieter toast. */
export function useMoveTicket(projectId: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: string; status: TicketStatus }) =>
      unwrap<Ticket>(api.patch(`/projects/${projectId}/tickets/${ticketId}`, { status })),
    onSuccess: () => invalidateTicketScopes(qc, orgId, projectId),
    onError: e => toast.error(extractApiError(e, 'Failed to move ticket')),
  });
}

export function useDeleteTicket(projectId: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) =>
      unwrap<unknown>(api.delete(`/projects/${projectId}/tickets/${ticketId}`)),
    onSuccess: () => {
      invalidateTicketScopes(qc, orgId, projectId);
      toast.success('Ticket deleted');
    },
    onError: e => toast.error(extractApiError(e, 'Could not delete ticket')),
  });
}
