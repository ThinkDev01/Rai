'use client';

import { useEffect, useState } from 'react';
import { usePageView } from '@/lib/usePageView';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Bug, BookOpen, CheckSquare, Zap,
  AlertCircle, ChevronUp, Minus, ChevronDown, ChevronsDown,
  Layers,
} from '@/lib/icons';
import { useMyWork, useToggleTicketPin } from '@/hooks/useMyWork';
import { formatDate } from '@/lib/dates';
import { useAuthStore, useCurrentMembership } from '@/store/auth.store';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { PinButton } from '@/components/ui/PinButton';
import { PageError } from '@/components/ui/PageError';
import { MESSAGES } from '@/lib/messages';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import { Pin } from '@/lib/icons';
import type { TicketType, Priority, TicketStatus, MyWorkItem } from '@/types/api.types';

const TYPE_ICON: Record<TicketType, React.ReactNode> = {
  bug:   <Bug         size={13} className="text-bug"   />,
  story: <BookOpen    size={13} className="text-story" />,
  task:  <CheckSquare size={13} className="text-task"  />,
  epic:  <Zap         size={13} className="text-epic"  />,
};

const PRIORITY_ICON: Record<Priority, React.ReactNode> = {
  critical: <AlertCircle  size={13} className="text-priority-critical" />,
  high:     <ChevronUp    size={13} className="text-priority-high"     />,
  medium:   <Minus        size={13} className="text-priority-medium"   />,
  low:      <ChevronDown  size={13} className="text-priority-low"      />,
  lowest:   <ChevronsDown size={13} className="text-priority-lowest"   />,
};

const STATUS_META: Record<TicketStatus, { label: string; cls: string }> = {
  todo:        { label: 'To Do',       cls: 'bg-surface text-text-subtle border-border'         },
  in_progress: { label: 'In Progress', cls: 'bg-warning-subtle text-warning border-warning/40'  },
  in_review:   { label: 'In Review',   cls: 'bg-info-subtle text-info border-info/40'           },
  done:        { label: 'Done',        cls: 'bg-success-subtle text-success border-success/40'  },
};

type StatusFilter = 'all' | TicketStatus;
type GroupBy = 'project' | 'status' | 'sprint';

