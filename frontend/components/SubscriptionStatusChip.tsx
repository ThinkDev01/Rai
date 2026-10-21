// Visual indicator for the org's subscription_status. Used everywhere the
// status surfaces (Header org switcher, Settings, future billing pages) so
// the visual vocabulary stays consistent - same chip shape, same color
// mapping, same labels.
//
// Status values mirror backend/modules/auth/auth.model.ts:
//   trial      → "Trial"      (info-blue - trying it out, no card needed yet)
//   active     → "Active"     (success-green - fully subscribed, paid)
//   suspended  → "Suspended"  (warning-amber - payment failed, action needed)
//   cancelled  → "Cancelled"  (text-placeholder - ended; org goes read-only)
//
// Phase 4 (billing) is where suspended/cancelled actually start firing -
// today only `trial` and `active` are reachable. Adding all four now so
// the surface is ready when billing flips on.

import type { Membership } from '@/types/auth.types';

type Status = Membership['subscription_status'];

const META: Record<Status, { label: string; cls: string }> = {
  trial:     { label: 'Trial',     cls: 'border-info/40 bg-info/10 text-info'           },
  active:    { label: 'Active',    cls: 'border-success/40 bg-success/10 text-success'  },
  suspended: { label: 'Suspended', cls: 'border-warning/40 bg-warning/10 text-warning'  },
  cancelled: { label: 'Cancelled', cls: 'border-border bg-surface text-text-placeholder'},
};

export function SubscriptionStatusChip({
  status,
  size = 'sm',
  className = '',
}: {
  status:    Status;
  size?:     'sm' | 'xs';
  className?: string;
}) {
  const meta = META[status];
  if (!meta) {
    // Defensive fallback for any future status not yet in the map - render
    // the raw value so it's visible (and noisy) rather than silently missing.
    return (
      <span className={`rounded border border-border px-1.5 py-px text-[10px] font-medium uppercase leading-none text-text-placeholder ${className}`}>
        {String(status)}
      </span>
    );
  }
  const sizeCls = size === 'xs'
    ? 'px-1 py-px text-[9px]'
    : 'px-1.5 py-px text-[10px]';
  return (
    <span
      className={`inline-flex items-center rounded border font-medium uppercase leading-none ${sizeCls} ${meta.cls} ${className}`}
      title={`Subscription: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}
