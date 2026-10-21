'use client';

import Link from 'next/link';
import { useCurrentSlug, orgRoute } from '@/lib/routes';
import { NotificationPreferencesSection } from '@/components/settings/NotificationPreferencesSection';
import { notificationsCopy } from '@/content/notifications';

// Settings → Notifications (dedicated page, opened from the Settings "You" group
// and the bell's footer link). Notification preferences are a FIXED set of
// email-capable types, so — unlike the user-dependent org/member lists — they
// earn their own page in the same shape as Billing: page chrome here, the card
// itself stays in NotificationPreferencesSection. Account-level (per-user, not
// org-scoped), so there's no role gate; the [slug] is only the active-org
// context for the back link.

export default function NotificationsSettingsPage() {
  const slug = useCurrentSlug();

  return (
    <div className="px-4 sm:px-8 py-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">{notificationsCopy.prefs.title}</h1>
        <p className="text-sm text-text-subtle">{notificationsCopy.prefs.description}</p>
      </div>

      <NotificationPreferencesSection />

      {slug && (
        <Link
          href={orgRoute(slug, '/settings')}
          className="inline-flex items-center gap-1 text-sm text-text-link hover:underline"
        >
          Back to settings
        </Link>
      )}
    </div>
  );
}
