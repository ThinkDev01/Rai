import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse } from '@/types/api.types';

// Notifications are a SINGLE per-user feed across all orgs (not org-scoped), so
// the query keys are NOT prefixed with ['org', orgId] like the tenant-scoped
// hooks. The backend routes need no X-Org-Id; each row carries its own org slug.

export interface NotificationItem {
  id:         number;
  type:       string;
  title:      string;
  link:       string | null;
  read_at:    string | null;
  created_at: string;
  org_id:     string | null;
  org_slug:   string | null;
  org_name:   string | null;
}

interface NotificationListData {
  items:       NotificationItem[];
  unreadCount: number;
  nextBefore:  number | null;
}

export interface PreferenceItem {
  type:         string;
  label:        string;
  category:     string;
  alwaysEmail:  boolean;
  emailEnabled: boolean;
}

export const notificationKeys = {
  unread:      ['notifications', 'unread'] as const,
  list:        ['notifications', 'list'] as const,
  preferences: ['notifications', 'preferences'] as const,
};

const UNREAD_POLL_MS = 45_000;

/** Lightweight unread badge count — polls in the background while signed in. */
export function useUnreadCount() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ count: number }>>('/notifications/unread-count');
      return res.data.data.count;
    },
    enabled: Boolean(userId),
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

/** The feed itself. Pass `enabled` so we only fetch when the panel is open. */
export function useNotificationList(enabled: boolean) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: async () => {
      const res = await api.get<ApiResponse<NotificationListData>>('/notifications?limit=20');
      return res.data.data;
    },
    enabled: Boolean(userId) && enabled,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.unread });
      qc.invalidateQueries({ queryKey: notificationKeys.list });
    },
  });
}

export function useMarkNotificationUnread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/unread`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.unread });
      qc.invalidateQueries({ queryKey: notificationKeys.list });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.unread });
      qc.invalidateQueries({ queryKey: notificationKeys.list });
    },
  });
}

export function useNotificationPreferences() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ items: PreferenceItem[] }>>('/notifications/preferences');
      return res.data.data.items;
    },
    enabled: Boolean(userId),
  });
}

export function useUpdateNotificationPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { type: string; enabled: boolean }) =>
      api.patch('/notifications/preferences', { type: vars.type, channel: 'email', enabled: vars.enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.preferences });
    },
  });
}
