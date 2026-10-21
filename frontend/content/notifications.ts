// User-facing copy for the notifications bell + the Settings → Notifications
// section. Centralized per the content convention (no inline strings in
// components). The per-type labels/categories themselves come from the backend
// (the notification registry), so only the surrounding UI chrome lives here.

export const notificationsCopy = {
  bell: {
    title:      'Notifications',
    empty:      "You're all caught up.",
    markAll:    'Mark all read',
    markRead:   'Mark as read',
    markUnread: 'Mark as unread',
    settings:   'Notification settings',
    loadError:  'Could not load notifications',
    ariaLabel:  (unread: number) =>
      unread > 0 ? `Notifications, ${unread} unread` : 'Notifications',
  },
  prefs: {
    title:       'Notifications',
    description: 'Choose which emails you receive. In-app notifications always appear in your bell.',
    inAppNote:   'In-app: always on',
    saveError:   'Could not save preference',
    saveSuccess: (label: string, enabled: boolean) =>
      `Email notifications for "${label}" turned ${enabled ? 'on' : 'off'}`,
    lockedNote:  'Always on',
    empty:       'No configurable notifications yet.',
  },
} as const;
