'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Plus,
  Search,
  X,
  LayoutGrid,
  List,
  FolderOpen,
  Archive,
  Users,
  Layers,
  ClipboardList,
  ChevronDown,
} from '@/lib/icons';
import { useProjects, useToggleProjectPin } from '@/hooks/useProjects';
import { useCurrentRole } from '@/store/auth.store';
import { CreateProjectModal } from '@/components/modals/CreateProjectModal';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { PinButton } from '@/components/ui/PinButton';
import { PageError } from '@/components/ui/PageError';
import { formatDate } from '@/lib/dates';
import { ProjectAvatar } from '@/components/ui/ProjectAvatar';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import { logger } from '@/lib/logger';
import { SEARCH, EMPTY_STATES } from '@/content/placeholders';
import type { ProjectSummary } from '@/types/api.types';

// ── Sort / Filter / View types ──────────────────────────────────────────────

type SortKey = 'newest' | 'recent' | 'name';
type FilterKey = 'all' | 'active' | 'archived';
type VisibilityKey = 'any' | 'public' | 'private';
type ViewKey = 'list' | 'grid';

const SORT_LABEL: Record<SortKey, string> = {
  newest: 'Newest first',
  recent: 'Last activity',
  name:   'Name (A→Z)',
};

const FILTER_LABEL: Record<FilterKey, string> = {
  all:      'All',
  active:   'Active',
  archived: 'Archived',
};

const VISIBILITY_LABEL: Record<VisibilityKey, string> = {
  any:     'Any visibility',
  public:  'Public only',
  private: 'Private only',
};

// ── Page ─────────────────────────────────────────────────────────────────────

/**
 * Dedicated org-level projects index. Reachable from the sidebar PROJECTS
 * section title (hover-revealed arrow). Sibling of the dashboard's projects
 * preview — this page is the full catalogue with search, sort, filter, and
 * a list/grid view toggle.
 *
 * Personal pinning: each user can pin up to 3 projects (`/me/pins/projects/:id`);
 * pinned projects float to the top regardless of the active sort.
 */
