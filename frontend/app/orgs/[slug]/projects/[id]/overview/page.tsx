'use client';

import { use, useEffect, useRef, useState } from 'react';
import { usePageView } from '@/lib/usePageView';
import Link from 'next/link';
import { Users, Layers, CheckCircle2, Clock, Archive, AlertTriangle, ChevronDown, ChevronUp, Target, List } from '@/lib/icons';
import { useProject } from '@/hooks/useProjects';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PageError } from '@/components/ui/PageError';
import { PageNotFound } from '@/components/ui/PageNotFound';
import { isNotFoundError } from '@/lib/errors';
import type { Project, Sprint } from '@/types/api.types';
import { projectColor, memberColor } from '@/lib/project.utils';
import { sprintDisplayStatus, SPRINT_PILL_BASE, isLiveSprint } from '@/lib/sprint.utils';
import { formatDate } from '@/lib/dates';
import { orgRoute, useCurrentSlug } from '@/lib/routes';

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-5 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-text-placeholder">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-text">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-subtle">{sub}</p>}
    </div>
  );
}

// ── Sprint summary row ────────────────────────────────────────────────────────

function SprintRow({ sprint, projectId }: { sprint: Sprint; projectId: string }) {
  const slug  = useCurrentSlug() ?? '';
  const done  = sprint.tickets.filter(t => t.status === 'done').length;
  const total = sprint.tickets.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 100;
  const ds    = sprintDisplayStatus(sprint);

  return (
    <Link
      href={orgRoute(slug, `/projects/${projectId}/sprints/${sprint.id}`)}
      className="flex items-center gap-4 py-3 hover:bg-surface rounded-lg px-2 -mx-2 transition-colors"
    >
      <div className="flex-shrink-0">
        {sprint.status === 'completed'
          ? <CheckCircle2 size={15} className="text-success" />
          : sprint.status === 'active'
          ? <Layers size={15} className="text-primary" />
          : <Clock size={15} className="text-text-placeholder" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-text">{sprint.name}</span>
          <span className={`${SPRINT_PILL_BASE} ${ds.pillCls}`}>{ds.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
            <div
              className={`h-full rounded-full ${sprint.status === 'completed' ? 'bg-success' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="flex-shrink-0 text-xs text-text-placeholder">{done}/{total}</span>
        </div>
      </div>
      <span className="flex-shrink-0 text-xs text-text-placeholder whitespace-nowrap hidden sm:block">
        {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
      </span>
    </Link>
  );
}

// ── Active sprint card ────────────────────────────────────────────────────────

function ActiveSprintCard({ sprint }: { sprint: Sprint }) {
  const byStatus = {
    todo:        sprint.tickets.filter(t => t.status === 'todo').length,
    in_progress: sprint.tickets.filter(t => t.status === 'in_progress').length,
    in_review:   sprint.tickets.filter(t => t.status === 'in_review').length,
    done:        sprint.tickets.filter(t => t.status === 'done').length,
  };
  const total = sprint.tickets.length;
  const pct   = total > 0 ? Math.round((byStatus.done / total) * 100) : 0;
  const ds    = sprintDisplayStatus(sprint);

  return (
    <div className="rounded-lg border border-primary/20 bg-primary-subtle/30 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-semibold text-text">{sprint.name}</p>
            <span className={`${SPRINT_PILL_BASE} ${ds.pillCls}`}>{ds.label}</span>
          </div>
          <p className="text-xs text-text-placeholder">{formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}</p>
        </div>
        <p className="text-2xl font-bold text-primary">{pct}%</p>
      </div>

      {sprint.goal && (
        <div className="mb-4">
          <MarkdownRenderer content={sprint.goal} />
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          { label: 'To Do',        count: byStatus.todo,        cls: 'text-text-subtle' },
          { label: 'In Progress',  count: byStatus.in_progress, cls: 'text-warning'     },
          { label: 'In Review',    count: byStatus.in_review,   cls: 'text-info'        },
          { label: 'Done',         count: byStatus.done,        cls: 'text-success'     },
        ] as const).map(({ label, count, cls }) => (
          <div key={label} className="rounded-md bg-surface px-2 py-1.5 text-center">
            <p className={`text-base font-bold ${cls}`}>{count}</p>
            <p className="text-[10px] text-text-placeholder">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// Initial sprint-history cut + per-click batch size for show-more. Matches
// the sidebar pattern (Sidebar.tsx) so the reveal feels consistent across
// the app.
const SPRINT_HISTORY_INITIAL = 10;
const SPRINT_HISTORY_BATCH   = 10;

export default function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  usePageView('OverviewPage', 'Project overview page opened', { projectId: id });
  const slug = useCurrentSlug() ?? '';
  const { data: project, isLoading, error, refetch } = useProject(id);
  const [historyVisible, setHistoryVisible] = useState(SPRINT_HISTORY_INITIAL);

  // Match the right column (Members) to the height of the left column
  // (Active sprint + Sprint history) on desktop. CSS Grid alone can only
  // stretch BOTH columns to the tallest content — we want the right column
  // to be its natural height (short list = short panel) UP TO the left
  // column's height (long list = scroll inside). That requires JS to
  // measure the left column and apply max-height to the right.
  //
  // ResizeObserver runs every time the left column's content changes
  // (sprint history "show more" / "show less", sprint cards expanding,
  // etc.) so the right cap stays in sync.
  //
  // The matchMedia check gates the cap to desktop only — on mobile the
  // columns stack, so applying the left column height to the right would
  // unnecessarily clip members for no UX gain.
  const leftColRef = useRef<HTMLDivElement>(null);
  const [leftColHeight, setLeftColHeight] = useState<number | null>(null);
  const [isDesktop, setIsDesktop]         = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const el = leftColRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setLeftColHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [project?.id]);

  const cappedHeight = isDesktop && leftColHeight ? leftColHeight : undefined;

  if (isLoading) {
    return (
      <div className="flex flex-col px-4 sm:px-6 py-6">
        <div className="mb-6 flex items-start gap-4">
          <div className="h-12 w-12 animate-pulse rounded-xl bg-surface-sunken flex-shrink-0" />
          <div className="flex-1">
            <div className="h-6 w-40 animate-pulse rounded bg-surface-sunken mb-2" />
            <div className="h-4 w-56 animate-pulse rounded bg-surface-sunken" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return isNotFoundError(error)
      ? <PageNotFound title="Project not found" message="This project doesn't exist or you don't have access." />
      : <PageError message="Failed to load project" onRetry={refetch} />;
  }
  if (!project) return null;

  // Archived sprints live on the Archive page - exclude from overview stats
  // and sprint history so they don't muddy the active picture.
  const liveSprints      = project.sprints.filter(isLiveSprint);
  const activeSprint     = liveSprints.find(s => s.status === 'active');
  const plannedSprints   = liveSprints.filter(s => s.status === 'planned');
  const completedSprints = liveSprints.filter(s => s.status === 'completed');
  const allTickets       = liveSprints.flatMap(s => s.tickets);
  const doneCount       = allTickets.filter(t => t.status === 'done').length;
  const totalCount      = allTickets.length;
  const completionPct   = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col">
      <div className="px-4 sm:px-6 py-6">

        {/* Archived banner */}
        {project.archived && (
          <div className="mb-5 flex items-center gap-2.5 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3 text-sm text-warning">
            <Archive size={15} className="flex-shrink-0" />
            <span>This project is archived and read-only.</span>
          </div>
        )}

        {/* Project header */}
        <div className="mb-6 flex items-start gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow-sm"
            style={{ backgroundColor: projectColor(project.key) }}
          >
            {project.key[0]}
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">{project.name}</h1>
            <p className="text-sm text-text-placeholder">{project.key} · Last active {formatDate(project.lastActive)}</p>
            {project.description && (
              <MarkdownRenderer content={project.description} className="mt-2 text-text-subtle" />
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total tickets" value={totalCount} sub={`${doneCount} completed`} />
          <StatCard label="Completion" value={`${completionPct}%`} sub={`${doneCount}/${totalCount} done`} />
          <StatCard label="Members" value={project.members.length} />
          <StatCard label="Sprints" value={liveSprints.length} sub={`${completedSprints.length} completed`} />
        </div>

        {/* `lg:items-start` is load-bearing here. Without it, CSS Grid's
            default `align-items: stretch` makes both columns grow to the
            row height (= the taller of the two). When the right column
            (Members) has 50+ rows naturally taller than the left column,
            the left column gets stretched to match — and the ResizeObserver
            below measures that stretched height, which feeds back into the
            right column's max-height, which doesn't constrain anything.
            With `items-start` each column keeps its natural height; the
            observer measures the real left-column content, and the right
            column's max-height caps members to that. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">

          {/* Left col: Active sprint + Sprint history.
              `ref` measured by ResizeObserver above so the right column
              (Members) can cap its scroll height to match. */}
          <div ref={leftColRef} className="col-span-1 lg:col-span-2 flex flex-col gap-4">

            {/* Active sprint */}
            {activeSprint ? (
              <div>
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-text-placeholder">
                  Active Sprint
                </p>
                <ActiveSprintCard sprint={activeSprint} />
              </div>
            ) : !project.archived ? (
              <div>
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-text-placeholder">
                  Active Sprint
                </p>
                {/* Treat the empty state as a full card — same chrome as
                    ActiveSprintCard would have here (border, bg-surface-raised,
                    shadow-sm). Previously the dashed placeholder read as
                    accidentally-empty layout; this reads as an actionable
                    "you have no active sprint, here's what to do" panel. */}
                <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-warning-subtle text-warning">
                      <Target size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-text">No sprint is active</h3>
                      <p className="mt-1 text-sm text-text-subtle">
                        {plannedSprints.length > 0
                          ? `You have ${plannedSprints.length} planned sprint${plannedSprints.length === 1 ? '' : 's'} waiting to start — open one to kick it off.`
                          : 'Plan a sprint in the Backlog and start it when ready. Tickets you commit will surface here.'}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={orgRoute(slug, `/projects/${id}/backlog`)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
                        >
                          <List size={13} />
                          Open Backlog
                        </Link>
                        {plannedSprints.length > 0 && (
                          <Link
                            href={orgRoute(slug, `/projects/${id}/sprints`)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text-subtle transition-colors hover:border-primary/40 hover:text-text"
                          >
                            <Layers size={13} />
                            View {plannedSprints.length} planned
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Sprint history - live (non-archived) sprints only. Batched
                show-more (10 at a time) so a 25-sprint project doesn't
                slam the page with everything at once. Archived sprints
                live exclusively on the Archive page. */}
            {liveSprints.length > 0 && (() => {
              const visible    = liveSprints.slice(0, historyVisible);
              const remaining  = liveSprints.length - historyVisible;
              const nextBatch  = Math.min(SPRINT_HISTORY_BATCH, remaining);
              return (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-text-placeholder">
                    Sprint History {liveSprints.length > SPRINT_HISTORY_INITIAL && (
                      <span className="font-normal normal-case text-text-placeholder/70">
                        · {liveSprints.length} total
                      </span>
                    )}
                  </p>
                  <div className="rounded-lg border border-border bg-surface-raised shadow-sm divide-y divide-border px-4">
                    {visible.map(sprint => (
                      <SprintRow key={sprint.id} sprint={sprint} projectId={id} />
                    ))}
                  </div>
                  {(remaining > 0 || historyVisible > SPRINT_HISTORY_INITIAL) && (
                    <div className="mt-2 flex items-center gap-2">
                      {remaining > 0 && (
                        <button
                          onClick={() => setHistoryVisible(v => v + SPRINT_HISTORY_BATCH)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
                        >
                          <ChevronDown size={11} />
                          Show {nextBatch} more
                          <span className="ml-1 text-text-placeholder/60">({remaining} left)</span>
                        </button>
                      )}
                      {historyVisible > SPRINT_HISTORY_INITIAL && (
                        <button
                          onClick={() => setHistoryVisible(SPRINT_HISTORY_INITIAL)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
                        >
                          <ChevronUp size={11} />
                          Show less
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Right col: Members. Dynamic max-height matches the left column
              on desktop:
                • Few members (content fits) → natural height, no scroll
                • Many members (overflow) → caps at left column height,
                  scrolls inside the panel
              Footer ("Manage members") stays pinned at the bottom of the
              panel regardless. On mobile the cap is dropped (columns stack)
              so members flow naturally. */}
          <div
            style={{ maxHeight: cappedHeight }}
            className="flex min-h-0 flex-col"
          >
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-text-placeholder">
              Members{project.members.length > 0 && ` (${project.members.length})`}
            </p>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
              {/* Members list — flex-1 + min-h-0 lets it shrink within the
                  capped panel so the inner overflow-y-auto can scroll. */}
              <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
                {project.members.map(member => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div
                      style={{ backgroundColor: memberColor(member.id) }}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    >
                      {member.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{member.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="text-[11px] text-text-placeholder">{member.role_name}</span>
                        <span className="rounded border border-border/50 px-1 py-px text-[10px] leading-none text-text-placeholder/60">
                          {member.role_type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {!project.archived && (
                <div className="shrink-0 px-4 py-2.5 border-t border-border">
                  <button className="flex items-center gap-1.5 text-xs text-text-placeholder hover:text-text transition-colors">
                    <Users size={12} />
                    Manage members
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
