import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse } from '@/types/api.types';

// A soft-deleted org the caller owns and can still restore. `deleted_at` and
// `restore_until` arrive as ISO strings over JSON; the UI parses them for the
// "X days left" countdown. Mirrors backend DeletedOrgRow.
export interface DeletedOrg {
  id:            string;
  name:          string;
  slug:          string;
  deleted_at:    string;
  restore_until: string;
  // Billing snapshot — billing keeps ticking while soft-deleted, so the owner
  // can see how much trial/subscription time is left before restoring. Nullable.
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled' | null;
  trial_ends_at:       string | null;
  current_period_end:  string | null;
}

interface DeletedOrgsResponse {
  orgs: DeletedOrg[];
}

interface RestoreOrgResponse {
  org: { id: string; name: string; slug: string };
}

function deletedOrgsError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data?.error) return err.response.data.error as string;
  return err instanceof Error ? err.message : fallback;
}

function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** Short billing label for a deleted org's restore card ("Trial: 12 days left",
 *  "Subscription: 8 days left", "Trial ended — read-only"), or null when there's
 *  nothing useful to show. Billing keeps running while soft-deleted (v2 doesn't
 *  pause it), so this tells the owner how much time is left before they restore. */
export function deletedOrgSubLabel(org: DeletedOrg): string | null {
  switch (org.subscription_status) {
    case 'trialing': {
      const d = daysUntil(org.trial_ends_at);
      return d > 0 ? `Trial: ${d} ${d === 1 ? 'day' : 'days'} left` : 'Trial ended — read-only';
    }
    case 'active': {
      const d = daysUntil(org.current_period_end);
      return d > 0 ? `Subscription: ${d} ${d === 1 ? 'day' : 'days'} left` : 'Subscription due';
    }
    case 'past_due':
      return 'Trial ended — read-only';
    default:
      return null;
  }
}

/**
 * The caller's "recently deleted" orgs - soft-deleted, owned by the caller, and
 * still inside the 30-day recovery window. Powers the restore list on the
 * create-org / welcome page. Only the owner ever sees an org here.
 *
 * `enabled` lets the welcome page gate the fetch on having a session, matching
 * how it gates the /me query.
 */
export function useDeletedOrgs(enabled = true) {
  return useQuery({
    queryKey: ['deleted-orgs'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<DeletedOrgsResponse>>('/orgs/deleted');
      if (!res.data.success) return [];
      return res.data.data.orgs;
    },
    enabled,
    staleTime: 30 * 1000,
    retry: false,
  });
}

/**
 * Restore a soft-deleted org. On success the org reappears in memberships, so
 * we refetch /me (silent) + invalidate the deleted list. The caller's onSuccess
 * handles navigation into the restored org.
 */
export function useRestoreOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      const res = await api.post<ApiResponse<RestoreOrgResponse>>(`/orgs/${orgId}/restore`);
      if (!res.data.success) throw new Error(res.data.error || 'Failed to restore organization');
      return res.data.data.org;
    },
    onSuccess: async () => {
      await useAuthStore.getState().hydrate();
      await qc.invalidateQueries({ queryKey: ['deleted-orgs'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => toast.error(deletedOrgsError(err, 'Failed to restore organization')),
  });
}