export default function ProjectsIndexPage() {
  const slug = useCurrentSlug() ?? '';
  const role = useCurrentRole();
  const isPmOrAbove = role === 'owner' || role === 'admin' || role === 'project_manager';

  const { data: projects, isLoading, error, refetch } = useProjects();
  const togglePin = useToggleProjectPin();
  const onTogglePin = (p: ProjectSummary) =>
    togglePin.mutate({ projectId: p.id, pin: !p.isPinned });
  const pinPendingId = togglePin.isPending ? togglePin.variables?.projectId : undefined;

  // Read the filter from `?filter=archived` so deep-links from the sidebar's
  // "Show all archived" CTA arrive on the right view. The useEffect below
  // RESYNCS state whenever the URL param changes — without it, the page
  // remains on whatever filter it was first mounted with even after the
  // sidebar navigates to a different `?filter=...` value (Next App Router
  // doesn't remount the page on same-route search-param changes). Any value
  // outside the known set falls back to the default ("active").
  const searchParams = useSearchParams();
  const filterParam  = searchParams?.get('filter') ?? null;
  const resolvedFilter: FilterKey =
    filterParam === 'archived' || filterParam === 'all' || filterParam === 'active'
      ? filterParam
      : 'active';

  const [search, setSearch]   = useState('');
  const [sort, setSort]       = useState<SortKey>('newest');
  const [filter, setFilter]   = useState<FilterKey>(resolvedFilter);
  const [visibility, setVisibility] = useState<VisibilityKey>('any');
  const [view, setView]       = useState<ViewKey>('list');
  const [showCreate, setShowCreate] = useState(false);

  // Resync filter state with URL whenever the search-param changes. Fires
  // when the caller clicks a sidebar link with `?filter=...` (or navigates
  // away to /projects with no query — resets to active).
  useEffect(() => {
    setFilter(resolvedFilter);
  }, [resolvedFilter]);

  // Derived list. Filter → search → sort, in that order. memoized so a
  // re-render from an unrelated state change doesn't re-sort 50 projects.
  const visibleProjects = useMemo(() => {
    if (!projects) return [];
    let list = projects;

    // Filter — status (active / archived / all).
    if (filter === 'active')        list = list.filter(p => !p.archived);
    else if (filter === 'archived') list = list.filter(p =>  p.archived);

    // Filter — visibility (any / public / private). Orthogonal to status,
    // applied as a second pass.
    if (visibility === 'public')        list = list.filter(p => p.visibility === 'public');
    else if (visibility === 'private')  list = list.filter(p => p.visibility === 'private');

    // Search — match against name OR key, case-insensitive.
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q),
      );
    }

    // Sort
    const sorted = [...list];
    if (sort === 'newest') {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === 'recent') {
      sorted.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
    } else if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Pinned projects float to the top regardless of the active sort (max 3,
    // enforced server-side). Stable partition preserves the chosen order
    // within each group.
    return [...sorted.filter(p => p.isPinned), ...sorted.filter(p => !p.isPinned)];
  }, [projects, filter, visibility, search, sort]);

  // Counts shown next to filter chips
  const counts = useMemo(() => {
    if (!projects) return { all: 0, active: 0, archived: 0 };
    return {
      all:      projects.length,
      active:   projects.filter(p => !p.archived).length,
      archived: projects.filter(p =>  p.archived).length,
    };
  }, [projects]);

  function onSearchClear() {
    setSearch('');
  }

  if (error) {
    logger.error('ProjectsIndexPage', 'Could not load the projects list', { error: (error as Error).message });
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <PageError onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Projects</h1>
          <p className="mt-1 text-sm text-text-subtle">
            All projects in this organization. Search, sort, and switch between list and grid.
          </p>
        </div>
        {isPmOrAbove && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-text shadow-sm transition-colors hover:bg-primary-hover"
          >
            <Plus size={15} />
            New project
          </button>
        )}
      </div>

      {/* ── Toolbar — search | filter | sort | view ──────────────────── */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        {/* Search — grows to fill the row on lg+. Was capped at `max-w-sm`
            which left a sea of white space between it and the right cluster.
            `flex-1` lets it expand into the toolbar's natural width. */}
        <div className="relative w-full lg:flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={SEARCH.projects}
            className="h-9 w-full rounded-md border border-border bg-surface-raised pl-9 pr-9 text-sm text-text placeholder:text-text-placeholder outline-none transition-colors focus:border-primary/60"
          />
          {search && (
            <button
              type="button"
              onClick={onSearchClear}
              // Always visible (no opacity-on-hover trick), neutral palette so
              // it reads as "reset" not "delete". Soft surface on hover with
              // a slight border accent — clearly clickable without the
              // destructive red vibe.
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface text-text-subtle transition-colors hover:border-primary/40 hover:bg-primary-subtle hover:text-primary"
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={12} strokeWidth={2.25} />
            </button>
          )}
        </div>

        {/* Right cluster: filter chips + sort + view toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter chips */}
          <div className="inline-flex rounded-md border border-border bg-surface-raised p-0.5">
            {(['active', 'all', 'archived'] as FilterKey[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors ${
                  filter === k
                    ? 'bg-primary-subtle text-primary'
                    : 'text-text-subtle hover:bg-surface-sunken hover:text-text'
                }`}
              >
                {FILTER_LABEL[k]}
                <span className="text-text-placeholder/70">{counts[k]}</span>
              </button>
            ))}
          </div>

          {/* Visibility dropdown — orthogonal to the status chips so private
              and public can be cross-cut with active / archived (e.g.
              "archived private projects only"). Default is `any` — same
              behavior as before this filter existed. */}
          <div className="relative">
            <select
              value={visibility}
              onChange={e => setVisibility(e.target.value as VisibilityKey)}
              className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-surface-raised pl-3 pr-7 text-xs font-medium text-text-subtle outline-none transition-colors hover:text-text focus:border-primary/60"
              title="Filter by visibility"
            >
              {(Object.keys(VISIBILITY_LABEL) as VisibilityKey[]).map(k => (
                <option key={k} value={k}>{VISIBILITY_LABEL[k]}</option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-placeholder" />
          </div>

          {/* Sort dropdown — native select keeps the menu accessible without
              pulling in a custom popover; visual treatment matches the
              filter chips and view toggle. */}
          <div className="relative">
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-surface-raised pl-3 pr-7 text-xs font-medium text-text-subtle outline-none transition-colors hover:text-text focus:border-primary/60"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-placeholder" />
          </div>

          {/* View toggle */}
          <div className="inline-flex rounded-md border border-border bg-surface-raised p-0.5">
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label="List view"
              className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                view === 'list'
                  ? 'bg-primary-subtle text-primary'
                  : 'text-text-subtle hover:bg-surface-sunken hover:text-text'
              }`}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-label="Grid view"
              className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                view === 'grid'
                  ? 'bg-primary-subtle text-primary'
                  : 'text-text-subtle hover:bg-surface-sunken hover:text-text'
              }`}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="mt-5">
        {isLoading ? (
          <div className="overflow-hidden rounded-md border border-border bg-surface-raised">
            {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
          </div>
        ) : visibleProjects.length === 0 ? (
          <EmptyState
            hasAnyProjects={(projects?.length ?? 0) > 0}
            isPmOrAbove={isPmOrAbove}
            search={search}
            filter={filter}
            onCreate={() => setShowCreate(true)}
          />
        ) : view === 'list' ? (
          <ProjectList projects={visibleProjects} slug={slug} onTogglePin={onTogglePin} pinPendingId={pinPendingId} />
        ) : (
          <ProjectGrid projects={visibleProjects} slug={slug} onTogglePin={onTogglePin} pinPendingId={pinPendingId} />
        )}
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ── Subviews ─────────────────────────────────────────────────────────────────

function ProjectList({
  projects,
  slug,
  onTogglePin,
  pinPendingId,
}: {
  projects: ProjectSummary[];
  slug: string;
  onTogglePin: (p: ProjectSummary) => void;
  pinPendingId?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface-raised">
      {projects.map((p, i) => (
        <Link
          key={p.id}
          href={orgRoute(slug, `/projects/${p.id}/${p.archived ? 'overview' : 'board'}`)}
          className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface ${
            i > 0 ? 'border-t border-border-subtle' : ''
          }`}
        >
          <PinButton
            pinned={Boolean(p.isPinned)}
            onToggle={() => onTogglePin(p)}
            disabled={pinPendingId === p.id}
          />
          <ProjectAvatar projectKey={p.key} avatarType={p.avatarType} avatarValue={p.avatarValue} archived={p.archived} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-text">{p.name}</p>
              {p.archived && (
                <span className="inline-flex h-4 items-center rounded-sm bg-surface-sunken px-1.5 text-[10px] font-medium text-text-placeholder">
                  Archived
                </span>
              )}
              {p.visibility === 'private' && (
                <span className="inline-flex h-4 items-center rounded-sm bg-warning-subtle px-1.5 text-[10px] font-medium text-warning">
                  Private
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-placeholder">
              <span className="font-mono">{p.key}</span>
              {p.activeSprintName && (
                <span className="flex items-center gap-1">
                  <Layers size={10} />
                  {p.activeSprintName}
                </span>
              )}
              <span className="flex items-center gap-1">
                <ClipboardList size={10} />
                {p.ticketCount} {p.ticketCount === 1 ? 'ticket' : 'tickets'}
              </span>
              <span className="flex items-center gap-1">
                <Users size={10} />
                {p.memberCount} {p.memberCount === 1 ? 'member' : 'members'}
              </span>
            </div>
          </div>
          <span className="hidden text-[11px] text-text-placeholder sm:inline">
            Updated {formatDate(p.lastActive)}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ProjectGrid({
  projects,
  slug,
  onTogglePin,
  pinPendingId,
}: {
  projects: ProjectSummary[];
  slug: string;
  onTogglePin: (p: ProjectSummary) => void;
  pinPendingId?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map(p => (
        <Link
          key={p.id}
          href={orgRoute(slug, `/projects/${p.id}/${p.archived ? 'overview' : 'board'}`)}
          className="group rounded-lg border border-border bg-surface-raised p-4 transition-all hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-start gap-3">
            <ProjectAvatar projectKey={p.key} avatarType={p.avatarType} avatarValue={p.avatarValue} archived={p.archived} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">{p.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-text-placeholder">{p.key}</p>
            </div>
            {p.archived && (
              <Archive size={13} className="flex-shrink-0 text-text-placeholder" aria-label="Archived" />
            )}
            <PinButton
              pinned={Boolean(p.isPinned)}
              onToggle={() => onTogglePin(p)}
              disabled={pinPendingId === p.id}
            />
          </div>

          {p.description && (
            <p className="mt-3 text-xs text-text-subtle line-clamp-2">{p.description}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-placeholder">
            {p.activeSprintName ? (
              <span className="flex items-center gap-1 text-success">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                {p.activeSprintName}
              </span>
            ) : (
              <span className="text-text-placeholder/70">No active sprint</span>
            )}
            <span className="flex items-center gap-1">
              <ClipboardList size={10} />
              {p.ticketCount}
            </span>
            <span className="flex items-center gap-1">
              <Users size={10} />
              {p.memberCount}
            </span>
          </div>

          <p className="mt-3 border-t border-border-subtle pt-2 text-[10px] text-text-placeholder">
            Updated {formatDate(p.lastActive)}
          </p>
        </Link>
      ))}
    </div>
  );
}

function EmptyState({
  hasAnyProjects,
  isPmOrAbove,
  search,
  filter,
  onCreate,
}: {
  hasAnyProjects: boolean;
  isPmOrAbove: boolean;
  search: string;
  filter: FilterKey;
  onCreate: () => void;
}) {
  // Three empty states:
  //   1. No projects exist at all     → "Create your first project"
  //   2. Search returned nothing      → "No matches for X"
  //   3. Filter excluded everything   → "No active/archived projects"
  const copy = EMPTY_STATES.projects;

  if (!hasAnyProjects) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-raised px-6 py-16 text-center">
        <FolderOpen size={32} className="mb-3 text-text-placeholder" />
        <p className="text-sm font-semibold text-text">{copy.noneAtAll.title}</p>
        <p className="mt-1 max-w-sm text-xs text-text-subtle">
          {isPmOrAbove ? copy.noneAtAll.pmBody : copy.noneAtAll.userBody}
        </p>
        {isPmOrAbove && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-text shadow-sm transition-colors hover:bg-primary-hover"
          >
            <Plus size={15} />
            {copy.noneAtAll.cta}
          </button>
        )}
      </div>
    );
  }

  const message = search
    ? copy.noMatches.title(search)
    : copy.filterExcluded.title(FILTER_LABEL[filter]);
  const helper = search ? copy.noMatches.body : copy.filterExcluded.body;

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-raised px-6 py-14 text-center">
      <Search size={26} className="mb-3 text-text-placeholder" />
      <p className="text-sm font-medium text-text">{message}</p>
      <p className="mt-1 text-xs text-text-subtle">{helper}</p>
    </div>
  );
}
