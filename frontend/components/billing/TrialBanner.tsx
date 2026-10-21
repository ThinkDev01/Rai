'use client';

import Link from 'next/link';
import { Calendar, ArrowRight } from '@/lib/icons';
import { orgRoute } from '@/lib/routes';
import { BILLING } from '@/content/billing';
import { useBilling } from '@/hooks/useBilling';

// Trial-only banner for the Settings page — shows a live "X days left" counter
// while the org is on its free trial, with a CTA to the billing page. Renders
// nothing once the org is active/read-only (the global SubscriptionBanner covers
// read-only). Owner/admin only — the billing summary endpoint is role-gated, so
// the hook is disabled for everyone else (no wasted 403 call).

function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function TrialBanner({ slug, canManage }: { slug: string | null; canManage: boolean }) {
  const { data } = useBilling(canManage ? slug : null);
  if (!data || data.status !== 'trialing' || !slug) return null;

  const days = daysLeft(data.trial_ends_at);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-2.5 text-sm">
      <Calendar size={15} className="shrink-0 text-info" />
      <span className="font-medium text-text">{BILLING.trial.daysLeft(days)}.</span>
      <span className="text-text-subtle">Add a payment method to keep things running after that.</span>
      <Link
        href={orgRoute(slug, '/settings/billing')}
        className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        {BILLING.actions.subscribe}
        <ArrowRight size={13} />
      </Link>
    </div>
  );
}
