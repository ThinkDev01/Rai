'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from '@/lib/icons';
import { orgRoute } from '@/lib/routes';
import { BILLING } from '@/content/billing';
import type { SubscriptionStatus } from '@/types/auth.types';

// Sticky read-only banner. Mounted in the org shell (orgs/[slug]/layout) — shows
// only when the org is in a read-only state (suspended/cancelled, per
// v2-decisions Q11 / RF-10). Admins get a "Go to billing" CTA; everyone else is
// told to ask an admin. Reads do work under read-only, so this is informational
// + an entry point, not a blocker.

const READ_ONLY: ReadonlySet<SubscriptionStatus> = new Set(['suspended', 'cancelled']);

export function SubscriptionBanner({
  status,
  slug,
  canManageBilling,
}: {
  status: SubscriptionStatus;
  slug: string;
  canManageBilling: boolean;
}) {
  if (!READ_ONLY.has(status)) return null;

  return (
    <div className="sticky top-14 z-30 flex items-center justify-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-sm text-warning">
      <AlertTriangle size={15} className="shrink-0" />
      <span className="text-text">
        {canManageBilling ? BILLING.banner.admin : BILLING.banner.member}
      </span>
      {canManageBilling && (
        <Link
          href={orgRoute(slug, '/settings/billing')}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          {BILLING.banner.cta}
          <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}
