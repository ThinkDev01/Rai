'use client';

import { use, useState } from 'react';
import { usePageView } from '@/lib/usePageView';
import Link from 'next/link';
import { Layers, Plus, Clock, Search, Archive, X, ChevronDown } from '@/lib/icons';
import {
  Target, CheckCircle2,
  Bug, BookOpen, CheckSquare, Zap,
} from '@/lib/icons';
import { useProject } from '@/hooks/useProjects';
import { useCurrentRole } from '@/store/auth.store';
import { CreateSprintModal } from '@/components/modals/CreateSprintModal';
import { PageError } from '@/components/ui/PageError';
import { PageNotFound } from '@/components/ui/PageNotFound';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { isNotFoundError } from '@/lib/errors';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import { formatDate } from '@/lib/dates';
import { sprintDisplayStatus, SPRINT_PILL_BASE, isLiveSprint } from '@/lib/sprint.utils';
import { projectColor, memberColor } from '@/lib/project.utils';
import type { Sprint, Ticket, TicketType, TicketStatus } from '@/types/api.types';

// Dedicated sprints listing - reached from the sidebar's "Show all sprints"
// button when a project has more than the SPRINT_NAV_THRESHOLD count.
// Pattern mirrors the org Dashboard's project tiles: a card per sprint
// with name + status + ticket-count breakdown + a tickets preview.

// Type icon map (mirrors the rest of the app; localized here to avoid
// passing a giant common-meta module just for 4 SVGs).
const TYPE_ICON: Record<TicketType, React.ReactNode> = {
  bug:   <Bug         size={11} className="text-bug"   />,
  story: <BookOpen    size={11} className="text-story" />,
  task:  <CheckSquare size={11} className="text-task"  />,
  epic:  <Zap         size={11} className="text-epic"  />,
};

const STATUS_DOT: Record<TicketStatus, string> = {
  todo:        'bg-text-placeholder',
  in_progress: 'bg-warning',
  in_review:   'bg-info',
  done:        'bg-success',
};

type StatusFilter = 'all' | 'active' | 'planned' | 'completed';
type SortKey = 'default' | 'newest' | 'start' | 'name';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all',       label: 'All'       },
  { value: 'active',    label: 'Active'    },
  { value: 'planned',   label: 'Planned'   },
  { value: 'completed', label: 'Completed' },
];

const SORT_LABEL: Record<SortKey, string> = {
  default: 'Active first',
  newest:  'Newest',
  start:   'Start date',
  name:    'Name (A→Z)',
};

// ── Sprint card ──────────────────────────────────────────────────────────────

