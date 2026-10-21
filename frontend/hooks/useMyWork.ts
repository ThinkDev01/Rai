import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse, MyWorkItem } from '@/types/api.types';

// `/me/tickets` returns the caller's assignments scoped to req.context.org_id;
// keyed under the active org per standards.md §3 so an org switch can't
// surface tickets from the previous org.
type OrgIdArg = string | null | undefined;
const orgSlug = (orgId: OrgIdArg) => orgId ?? 'none';

const myWorkKey = (orgId: OrgIdArg) => ['org', orgSlug(orgId), 'my-work'] as const;

export function useMyWork() {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useQuery({
    queryKey: myWorkKey(orgId),
    queryFn: () =>
      api.get<ApiResponse<MyWorkItem[]>>('/me/tickets').then(r => r.data.data),
    enabled: Boolean(orgId),
  });
}

// ── Ticket pinning (personal, My Work quick-access) ────────────────────────────
//
// Pins live at `/me/pins/tickets/:id`; the `isPinned` flag rides on each
// /me/tickets row, so toggling invalidates the my-work query to re-fetch fresh
// flags. No optimistic patch — the server is authoritative. Backend caps pins
// at 3 and returns a 422 message we surface verbatim.
export function useToggleTicketPin() {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: ({ ticketId, pin }: { ticketId: string; pin: boolean }) =>
      pin
        ? api.put(`/me/pins/tickets/${ticketId}`)
        : api.delete(`/me/pins/tickets/${ticketId}`),
    onSuccess: (_data, { pin }) => {
      qc.invalidateQueries({ queryKey: myWorkKey(orgId) });
      toast.success(pin ? 'Ticket pinned' : 'Ticket unpinned');
    },
    onError: (err) => {
      const message = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? 'Could not update pin')
        : 'Could not update pin';
      toast.error(message);
    },
  });
}
