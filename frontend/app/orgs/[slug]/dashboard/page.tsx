'use client';

import { useState, useMemo } from 'react';
import { usePageView } from '@/lib/usePageView';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, Clock, Ticket, Users, Zap, Layers, ClipboardList, ArrowUpRight,
  AlertCircle, ChevronUp, Minus, ChevronDown, ChevronsDown,
  Bug, BookOpen, CheckSquare, X, Pin,
} from '@/lib/icons';
import { useProjects } from '@/hooks/useProjects';
import { useMyWork } from '@/hooks/useMyWork';
import { useDomainPeers } from '@/hooks/useDomainPeers';
import { useDismissedDomainPeers } from '@/hooks/useDismissedDomainPeers';
import { useAuthStore, useCurrentMembership } from '@/store/auth.store';
import { CreateProjectModal } from '@/components/modals/CreateProjectModal';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PageError } from '@/components/ui/PageError';
import { ScrollFade } from '@/components/ui/ScrollFade';
import { MESSAGES } from '@/lib/messages';
import { formatDate } from '@/lib/dates';
import { projectColor } from '@/lib/project.utils';
import { useCurrentRole } from '@/store/auth.store';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import type { TicketType, Priority, TicketStatus, MyWorkItem } from '@/types/api.types';

// ── Icon maps (re-used from My Work for visual consistency) ──────────────────

const TYPE_ICON: Record<TicketType, React.ReactNode> = {
  bug:   <Bug         size={12} className="text-bug"   />,
  story: <BookOpen    size={12} className="text-story" />,
  task:  <CheckSquare size={12} className="text-task"  />,
  epic:  <Zap         size={12} className="text-epic"  />,
};

const PRIORITY_ICON: Record<Priority, React.ReactNode> = {
  critical: <AlertCircle  size={12} className="text-priority-critical" />,
  high:     <ChevronUp    size={12} className="text-priority-high"     />,
  medium:   <Minus        size={12} className="text-priority-medium"   />,
  low:      <ChevronDown  size={12} className="text-priority-low"      />,
  lowest:   <ChevronsDown size={12} className="text-priority-lowest"   />,
};

// Sort key: critical=0 → lowest=4. Used to order "my tickets" preview.
const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0, high: 1, medium: 2, low: 3, lowest: 4,
};