function SprintCard({ sprint, projectId, slug }: { sprint: Sprint; projectId: string; slug: string }) {
  const ds = sprintDisplayStatus(sprint);
  const tickets = sprint.tickets ?? [];
  const total = tickets.length;
  const done  = tickets.filter(t => t.status === 'done').length;
  const todo  = tickets.filter(t => t.status === 'todo').length;
  const inProg = tickets.filter(t => t.status === 'in_progress').length;
  const inRev  = tickets.filter(t => t.status === 'in_review').length;

  // Preview the first 5 tickets so the card carries a glance-level sense
  // of "what's in this sprint" without dragging the layout to a wall.
  const preview = tickets.slice(0, 5);
  const remaining = total - preview.length;

  return (
    <Link
      href={orgRoute(slug, `/projects/${projectId}/sprints/${sprint.id}`)}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-sm transition-all duration-150 hover:border-primary/40 hover:shadow-md"
    >
      {/* Header — name + status pill */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{sprint.name}</p>
          {sprint.goal && (
            <p className="mt-0.5 line-clamp-1 text-xs text-text-placeholder">{sprint.goal}</p>
          )}
        </div>
        <span className={`flex-shrink-0 ${SPRINT_PILL_BASE} ${ds.pillCls}`}>{ds.label}</span>
      </div>

      {/* Date range (when present) */}
      {(sprint.startDate || sprint.endDate) && (
        <div className="flex items-center gap-1.5 text-[11px] text-text-placeholder">
          <Clock size={11} />
          <span>
            {sprint.startDate ? formatDate(sprint.startDate) : '?'}
            {' → '}
            {sprint.endDate ? formatDate(sprint.endDate) : '?'}
          </span>
        </div>
      )}

      {/* Ticket counts strip */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'To Do',    count: todo,  cls: 'text-text-subtle' },
          { label: 'Progress', count: inProg, cls: 'text-warning' },
          { label: 'Review',   count: inRev,  cls: 'text-info' },
          { label: 'Done',     count: done,  cls: 'text-success' },
        ].map(({ label, count, cls }) => (
          <div key={label} className="rounded-md bg-surface px-2 py-1.5 text-center">
            <p className={`text-base font-bold ${cls}`}>{count}</p>
            <p className="text-[9px] uppercase tracking-wider text-text-placeholder">{label}</p>
          </div>
        ))}
      </div>

      {/* Ticket preview list */}
      {preview.length > 0 ? (
        <div className="flex flex-col gap-1">
          {preview.map(t => (
            <div key={t.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface">
              <span className="flex-shrink-0">{TYPE_ICON[t.type]}</span>
              <span className="w-16 flex-shrink-0 truncate font-mono text-[10px] text-text-placeholder">{t.key}</span>
              <span className="flex-1 truncate text-xs text-text">{t.title}</span>
              <span className={`flex h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[t.status]}`} title={t.status} />
              {t.assignee ? (
                <span
                  title={t.assignee.name}
                  style={{ backgroundColor: memberColor(t.assignee.id) }}
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                >
                  {t.assignee.initials}
                </span>
              ) : (
                <span className="h-4 w-4 flex-shrink-0 rounded-full border border-dashed border-text-placeholder bg-surface" />
              )}
            </div>
          ))}
          {remaining > 0 && (
            <p className="px-2 pt-1 text-[10px] text-text-placeholder">+ {remaining} more ticket{remaining === 1 ? '' : 's'}</p>
          )}
        </div>
      ) : (
        <p className="rounded bg-surface px-2 py-2 text-center text-[11px] italic text-text-placeholder">
          No tickets in this sprint yet.
        </p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-text-placeholder">
        <span>{total} ticket{total === 1 ? '' : 's'}</span>
        <span>{total > 0 ? Math.round((done / total) * 100) : 0}% complete</span>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SprintsIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  usePageView('SprintsIndexPage', 'Sprints page opened', { projectId: id });
  const slug = useCurrentSlug() ?? '';
  const role = useCurrentRole();
  const { data: project, isLoading, error, refetch } = useProject(id);

  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [statusFilter, setStatusFilter]         = useState<StatusFilter>('all');
  const [query, setQuery]                       = useState('');
  const [sort, setSort]                         = useState<SortKey>('default');

  // True when any filter / search / sort deviates from the empty/default state.
  // Drives the "Clear filters" pill visibility in the toolbar so the caller
  // sees an obvious escape hatch when they've narrowed the list.
  const hasActiveFilters =
    statusFilter !== 'all' || query.trim().length > 0 || sort !== 'default';

  function clearAllFilters() {
    setStatusFilter('all');
    setQuery('');
    setSort('default');
  }

  const canManageSprints = role === 'owner' || role === 'admin' || role === 'project_manager';

  if (isLoading) {
    return (
      <div className="flex flex-col px-4 sm:px-6 py-6 gap-4">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-sunken" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return isNotFoundError(error)
      ? <PageNotFound title="Project not found" message="This project doesn't exist or you don't have access." />
      : <PageError message="Failed to load sprints" onRetry={refetch} />;
  }
  if (!project) return null;

  // Sort key drives the order. 'default' keeps the legacy "active first then
  // planned then completed" rank so power users get the same behavior they
  // had before. Other keys are explicit user choices.
  const sortedSprints = [...project.sprints].filter(isLiveSprint).sort((a, b) => {
    switch (sort) {
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'start': {
        const aT = a.startDate ? new Date(a.startDate).getTime() : 0;
        const bT = b.startDate ? new Date(b.startDate).getTime() : 0;
        return bT - aT;
      }
      case 'name':
        return a.name.localeCompare(b.name);
      case 'default':
      default: {
        const rank = (s: string) => (s === 'active' ? 0 : s === 'planned' ? 1 : 2);
        return rank(a.status) - rank(b.status);
      }
    }
  });

  const liveSprints = sortedSprints;

  const filtered = liveSprints
    .filter(s => statusFilter === 'all' || s.status === statusFilter)
    .filter(s => !query.trim() || s.name.toLowerCase().includes(query.toLowerCase()));

  const activeCount    = liveSprints.filter(s => s.status === 'active').length;
  const plannedCount   = liveSprints.filter(s => s.status === 'planned').length;
  const completedCount = liveSprints.filter(s => s.status === 'completed').length;

  return (
    <div className="flex flex-col px-4 sm:px-6 py-6 gap-5">

      {/* Header — project identity + counts + actions */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: projectColor(project.key) }}
          >
            {project.key[0]}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-text-placeholder" />
              <h1 className="text-lg font-semibold text-text">Sprints</h1>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-text-placeholder">
                {liveSprints.length} total
              </span>
            </div>
            <p className="mt-0.5 text-xs text-text-placeholder">
              <Link href={orgRoute(slug, `/projects/${id}/overview`)} className="hover:text-text-subtle hover:underline">
                {project.name}
              </Link>
              {' · '}{activeCount} active · {plannedCount} planned · {completedCount} completed
            </p>
          </div>
        </div>

        {!project.archived && canManageSprints && (
          <button
            onClick={() => setShowCreateSprint(true)}
            className="flex items-center gap-2 self-start rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover md:self-auto"
          >
            <Plus size={14} />
            New sprint
          </button>
        )}
      </div>

      {/* Filters bar — search (left) + chip-group + sort (right). Layout +
          spacing intentionally identical to /orgs/[slug]/projects so the two
          index pages read as a family. No standalone "Clear" pill — the four
          status chips + a search box + sort selector are easy to reset by
          eye; an extra pill bloats the toolbar without adding affordance
          (the dedicated board / backlog pages keep their clear button
          because they carry multi-select assignees + type filters where
          reset state is less obvious). */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        {/* Search — grows to fill the row on lg+. `flex-1` over `max-w-sm`
            so the field expands into the white space between itself and
            the right cluster (chip group + sort). */}
        <div className="relative w-full lg:flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search sprints by name…"
            className="h-9 w-full rounded-md border border-border bg-surface-raised pl-9 pr-9 text-sm text-text placeholder:text-text-placeholder outline-none transition-colors focus:border-primary/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface text-text-subtle transition-colors hover:border-primary/40 hover:bg-primary-subtle hover:text-primary"
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={12} strokeWidth={2.25} />
            </button>
          )}
        </div>

        {/* Right cluster: status chip group + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-surface-raised p-0.5">
            {STATUS_FILTERS.map(f => {
              const active = statusFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`flex h-7 items-center rounded px-2.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary-subtle text-primary'
                      : 'text-text-subtle hover:bg-surface-sunken hover:text-text'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-surface-raised pl-3 pr-7 text-xs font-medium text-text-subtle outline-none transition-colors hover:text-text focus:border-primary/60"
              title="Sort sprints"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-placeholder" />
          </div>
        </div>
      </div>

      {/* Sprint cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface-raised px-6 py-14 text-center">
          {liveSprints.length === 0 ? (
            <>
              <Target size={32} className="text-border" />
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold text-text">No sprints yet</p>
                <p className="max-w-sm text-xs text-text-placeholder">
                  Sprints group tickets into time-boxed iterations. Create your first sprint to start tracking active work, or browse archived sprints from past cycles.
                </p>
              </div>
              {/* Dual CTA: primary = create (PM+), secondary = browse archive */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {canManageSprints && !project.archived && (
                  <button
                    onClick={() => setShowCreateSprint(true)}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                  >
                    <Plus size={14} />
                    Create first sprint
                  </button>
                )}
                <Link
                  href={orgRoute(slug, `/projects/${id}/archive`)}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-subtle transition-colors hover:border-primary/40 hover:text-text"
                >
                  <Archive size={14} />
                  Browse archived sprints
                </Link>
              </div>
              {!canManageSprints && (
                <p className="text-[11px] italic text-text-placeholder">
                  Ask a project manager or admin to create the first sprint.
                </p>
              )}
            </>
          ) : (
            <>
              <Search size={24} className="text-border" />
              <p className="text-sm font-medium text-text">No sprints match these filters</p>
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-subtle transition-colors hover:border-primary/40 hover:bg-primary-subtle hover:text-primary"
              >
                <X size={12} strokeWidth={2.25} />
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(sprint => (
            <SprintCard key={sprint.id} sprint={sprint} projectId={id} slug={slug} />
          ))}
        </div>
      )}

      {/* Archived sprints reminder — links to the dedicated Archive page */}
      {project.sprints.some(s => s.archivedAt) && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-placeholder">
          <CheckCircle2 size={11} />
          Archived sprints live on the{' '}
          <Link href={orgRoute(slug, `/projects/${id}/archive`)} className="text-text-link hover:underline">
            Archive page
          </Link>
          .
        </p>
      )}

      {showCreateSprint && (
        <CreateSprintModal
          projectId={project.id}
          projectKey={project.key}
          existingSprintNames={project.sprints.map(s => s.name)}
          onClose={() => setShowCreateSprint(false)}
        />
      )}
    </div>
  );
}