// Shared with the avatar tile - email → first 2 chars of local part; name →
// first letters of first + last word. Matches the v1 visual.
function initialsFromText(input: string): string {
  const cleaned = input.includes('@')
    ? (input.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim()
    : input.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return (parts[0]!.slice(0, 2) || '?').toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

// Valid status values that can arrive via the ?status= query param. The
// dashboard's "In progress / In review" tiles deep-link here with a status
// pre-applied; this keeps the input narrow so a stray junk param doesn't
// silently break the filter UI.
const VALID_STATUS_FILTERS = new Set<StatusFilter>(['all', 'todo', 'in_progress', 'in_review', 'done']);

// Single My Work ticket row — shared by the Pinned section and the grouped
// list. The pin toggle sits outside the navigating <Link> so clicking it never
// opens the ticket.
function TicketRow({
  item,
  slug,
  showProjectBadge,
  showSprint,
  onTogglePin,
  pinDisabled,
}: {
  item: MyWorkItem;
  slug: string;
  showProjectBadge: boolean;
  showSprint: boolean;
  onTogglePin: (item: MyWorkItem) => void;
  pinDisabled: boolean;
}) {
  const { ticket, project, sprint } = item;
  const sm = STATUS_META[ticket.status];
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface">
      <PinButton
        pinned={ticket.isPinned}
        onToggle={() => onTogglePin(item)}
        disabled={pinDisabled}
        size={13}
      />
      <Link
        href={orgRoute(slug, `/projects/${project.id}/tickets/${ticket.key}`)}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {TYPE_ICON[ticket.type]}
          {PRIORITY_ICON[ticket.priority]}
        </div>
        <span className="hidden sm:block w-20 flex-shrink-0 font-mono text-xs text-text-placeholder">{ticket.key}</span>
        <span className="flex-1 truncate text-sm text-text">{ticket.title}</span>

        {showProjectBadge && (
          <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-placeholder border border-border">
            {project.key}
          </span>
        )}

        {showSprint && (
          <span className="flex-shrink-0 text-xs text-text-placeholder hidden md:block">
            {sprint.name}
            {sprint.status === 'active' && (
              <span className="ml-1 rounded-full bg-success px-1 py-0.5 text-[9px] font-semibold uppercase text-white">Active</span>
            )}
          </span>
        )}

        <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${sm.cls}`}>
          {sm.label}
        </span>
      </Link>
    </div>
  );
}

export default function MyWorkPage() {
  usePageView('MyWorkPage', 'My Work page opened');
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();
  const initialFilter = ((): StatusFilter => {
    const q = searchParams.get('status');
    return (q && VALID_STATUS_FILTERS.has(q as StatusFilter)) ? (q as StatusFilter) : 'all';
  })();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialFilter);
  const [groupBy,      setGroupBy]      = useState<GroupBy>('project');

  // Keep the URL in sync with the filter so deep-links share state.
  // replaceState (not push) - don't flood the back history with every
  // status toggle.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (statusFilter === 'all') params.delete('status');
    else params.set('status', statusFilter);
    const next = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(next, { scroll: false });
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const slug = useCurrentSlug() ?? '';
  const user = useAuthStore(s => s.user);
  const membership = useCurrentMembership();
  const { data: allItems, isLoading, error, refetch } = useMyWork();
  const togglePin = useToggleTicketPin();
  const onTogglePin = (item: MyWorkItem) =>
    togglePin.mutate({ ticketId: item.ticket.id, pin: !item.ticket.isPinned });
  const pinPendingId = togglePin.isPending ? togglePin.variables?.ticketId : undefined;

  // Caller display tuple - name may be null for federated users without a
  // `name` claim; fall back to email. Role label comes from the current org
  // membership (per-org in v2; v1's single user.role_name no longer exists).
  const displayName  = user?.name?.trim() || user?.email || '';
  const displayRole  = membership?.role_label ?? membership?.role ?? '';

  const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'all',         label: 'All'         },
    { value: 'todo',        label: 'To Do'        },
    { value: 'in_progress', label: 'In Progress'  },
    { value: 'in_review',   label: 'In Review'    },
    { value: 'done',        label: 'Done'         },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-surface-sunken" />
            <div>
              <div className="h-4 w-20 animate-pulse rounded bg-surface-sunken mb-1.5" />
              <div className="h-3 w-32 animate-pulse rounded bg-surface-sunken" />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          <div className="flex flex-col gap-1">
            {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <PageError message="Failed to load your work" onRetry={refetch} />;
  }

  const items = allItems ?? [];

  const filtered = statusFilter === 'all'
    ? items
    : items.filter(i => i.ticket.status === statusFilter);

  function groupItems(items: typeof filtered, by: GroupBy) {
    const map = new Map<string, { label: string; sub?: string; items: typeof filtered }>();
    for (const item of items) {
      let key: string;
      let label: string;
      let sub: string | undefined;

      if (by === 'project') {
        key   = item.project.id;
        label = item.project.name;
        sub   = item.project.key;
      } else if (by === 'sprint') {
        key   = item.sprint.id;
        label = item.sprint.name;
        sub   = `${item.project.name} · ${formatDate(item.sprint.startDate)} → ${formatDate(item.sprint.endDate)}`;
      } else {
        key   = item.ticket.status;
        label = STATUS_META[item.ticket.status].label;
      }

      if (!map.has(key)) map.set(key, { label, sub, items: [] });
      map.get(key)!.items.push(item);
    }
    return [...map.values()];
  }

  // Pinned tickets surface as a dedicated section at the very top (max 3,
  // enforced server-side) and are excluded from the grouped list below so a
  // ticket never shows twice. Pins respect the active status filter so the
  // toolbar still behaves predictably.
  const pinnedItems = filtered.filter(i => i.ticket.isPinned);
  const restItems   = filtered.filter(i => !i.ticket.isPinned);
  const groups = groupItems(restItems, groupBy);

  return (
    <div className="flex flex-col h-full">

      {/* Header — text sizes EXACTLY mirror the sidebar's UserIdentityHeader
          (h1 = text-sm font-semibold, subtitle = text-[11px]) with the same
          `py-3.5` padding. Same text stack height + same padding = identical
          row height, so the bottom borders meet at the column boundary as
          one continuous line. Previous attempts (py-4, py-3.5 + leading-snug,
          etc.) all left a ~1–5px gap because the text stacks differed. */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 sm:px-6 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
            {initialsFromText(displayName)}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-text">My Work</h1>
            <p className="text-[11px] capitalize text-text-placeholder">{displayName} · {displayRole}</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-text-placeholder">
          <span className="font-medium text-text">{items.length}</span> tickets total ·&nbsp;
          <span className="font-medium text-text">{items.filter(i => i.ticket.status !== 'done').length}</span> active
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:gap-3 border-b border-border bg-surface-raised px-4 sm:px-6 py-2.5">
        {/* Status filter */}
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-primary text-white'
                  : 'text-text-subtle hover:bg-surface hover:text-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Group by - active state was `bg-surface` (nearly invisible
            against the surrounding `bg-surface-raised` toolbar). Bumped to
            primary-subtle tint with primary text so the selection is
            unmistakable, while staying lighter than the solid-primary
            Status filter above it (visual hierarchy: status = primary
            control, group-by = secondary). */}
        <div className="flex items-center gap-2 text-xs text-text-placeholder">
          {/* Label styled as a section heading (uppercase + tracking) so it
              reads as a category label, not another clickable chip. The
              previous `<span>Group by</span>` shared `text-xs` with the
              chips below it and visually merged into the button row. */}
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder/80">
            Group by
          </span>
          {(['project', 'sprint', 'status'] as GroupBy[]).map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              aria-pressed={groupBy === g}
              className={`rounded border px-2 py-0.5 capitalize transition-colors ${
                groupBy === g
                  ? 'border-primary/40 bg-primary-subtle font-medium text-primary'
                  : 'border-transparent hover:bg-surface hover:text-text'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Layers size={32} className="mb-3 text-border" />
            <h2 className="text-base font-semibold text-text">{MESSAGES.myWork.noTickets.title}</h2>
            <p className="mt-1.5 max-w-xs text-sm text-text-subtle">{MESSAGES.myWork.noTickets.description}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Layers size={32} className="mb-3 text-border" />
            <h2 className="text-base font-semibold text-text">{MESSAGES.myWork.noResults.title}</h2>
            <p className="mt-1.5 max-w-xs text-sm text-text-subtle">{MESSAGES.myWork.noResults.description}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Pinned section — quick-access, always first. Excluded from the
                groups below so a ticket never appears twice. */}
            {pinnedItems.length > 0 && (
              <div>
                <div className="mb-2 flex items-baseline gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
                    <Pin size={13} className="fill-current text-primary" />
                    Pinned
                  </p>
                  <span className="ml-auto text-xs text-text-placeholder">{pinnedItems.length}</span>
                </div>
                <div className="overflow-hidden rounded-lg border border-primary/30 bg-surface-raised shadow-sm divide-y divide-border">
                  {pinnedItems.map(item => (
                    <TicketRow
                      key={item.ticket.id}
                      item={item}
                      slug={slug}
                      showProjectBadge
                      showSprint
                      onTogglePin={onTogglePin}
                      pinDisabled={pinPendingId === item.ticket.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {groups.map((group, gi) => (
              <div key={gi}>
                {/* Group header */}
                <div className="mb-2 flex items-baseline gap-2">
                  <p className="text-sm font-semibold text-text">{group.label}</p>
                  {group.sub && <p className="text-xs text-text-placeholder">{group.sub}</p>}
                  <span className="ml-auto text-xs text-text-placeholder">{group.items.length}</span>
                </div>

                {/* Ticket rows */}
                <div className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm divide-y divide-border">
                  {group.items.map(item => (
                    <TicketRow
                      key={item.ticket.id}
                      item={item}
                      slug={slug}
                      showProjectBadge={groupBy !== 'project'}
                      showSprint={groupBy !== 'sprint'}
                      onTogglePin={onTogglePin}
                      pinDisabled={pinPendingId === item.ticket.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