const STATUS_META: Record<TicketStatus, { label: string; cls: string }> = {
  todo:        { label: 'To Do',       cls: 'bg-surface text-text-subtle border-border'         },
  in_progress: { label: 'In Progress', cls: 'bg-warning-subtle text-warning border-warning/40'  },
  in_review:   { label: 'In Review',   cls: 'bg-info-subtle text-info border-info/40'           },
  done:        { label: 'Done',        cls: 'bg-success-subtle text-success border-success/40'  },
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  usePageView('DashboardPage', 'Dashboard opened');
  const [showCreate, setShowCreate] = useState(false);
  const router = useRouter();
  const slug   = useCurrentSlug() ?? '';
  const { data: projects, isLoading: projectsLoading, error: projectsError, refetch } = useProjects();
  const { data: myWork = [], isLoading: myWorkLoading } = useMyWork();
  const user        = useAuthStore(s => s.user);
  const memberships = useAuthStore(s => s.memberships);
  const membership  = useCurrentMembership();
  const role        = useCurrentRole();
  const isPmOrAbove = role === 'owner' || role === 'admin' || role === 'project_manager';
  // Banner gating: only admins + owners see the "another org exists in your
  // domain" alert. PMs and users don't need it - cross-org consolidation is
  // an admin concern.
  const isAdminTier = role === 'owner' || role === 'admin';

  // Domain peers - other orgs in the same email domain. Two-layer filter:
  // first drop peers the user is already a member of (not surprises), then
  // drop ones they've explicitly dismissed via the ✕ on this banner.
  // Settings page renders the full list without the dismissed filter so the
  // info is always retrievable.
  const { data: peerOrgs = [] } = useDomainPeers();
  const { dismissed, dismiss } = useDismissedDomainPeers(user?.id ?? 'anonymous');
  const unknownPeers = useMemo(() => {
    const myOrgIds = new Set(memberships.map(m => m.org_id));
    return peerOrgs.filter(p => !myOrgIds.has(p.id));
  }, [peerOrgs, memberships]);
  const visiblePeers = useMemo(
    () => unknownPeers.filter(p => !dismissed.includes(p.id)),
    [unknownPeers, dismissed],
  );

  // ── Derived stats (zero new backend - both hooks already org-scoped) ──────
  // Pinned projects float to the top of the grid (max 3, enforced server-side).
  // Stable partition preserves the backend's order within each group.
  const activeProjects = useMemo(
    () => {
      const active = (projects ?? []).filter(p => !p.archived);
      return [...active.filter(p => p.isPinned), ...active.filter(p => !p.isPinned)];
    },
    [projects],
  );
  const projectsWithActiveSprint = useMemo(
    () => activeProjects.filter(p => p.activeSprintName),
    [activeProjects],
  );
  const myOpenTickets = useMemo(
    () => myWork.filter(i => i.ticket.status !== 'done'),
    [myWork],
  );
  const myInProgress = useMemo(
    () => myWork.filter(i => i.ticket.status === 'in_progress' || i.ticket.status === 'in_review'),
    [myWork],
  );

  // All my open tickets, sorted by priority then status (in-progress first
  // within same priority - those are most "active" for me). The list body is
  // height-capped + scrollable on the dashboard so a long list doesn't blow
  // up the page; the header badge shows the total count.
  const sortedMyTickets = useMemo(() => {
    const sorted = [...myOpenTickets]
      .sort((a, b) => {
        const p = PRIORITY_RANK[a.ticket.priority] - PRIORITY_RANK[b.ticket.priority];
        if (p !== 0) return p;
        const statusRank: Record<TicketStatus, number> = { in_progress: 0, in_review: 1, todo: 2, done: 3 };
        return statusRank[a.ticket.status] - statusRank[b.ticket.status];
      });
    // Pinned tickets float to the very top (max 3, enforced server-side),
    // matching the My Work page. Stable partition keeps the priority/status
    // order within each group.
    return [...sorted.filter(i => i.ticket.isPinned), ...sorted.filter(i => !i.ticket.isPinned)];
  }, [myOpenTickets]);

  if (projectsLoading) {
    return (
      <div className="px-4 sm:px-8 py-5 sm:py-7">
        <div className="mb-6">
          <div className="mb-2 h-7 w-48 animate-pulse rounded bg-surface-sunken" />
          <div className="h-4 w-64 animate-pulse rounded bg-surface-sunken" />
        </div>
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-sunken" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (projectsError) {
    return (
      <div className="px-4 sm:px-8 py-5 sm:py-7">
        <PageError message="Failed to load dashboard" onRetry={refetch} />
      </div>
    );
  }

  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'there';

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-7 space-y-6">

      {/* ── Welcome header ────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold text-text">
          Welcome back, <span className="text-primary">{displayName}</span>
        </h1>
        <p className="mt-0.5 text-sm text-text-subtle">
          {membership ? `Here's what's happening in ${membership.org_name}.` : 'Here\'s what\'s happening.'}
        </p>
      </div>

      {/* Domain-peer warning - admins + owners only. Surfaces other orgs in
          the caller's email domain that they're NOT already part of, so
          duplicate workspaces in the same company don't go unnoticed.
          Dismissable - the dismissed list persists in localStorage; the same
          info stays visible (always) in Settings → "Other organizations in
          your email domain" if the user wants to look it up later. */}
      {isAdminTier && visiblePeers.length > 0 && (
        <div className="relative rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 pr-9">
          <button
            type="button"
            onClick={() => dismiss(visiblePeers.map(p => p.id))}
            title="Dismiss - still visible in Settings"
            className="absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded text-text-placeholder transition-colors hover:bg-warning/20 hover:text-warning"
          >
            <X size={13} />
          </button>
          <p className="text-sm font-semibold text-warning">
            Other organization{visiblePeers.length === 1 ? '' : 's'} in your email domain
          </p>
          <p className="mt-1 text-xs text-text">
            {visiblePeers.map(p => p.name).join(', ')}
          </p>
          <p className="mt-1 text-xs text-text-placeholder">
            Heads up - someone in your domain has a separate workspace. Reach out if you should consolidate. You can always find this list under Settings.
          </p>
        </div>
      )}

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="My open tickets"
          value={myWorkLoading ? '-' : myOpenTickets.length}
          icon={<ClipboardList size={14} />}
          sub={myWorkLoading ? 'Loading…' : myOpenTickets.length === 0 ? "You're caught up" : `Across ${new Set(myOpenTickets.map(i => i.project.id)).size} projects`}
          accent="primary"
          href={orgRoute(slug, '/my-work')}
        />
        <StatCard
          label="In progress / review"
          value={myWorkLoading ? '-' : myInProgress.length}
          icon={<Layers size={14} />}
          // Sub is rendered as two clickable status-filter links so caller
          // can jump to /my-work pre-filtered to "in progress" OR "in
          // review". A single tile click can't carry both filters, so the
          // dual-link sub is the cleanest answer. NO outer wrap on the
          // tile (no `href` passed) - nested links would be invalid HTML.
          sub={myWorkLoading ? 'Loading…' : (() => {
            const inProg = myInProgress.filter(i => i.ticket.status === 'in_progress').length;
            const inRev  = myInProgress.filter(i => i.ticket.status === 'in_review').length;
            return (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Link
                  href={orgRoute(slug, '/my-work?status=in_progress')}
                  className="rounded text-warning hover:underline"
                >
                  {inProg} in progress
                </Link>
                <span aria-hidden className="text-border">·</span>
                <Link
                  href={orgRoute(slug, '/my-work?status=in_review')}
                  className="rounded text-info hover:underline"
                >
                  {inRev} in review
                </Link>
              </span>
            );
          })()}
          accent="warning"
        />
        <StatCard
          label="Active sprints"
          value={projectsWithActiveSprint.length}
          icon={<Zap size={14} />}
          sub={`Across ${activeProjects.length} project${activeProjects.length === 1 ? '' : 's'}`}
          accent="success"
        />
        <StatCard
          label="Projects"
          value={activeProjects.length}
          icon={<Ticket size={14} />}
          sub={(projects?.length ?? 0) - activeProjects.length > 0 ? `${(projects?.length ?? 0) - activeProjects.length} archived` : 'All active'}
          accent="info"
        />
      </div>

      {/* ── Two-column: My tickets (left) + Active sprints (right) ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* My open tickets */}
        <section className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <ClipboardList size={14} className="text-text-subtle" />
              <h2 className="text-sm font-semibold text-text">My open tickets</h2>
              {myOpenTickets.length > 0 && (
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-text-placeholder">
                  {myOpenTickets.length}
                </span>
              )}
            </div>
            <Link
              href={orgRoute(slug, '/my-work')}
              className="flex items-center gap-1 text-xs text-text-link hover:underline"
            >
              View all
              <ArrowUpRight size={12} />
            </Link>
          </div>
          {myWorkLoading ? (
            <div className="px-5 py-4 space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-8 animate-pulse rounded bg-surface-sunken" />)}
            </div>
          ) : sortedMyTickets.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <ClipboardList size={24} className="mx-auto mb-2 text-border" />
              <p className="text-sm font-medium text-text">{MESSAGES.myWork.noTickets.title}</p>
              <p className="mt-0.5 text-xs text-text-subtle">{MESSAGES.myWork.noTickets.description}</p>
            </div>
          ) : (
            // Height-capped (~5+ rows) + subtle scroll so a long ticket list
            // doesn't grow the page. Matched max-height with Active sprints
            // keeps the two columns balanced. Count badge in the header;
            // ScrollFade hints "more below".
            <ScrollFade className="max-h-[300px] overflow-y-auto scrollbar-subtle divide-y divide-border">
              {sortedMyTickets.map(item => (
                <MyTicketRow key={item.ticket.id} item={item} />
              ))}
            </ScrollFade>
          )}
        </section>

        {/* Active sprints */}
        <section className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-text-subtle" />
              <h2 className="text-sm font-semibold text-text">Active sprints</h2>
              {projectsWithActiveSprint.length > 0 && (
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-text-placeholder">
                  {projectsWithActiveSprint.length}
                </span>
              )}
            </div>
          </div>
          {projectsWithActiveSprint.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Zap size={24} className="mx-auto mb-2 text-border" />
              <p className="text-sm font-medium text-text">No active sprints</p>
              <p className="mt-0.5 text-xs text-text-subtle">
                Sprints will show here once teams start them.
              </p>
            </div>
          ) : (
            // Same max-height + subtle scroll as My open tickets — shows ~5
            // sprints with a peek of the next, scrolls past that. Previously
            // unbounded, which grew the page on sprint-heavy orgs. ScrollFade
            // hints "more below".
            <ScrollFade className="max-h-[300px] overflow-y-auto scrollbar-subtle divide-y divide-border">
              {projectsWithActiveSprint.map(p => (
                <Link
                  key={p.id}
                  href={orgRoute(slug, `/projects/${p.id}/board`)}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface group"
                >
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: projectColor(p.key) }}
                  >
                    {p.key[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-text group-hover:text-primary transition-colors">
                      {p.name}
                    </p>
                    <p className="truncate text-xs text-text-placeholder">
                      <Zap size={10} className="inline -mt-0.5 mr-1 text-success" />
                      {p.activeSprintName}
                    </p>
                  </div>
                  <ArrowUpRight size={13} className="flex-shrink-0 text-text-placeholder opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </ScrollFade>
          )}
        </section>
      </div>

      {/* ── Projects grid (existing functionality, now a section) ─────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          {/* Title is a Link to the dedicated /projects index. Chevron sits
              at 0% opacity at rest and brightens on hover — keeps the
              dashboard quiet visually while still discoverable. The whole
              title row (icon + word + count) is the tap target. */}
          <Link
            href={orgRoute(slug, '/projects')}
            className="group flex items-center gap-2 rounded transition-colors hover:text-primary"
            title="Open all projects"
          >
            <Ticket size={14} className="text-text-subtle group-hover:text-primary" />
            <h2 className="text-sm font-semibold text-text group-hover:text-primary">Projects</h2>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-text-placeholder">
              {activeProjects.length}
            </span>
            <ArrowUpRight
              size={13}
              className="ml-0.5 text-text-placeholder opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
            />
          </Link>
          {isPmOrAbove && activeProjects.length > 0 && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              <Plus size={14} />
              New project
            </button>
          )}
        </div>

        {/* Empty state */}
        {activeProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-raised py-16 text-center">
            {isPmOrAbove ? (
              <button
                onClick={() => setShowCreate(true)}
                className="group mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-border transition-colors hover:border-primary hover:bg-primary-subtle"
              >
                <Plus size={28} className="text-border transition-colors group-hover:text-primary" />
              </button>
            ) : (
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-border">
                <Plus size={28} className="text-border" />
              </div>
            )}
            <h3 className="text-sm font-semibold text-text">
              {isPmOrAbove
                ? MESSAGES.dashboard.noProjects.title
                : MESSAGES.dashboard.noProjectsNonAdmin.title}
            </h3>
            <p className="mt-1.5 max-w-xs text-xs text-text-subtle">
              {isPmOrAbove
                ? MESSAGES.dashboard.noProjects.description
                : MESSAGES.dashboard.noProjectsNonAdmin.description}
            </p>
            {isPmOrAbove && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 rounded bg-primary px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
              >
                {MESSAGES.dashboard.noProjects.cta}
              </button>
            )}
          </div>
        ) : (
          (() => {
            // Cap visible cards so the dashboard stays scannable. 6 = 2 rows
            // at xl (3-col), 3 rows at sm (2-col), 6 rows at base (1-col).
            // Anything beyond surfaces via the "Show all" bar below.
            const DASHBOARD_PROJECT_CAP = 6;
            const visible = activeProjects.slice(0, DASHBOARD_PROJECT_CAP);
            const overflow = activeProjects.length - visible.length;
            return (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map(project => (
                    <button
                      key={project.id}
                      onClick={() => router.push(orgRoute(slug, `/projects/${project.id}/board`))}
                      className="group flex flex-col rounded-lg border border-border bg-surface-raised p-4 text-left shadow-sm transition-all duration-150 hover:border-primary hover:shadow-md"
                    >
                      <div className="mb-3 flex items-center gap-2.5">
                        <div
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                          style={{ backgroundColor: projectColor(project.key) }}
                        >
                          {project.key[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-text group-hover:text-primary transition-colors">
                            {project.name}
                          </p>
                          <p className="text-[11px] text-text-placeholder">{project.key}</p>
                        </div>
                        {project.isPinned && (
                          <Pin size={13} className="flex-shrink-0 fill-current text-primary" aria-label="Pinned" />
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mb-3">
                        <Stat icon={<Ticket size={11} />} label="Tickets" value={project.ticketCount} />
                        <Stat icon={<Users size={11} />} label="Members" value={project.memberCount} />
                        <Stat icon={<Zap size={11} />} label="Sprint" value={project.activeSprintName ?? '-'} compact />
                      </div>
                      <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-border">
                        <Clock size={10} className="text-text-placeholder" />
                        <span className="text-[11px] text-text-placeholder">Active {formatDate(project.lastActive)}</span>
                      </div>
                    </button>
                  ))}
                  {/* "New project" tile only shows up when there's no overflow
                      OR when there's space in the grid (less than the cap).
                      Once we render the "Show all" bar, the bar replaces the
                      grid-bottom CTA — clearer than two CTAs side by side. */}
                  {isPmOrAbove && overflow === 0 && (
                    <button
                      onClick={() => setShowCreate(true)}
                      className="group flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-4 transition-colors hover:border-primary hover:bg-primary-subtle min-h-[140px]"
                    >
                      <Plus size={20} className="mb-1.5 text-border transition-colors group-hover:text-primary" />
                      <span className="text-xs text-text-placeholder group-hover:text-primary transition-colors">New project</span>
                    </button>
                  )}
                </div>

                {/* Full-width "Show all" CTA — only when there's overflow.
                    Routes to the dedicated /projects index page where sort,
                    filter, and grid/list toggle live. */}
                {overflow > 0 && (
                  <Link
                    href={orgRoute(slug, '/projects')}
                    className="group mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-raised px-4 py-3.5 text-sm font-medium text-text-subtle transition-colors hover:border-primary hover:bg-primary-subtle hover:text-primary"
                  >
                    <span>Show all {activeProjects.length} projects</span>
                    <span className="text-text-placeholder group-hover:text-primary/70">
                      ({overflow} more)
                    </span>
                    <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )}
              </>
            );
          })()
        )}
      </section>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ── Stat card ───────────────────────────────────────────────────────────────

type Accent = 'primary' | 'success' | 'warning' | 'info';

const ACCENT_CLS: Record<Accent, string> = {
  primary: 'text-primary bg-primary/10',
  success: 'text-success bg-success/10',
  warning: 'text-warning bg-warning/10',
  info:    'text-info    bg-info/10',
};

function StatCard({
  label, value, icon, sub, accent, href,
}: {
  label: string;
  value: string | number;
  icon:  React.ReactNode;
  sub:   React.ReactNode;
  accent: Accent;
  href?: string;
}) {
  const inner = (
    <div className={`rounded-lg border border-border bg-surface-raised px-4 py-3 shadow-sm transition-all duration-150 ${href ? 'hover:border-primary/40 hover:shadow-md cursor-pointer group' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">{label}</p>
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${ACCENT_CLS[accent]}`}>
          {icon}
        </span>
      </div>
      <p className="text-2xl font-bold text-text">{value}</p>
      <div className="mt-0.5 text-[11px] text-text-placeholder truncate">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ── Project card mini-stat ──────────────────────────────────────────────────

function Stat({ icon, label, value, compact = false }: {
  icon:  React.ReactNode;
  label: string;
  value: string | number;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center rounded bg-surface px-2 py-1.5">
      <span className="mb-0.5 text-text-placeholder">{icon}</span>
      <span className={`font-semibold text-text ${compact ? 'truncate w-full text-center text-[11px] leading-tight' : 'text-sm'}`}>
        {value}
      </span>
      <span className="text-[9px] text-text-placeholder">{label}</span>
    </div>
  );
}

// ── My open ticket row ──────────────────────────────────────────────────────

function MyTicketRow({ item }: { item: MyWorkItem }) {
  const { ticket, project } = item;
  const statusMeta = STATUS_META[ticket.status];
  const slug = useCurrentSlug() ?? '';

  return (
    <Link
      href={orgRoute(slug, `/projects/${project.id}/tickets/${ticket.key}`)}
      className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface group"
    >
      <div className="flex items-center gap-1 flex-shrink-0">
        {ticket.isPinned && <Pin size={11} className="fill-current text-primary" aria-label="Pinned" />}
        {PRIORITY_ICON[ticket.priority]}
        {TYPE_ICON[ticket.type]}
      </div>
      <span className="w-16 flex-shrink-0 font-mono text-[11px] text-text-placeholder">{ticket.key}</span>
      <span className="flex-1 truncate text-sm text-text group-hover:text-primary transition-colors">{ticket.title}</span>
      <span
        className="hidden sm:inline-flex flex-shrink-0 items-center gap-1.5 text-[10px] text-text-placeholder"
        title={project.name}
      >
        <span
          className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white"
          style={{ backgroundColor: projectColor(project.key) }}
        >
          {project.key[0]}
        </span>
        <span className="hidden md:inline max-w-[80px] truncate">{project.key}</span>
      </span>
      <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${statusMeta.cls}`}>
        {statusMeta.label}
      </span>
    </Link>
  );
}
