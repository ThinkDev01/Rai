'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Bell, ClipboardList, FolderOpen, Users, Layers, type LucideIcon } from '@/lib/icons';
// NOTE: the page that renders this (settings/notifications) owns the H1 +
// description, so this card no longer draws its own Bell SectionHeader — it
// starts straight at the column caption to avoid a duplicate "Notifications"
// title. The per-category Bell fallback below is unrelated (row glyph).
import {
  useNotificationPreferences,
  useUpdateNotificationPreference,
  type PreferenceItem,
} from '@/hooks/useNotifications';
import { notificationsCopy } from '@/content/notifications';

// Settings → Notifications. Lists the email-capable notification types as
// per-category toggles. In-app delivery is always on (the bell), so only the
// email channel is configurable here — matching the backend's v2 "basic"
// preferences. System-critical types (alwaysEmail) render locked-on.

// Per-category icon so every row has a consistent leading glyph aligned in a
// fixed-width column (matches the icon rhythm of the other Settings sections).
const CATEGORY_ICON: Record<string, LucideIcon> = {
  Tickets:    ClipboardList,
  Projects:   FolderOpen,
  Membership: Users,
  Sprints:    Layers,
};

export function NotificationPreferencesSection() {
  const { data: items = [], isLoading, isError } = useNotificationPreferences();
  const { mutate: updatePref } = useUpdateNotificationPreference();
  const [savingType, setSavingType] = useState<string | null>(null);

  function toggle(item: PreferenceItem) {
    if (item.alwaysEmail) return;
    const nextEnabled = !item.emailEnabled;
    setSavingType(item.type);
    updatePref(
      { type: item.type, enabled: nextEnabled },
      {
        onSuccess: () => toast.success(notificationsCopy.prefs.saveSuccess(item.label, nextEnabled)),
        onError: () => toast.error(notificationsCopy.prefs.saveError),
        onSettled: () => setSavingType(null),
      },
    );
  }

  // Group by category, preserving first-seen order.
  const grouped: { category: string; rows: PreferenceItem[] }[] = [];
  for (const item of items) {
    let bucket = grouped.find((g) => g.category === item.category);
    if (!bucket) { bucket = { category: item.category, rows: [] }; grouped.push(bucket); }
    bucket.rows.push(item);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
      {isLoading ? (
        <p className="px-5 py-6 text-xs text-text-placeholder">Loading…</p>
      ) : isError ? (
        <p className="px-5 py-6 text-xs text-danger">{notificationsCopy.prefs.saveError}</p>
      ) : grouped.length === 0 ? (
        <p className="px-5 py-6 text-xs text-text-placeholder">{notificationsCopy.prefs.empty}</p>
      ) : (
        <>
          {/* Column caption — labels the toggle column so it reads as "Email". */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-text-placeholder">Notification</span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-text-placeholder">Email</span>
          </div>

          <div className="divide-y divide-border">
            {grouped.map((g) => {
              const CategoryIcon = CATEGORY_ICON[g.category] ?? Bell;
              return (
                <div key={g.category} className="py-1.5">
                  {/* Category sub-header */}
                  <div className="flex items-center gap-2 px-5 pb-1 pt-2">
                    <CategoryIcon size={12} className="text-text-placeholder" />
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">{g.category}</p>
                  </div>

                  {g.rows.map((item) => (
                    <div
                      key={item.type}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-surface/50"
                    >
                      <span className="min-w-0 truncate text-sm text-text">{item.label}</span>

                      {item.alwaysEmail ? (
                        <span className="flex-shrink-0 rounded border border-border bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-placeholder">
                          {notificationsCopy.prefs.lockedNote}
                        </span>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={item.emailEnabled}
                          aria-label={`Email for "${item.label}"`}
                          onClick={() => toggle(item)}
                          disabled={savingType === item.type}
                          className={`relative h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${item.emailEnabled ? 'bg-primary' : 'bg-border'}`}
                        >
                          {/* top-1/2 + -translate-y-1/2 centres vertically; the
                              x-translate (0 → 16px) keeps a symmetric 2px gap on
                              both ends of the 36px track. */}
                          <span
                            className={`absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${item.emailEnabled ? 'translate-x-4' : 'translate-x-0'}`}
                            aria-hidden
                          />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <p className="border-t border-border px-5 py-3 text-[11px] text-text-placeholder">
            {notificationsCopy.prefs.inAppNote}
          </p>
        </>
      )}
    </section>
  );
}
