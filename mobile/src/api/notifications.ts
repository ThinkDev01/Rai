import { Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/errors';

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
  org_id: string | null;
  org_slug: string | null;
  org_name: string | null;
}

export interface PreferenceItem {
  type: string;
  label: string;
  category: string;
  alwaysEmail: boolean;
  emailEnabled: boolean;
}

// ── Notification feed ─────────────────────────────────────────────────────────

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const result = await unwrap<{ items: AppNotification[]; unreadCount: number; nextBefore: number | null }>(
        api.get('/notifications'),
      );
      return Array.isArray(result?.items) ? result.items : [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useUnreadCount() {
  const { data } = useNotifications();
  const list = Array.isArray(data) ? data : [];
  return list.filter(n => !n.read_at).length;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap<unknown>(api.post(`/notifications/${id}/read`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap<unknown>(api.post('/notifications/read-all')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ── Notification preferences ──────────────────────────────────────────────────

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const result = await unwrap<{ items: PreferenceItem[] }>(api.get('/notifications/preferences'));
      return Array.isArray(result?.items) ? result.items : [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { type: string; enabled: boolean }) =>
      unwrap<unknown>(api.patch('/notifications/preferences', { ...payload, channel: 'email' })),
    onMutate: async ({ type, enabled }) => {
      await qc.cancelQueries({ queryKey: ['notification-preferences'] });
      const previous = qc.getQueryData<PreferenceItem[]>(['notification-preferences']);
      qc.setQueryData<PreferenceItem[]>(['notification-preferences'], old =>
        (old ?? []).map(p => p.type === type ? { ...p, emailEnabled: enabled } : p),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(['notification-preferences'], ctx.previous);
      toast.error('Could not update preference');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });
}

// ── Device token (FCM) ────────────────────────────────────────────────────────

export function useRegisterDeviceToken() {
  return useMutation({
    mutationFn: (token: string) =>
      unwrap<unknown>(api.post('/devices', {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      })),
  });
}

export function useUnregisterDeviceToken() {
  return useMutation({
    mutationFn: (token: string) =>
      unwrap<unknown>(api.delete('/devices', { data: { token } })),
  });
}
