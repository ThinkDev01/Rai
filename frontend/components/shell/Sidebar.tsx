'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Users,
  Settings,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Archive,
  Plus,
  FolderOpen,
  Layers,
  List,
  BarChart2,
  LayoutGrid,
  SlidersHorizontal,
  Pin,
} from '@/lib/icons';
import { useAuthStore, useCurrentMembership } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { useProjects, useProject } from '@/hooks/useProjects';
import { CreateProjectModal } from '@/components/modals/CreateProjectModal';
import { ProjectAvatar } from '@/components/ui/ProjectAvatar';
import { CreateSprintModal } from '@/components/modals/CreateSprintModal';
import { sprintDisplayStatus, SPRINT_PILL_BASE, isLiveSprint } from '@/lib/sprint.utils';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import { confirmModal } from '@/lib/confirmModal';
import { logger } from '@/lib/logger';

// v2 sidebar - route-aware (mirrors v1 shape per [[feedback_v2_frontend_match_v1]]):
//   - on /projects/[id]/* → ProjectSidebar (project identity + sub-nav + sprint list)
//   - otherwise            → GlobalSidebar (dashboard nav + project list)
// Only the auth bits change vs. v1: role checks read off `useCurrentMembership()`
// instead of v1's flat `user.role_type`, and `clearAuth()` is async (Cognito sign-out).

// ── Shared bits ─────────────────────────────────────────────────────────────

function NavLink({
  href,
  children,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const pathname = usePathname();
  // For org-dashboard root (.../dashboard) only treat it as active on exact
  // match; everything else is a startsWith match. The dashboard suffix is the
  // only one whose pathname is a prefix of other routes' pathnames.
  const isDashboard = href.endsWith('/dashboard');
  const active = isDashboard ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors duration-100
        ${active
          ? 'bg-primary-subtle font-medium text-primary'
          : 'text-text-subtle hover:bg-surface hover:text-text'
        }`}
    >
      {icon && <span className="flex-shrink-0 opacity-70">{icon}</span>}
      {children}
    </Link>
  );
}

/**
 * Section title that doubles as a link to a dedicated index page.
 *
 * Same chrome as a static section label, plus a chevron that sits subtly at
 * rest and brightens on hover. The whole title row is the link tap target —
 * works for keyboard, mouse, and touch (no hover-only affordance).
 *
 * Styling: `py-1` + `hover:bg-surface` makes the row read as a tappable
 * button rather than a flat label, and the wider `mb-2.5` opens up breathing
 * room between the title and the "+ New project / + New sprint" CTA that
 * sits right below it. Earlier sizing (mb-1, no vertical padding) made the
 * title-and-create-button pair feel cramped — they touched almost.
 *
 * Used for the Projects / Sprints sidebar sections so each one points at the
 * full dedicated page. Replaces the old "Show all sprints" button pattern.
 */
function SectionTitleLink({
  href,
  children,
  count,
}: {
  href: string;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className="group mt-3 mb-2.5 flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
    >
      <span>{children}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="font-normal normal-case text-text-placeholder/70">
          ({count})
        </span>
      )}
      <ChevronRight
        size={11}
        className="ml-0.5 opacity-40 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function initialsFromText(input: string): string {
  const cleaned = input.includes('@')
    ? (input.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim()
    : input.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return (parts[0]!.slice(0, 2) || '?').toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

// User identity header shared between Global + Project sidebars. Always
// anchored at the top so the caller's name + role + active-org role are the
// first thing you see, even when drilled into a project.
function UserIdentityHeader() {
  const user = useAuthStore(s => s.user);
  const currentMembership = useCurrentMembership();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2.5 border-b border-border bg-surface px-3 py-3.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
        {initialsFromText(user.name?.trim() || user.email || '')}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">
          {user.name?.trim() || user.email}
        </p>
        {currentMembership ? (
          <p className="text-[11px] capitalize text-text-placeholder">
            {currentMembership.role_label ?? currentMembership.role.replace('_', ' ')}
            {/* Show the base role beside a custom label so the caller can
                see BOTH "what they're called" + "what their actual perms
                are" at a glance. Subtler styling so the role_label stays
                primary - the base role tag is a quick reference, not the
                identity. Hidden when role_label is null (then the main
                text IS the base role - no point repeating it). */}
            {currentMembership.role_label && (
              <span className="ml-1.5 normal-case text-[9px] text-text-placeholder/70">
                · {currentMembership.role.replace('_', ' ')}
              </span>
            )}
          </p>
        ) : (
          <p className="text-[11px] capitalize text-text-placeholder">no org</p>
        )}
      </div>
    </div>
  );
}

// ── Global sidebar (non-project routes) ─────────────────────────────────────

// Cap inline rows at 5. When more exist, a single small "+N more · Show all"
// link drops you into the dedicated /projects index page (search, sort,
// filter, grid/list toggle live there). No accordion, no "show less" — keeps
// the sidebar predictable and the index page does the heavy lifting.
const SIDEBAR_PROJECT_VISIBLE = 5;

function GlobalSidebar({ onCreateProject }: { onCreateProject: () => void }) {
  const { user, clearAuth } = useAuthStore();
  const currentMembership = useCurrentMembership();
  const slug = useCurrentSlug() ?? '';
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { data: projects, isLoading } = useProjects();

  const [archiveOpen, setArchiveOpen] = useState(false);

  // Collapse the archive section on every route change. Next App Router keeps
  // the sidebar mounted across navigations within the same layout, so without
  // this effect, an expanded archive would stay expanded after the caller
  // visited My Work / Team / a project and came back — the user reported
  // this as surprising. Resetting on every pathname change is cheap and
  // matches their "I expect a fresh view when I come back" expectation.
  useEffect(() => {
    setArchiveOpen(false);
  }, [pathname]);

  const isOrgAdmin = currentMembership?.role === 'owner' || currentMembership?.role === 'admin';
  const isPmOrAbove =
    isOrgAdmin || currentMembership?.role === 'project_manager';

  // Sort: newest-first by createdAt. Brand-new projects float to the top so
  // the caller sees what they just made; older quiet projects sink. On top of
  // that, the caller's pinned projects float above everything (max 3, enforced
  // server-side) — same quick-access behaviour as the dashboard + /projects
  // index. Stable partition keeps newest-first order within each group.
  const sortedProjects = [...(projects ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const activeUnsorted     = sortedProjects.filter(p => !p.archived);
  const activeProjects     = [...activeUnsorted.filter(p => p.isPinned), ...activeUnsorted.filter(p => !p.isPinned)];
  const archivedProjects   = sortedProjects.filter(p =>  p.archived);
  const visibleProjects    = activeProjects.slice(0, SIDEBAR_PROJECT_VISIBLE);
  const projectsOverflow   = activeProjects.length - visibleProjects.length;

  async function handleLogout() {
    logger.info('Sidebar', 'Sign out clicked — asking for confirmation', { userId: user?.id ?? 'anonymous' });
    const ok = await confirmModal({
      title:        'Sign out?',
      description:  'You will be signed out of all tabs in this browser.',
      confirmLabel: 'Sign out',
      variant:      'danger',
    });
    if (!ok) {
      logger.info('Sidebar', 'Sign out cancelled', { userId: user?.id ?? 'anonymous' });
      return;
    }
    logger.info('Sidebar', 'Sign out confirmed — clearing your session', { userId: user?.id ?? 'anonymous' });
    // "Last org" Cognito write happens continuously in the layout's slug
    // effect, so by the time we get here it's already persisted - no extra
    // call needed on logout.
    await clearAuth();
    qc.clear();
    toast.success('Signed out');
    router.replace('/auth/login');
  }

  return (
    <div className="flex h-full flex-col">
      <UserIdentityHeader />

      {/* Primary nav + Projects list */}
      <div className="flex-1 overflow-y-auto scrollbar-subtle px-2 py-2">
        <NavLink href={orgRoute(slug, '/dashboard')} icon={<LayoutDashboard size={15} />}>Dashboard</NavLink>
        <NavLink href={orgRoute(slug, '/my-work')}   icon={<ClipboardList  size={15} />}>My Work</NavLink>
        {/* Team page absorbed the former Admin page - owner/admin see role +
            remove controls inline on each member row, others see read-only.
            /admin route still 301s to /team for any bookmarks/email links. */}
        <NavLink href={orgRoute(slug, '/team')}      icon={<Users          size={15} />}>Team</NavLink>

        <SectionTitleLink href={orgRoute(slug, '/projects')} count={activeProjects.length}>
          Projects
        </SectionTitleLink>

        {/* "New project" button moved ABOVE the list so it never gets
            pushed off-screen when there are many projects. */}
        {isPmOrAbove && !isLoading && (
          <button
            onClick={onCreateProject}
            className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-text-placeholder transition-colors hover:bg-surface hover:text-text"
          >
            <Plus size={14} />
            New project
          </button>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-1 px-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2.5 py-1.5">
                <div className="h-5 w-5 flex-shrink-0 animate-pulse rounded bg-surface-sunken" />
                <div className="h-3 flex-1 animate-pulse rounded bg-surface-sunken" />
              </div>
            ))}
          </div>
        ) : (
          visibleProjects.map(p => (
            <Link
              key={p.id}
              href={orgRoute(slug, `/projects/${p.id}/board`)}
              className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-subtle transition-colors hover:bg-surface hover:text-text"
            >
              <ProjectAvatar projectKey={p.key} avatarType={p.avatarType} avatarValue={p.avatarValue} size="xs" />
              <span className="flex-1 truncate">{p.name}</span>
              {p.isPinned && (
                <Pin size={12} className="flex-shrink-0 fill-current text-primary" aria-label="Pinned" />
              )}
            </Link>
          ))
        )}

        {/* One-liner that links to the dedicated /projects index page. No
            in-place expand — the index page is the canonical place to browse
            beyond the sidebar's quick-access cut. */}
        {!isLoading && projectsOverflow > 0 && (
          <Link
            href={orgRoute(slug, '/projects')}
            className="group mt-0.5 flex w-full items-center justify-between gap-1 rounded px-2 py-1 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
          >
            <span>+{projectsOverflow} more</span>
            <span className="flex items-center gap-0.5 text-text-placeholder/80 group-hover:text-text-subtle">
              Show all
              <ChevronRight size={11} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}

        {/* Archived projects — collapsible peek. Cap inline rows so an org
            with 50 archived projects doesn't slam the entire sidebar with
            them. Same UX bargain as live projects: 5 inline + a
            "Show all archived" link that drops the caller into the
            /projects index page pre-filtered to Archived. */}
        {archivedProjects.length > 0 && (
          <>
            <button
              onClick={() => setArchiveOpen(v => !v)}
              className="mt-3 flex w-full items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-text-placeholder hover:text-text-subtle"
            >
              {archiveOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Archived
              <span className="ml-1 font-normal normal-case text-text-placeholder/70">
                ({archivedProjects.length})
              </span>
            </button>
            {archiveOpen && (
              <>
                {archivedProjects.slice(0, SIDEBAR_PROJECT_VISIBLE).map(p => (
                  <Link
                    key={p.id}
                    href={orgRoute(slug, `/projects/${p.id}/overview`)}
                    className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
                  >
                    <FolderOpen size={14} className="flex-shrink-0 opacity-60" />
                    <span className="truncate">{p.name}</span>
                  </Link>
                ))}
                {archivedProjects.length > SIDEBAR_PROJECT_VISIBLE && (
                  <Link
                    href={orgRoute(slug, '/projects?filter=archived')}
                    className="group mt-0.5 flex w-full items-center justify-between gap-1 rounded px-2 py-1 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
                  >
                    <span>+{archivedProjects.length - SIDEBAR_PROJECT_VISIBLE} more</span>
                    <span className="flex items-center gap-0.5 text-text-placeholder/80 group-hover:text-text-subtle">
                      Show all archived
                      <ChevronRight size={11} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Bottom */}
      <div className="border-t border-border bg-surface px-2 py-2">
        <NavLink href={orgRoute(slug, '/settings')} icon={<Settings size={15} />}>Settings</NavLink>
        <button
          onClick={handleLogout}
          className="mt-0.5 flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Project sidebar (on /orgs/[slug]/projects/[id]/* routes) ────────────────

// Sidebar shows at most this many sprints inline. Trimmed from 5 → 3 because
// the project sidebar already carries identity + primary nav + the sticky-
// bottom Archive sprints row; 3 keeps the live-sprints section a peek, not a
// wall. The rest live on the dedicated /sprints page reachable via the
// section-title link.
const SPRINT_SIDEBAR_VISIBLE = 3;

function ProjectSidebar({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProject(projectId);
  const [showCreateSprint, setShowCreateSprint] = useState(false);

  const { user, clearAuth } = useAuthStore();
  const currentMembership = useCurrentMembership();
  const slug = useCurrentSlug() ?? '';
  const router = useRouter();
  const qc = useQueryClient();

  const canManageSprints =
    currentMembership?.role === 'owner' ||
    currentMembership?.role === 'admin' ||
    currentMembership?.role === 'project_manager';

  async function handleLogout() {
    logger.info('Sidebar', 'Sign out clicked — asking for confirmation', { userId: user?.id ?? 'anonymous' });
    const ok = await confirmModal({
      title:        'Sign out?',
      description:  'You will be signed out of all tabs in this browser.',
      confirmLabel: 'Sign out',
      variant:      'danger',
    });
    if (!ok) {
      logger.info('Sidebar', 'Sign out cancelled', { userId: user?.id ?? 'anonymous' });
      return;
    }
    logger.info('Sidebar', 'Sign out confirmed — clearing your session', { userId: user?.id ?? 'anonymous' });
    // "Last org" Cognito write happens continuously in the layout's slug
    // effect, so by the time we get here it's already persisted - no extra
    // call needed on logout.
    await clearAuth();
    qc.clear();
    toast.success('Signed out');
    router.replace('/auth/login');
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <UserIdentityHeader />
        <div className="border-b border-border px-3 py-3">
          <div className="mb-2 h-3 w-16 animate-pulse rounded bg-surface-sunken" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 animate-pulse rounded-lg bg-surface-sunken" />
            <div className="flex-1">
              <div className="mb-1.5 h-3.5 w-24 animate-pulse rounded bg-surface-sunken" />
              <div className="h-2.5 w-12 animate-pulse rounded bg-surface-sunken" />
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1 px-2 py-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-7 animate-pulse rounded bg-surface-sunken" />
          ))}
        </div>
      </div>
    );
  }

  // Project not found or error - still render navigation so user isn't stuck.
  if (!project) {
    return (
      <div className="flex h-full flex-col">
        <UserIdentityHeader />
        <div className="border-b border-border px-3 py-3">
          <Link
            href={orgRoute(slug, '/dashboard')}
            className="flex items-center gap-1 text-xs text-text-placeholder hover:text-text-subtle"
          >
            <ChevronLeft size={13} />
            All projects
          </Link>
        </div>
        <div className="flex-1" />
        <div className="border-t border-border bg-surface px-2 py-2">
          <NavLink href={orgRoute(slug, '/settings')} icon={<Settings size={15} />}>Settings</NavLink>
          <button
            onClick={handleLogout}
            className="mt-0.5 flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <UserIdentityHeader />
        {/* Back + project identity */}
        <div className="border-b border-border px-3 py-3">
          <Link
            href={orgRoute(slug, '/dashboard')}
            className="mb-2 flex items-center gap-1 text-xs text-text-placeholder hover:text-text-subtle"
          >
            <ChevronLeft size={13} />
            All projects
          </Link>
          <div className="flex items-center gap-2">
            <ProjectAvatar projectKey={project.key} avatarType={project.avatarType} avatarValue={project.avatarValue} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{project.name}</p>
              <p className="text-[11px] text-text-placeholder">{project.key}</p>
            </div>
          </div>
        </div>

        {/* Primary project nav */}
        <div className="border-b border-border px-2 py-2">
          <NavLink href={orgRoute(slug, `/projects/${projectId}/overview`)} icon={<LayoutGrid        size={14} />}>Overview</NavLink>
          <NavLink href={orgRoute(slug, `/projects/${projectId}/board`)}    icon={<Layers            size={14} />}>Board</NavLink>
          <NavLink href={orgRoute(slug, `/projects/${projectId}/backlog`)}  icon={<List              size={14} />}>Backlog</NavLink>
          <NavLink href={orgRoute(slug, `/projects/${projectId}/reports`)}  icon={<BarChart2         size={14} />}>Reports</NavLink>
          <NavLink href={orgRoute(slug, `/projects/${projectId}/settings`)} icon={<SlidersHorizontal size={14} />}>Project Settings</NavLink>
        </div>

        {/* Sprints. Archived sprints are filtered out (they live on the
            Archive page per v1-feedback Item 17 lifecycle lock).
            Sort:
              1. active first
              2. within remaining (planned + completed), most recent startDate
                 floats up — newly-planned sprints surface above old completed
                 ones; recently completed sits above old planned with no date.
            The dedicated sprints page is reached by clicking the section
            title (hover-reveals a chevron). The old bottom "Show all
            sprints" button is gone — the title link replaces it. */}
        {(() => {
          const liveSprints = [...project.sprints]
            .filter(isLiveSprint)
            .sort((a, b) => {
              const rank = (s: string) => (s === 'active' ? 0 : 1);
              const tierDiff = rank(a.status) - rank(b.status);
              if (tierDiff !== 0) return tierDiff;
              const aT = a.startDate ? new Date(a.startDate).getTime() : 0;
              const bT = b.startDate ? new Date(b.startDate).getTime() : 0;
              return bT - aT;
            });
          const sprintsToShow = liveSprints.slice(0, SPRINT_SIDEBAR_VISIBLE);

          return (
            <div className="flex-1 overflow-y-auto scrollbar-subtle px-2 py-2">
              <SectionTitleLink
                href={orgRoute(slug, `/projects/${projectId}/sprints`)}
                count={liveSprints.length}
              >
                Sprints
              </SectionTitleLink>

              {!project.archived && canManageSprints && (
                <button
                  onClick={() => setShowCreateSprint(true)}
                  // Quieter than before — the selected NavLink uses solid
                  // `bg-primary-subtle` + primary text, and the new-sprint
                  // button was outpacing it visually (solid border + bold
                  // text). Now dashed primary/30 border + transparent bg
                  // + primary text reads as "create affordance" without
                  // competing with the active-nav row. Hover fills back
                  // to primary-subtle so clickability is obvious.
                  //
                  // Height kept tight (`py-1`) so the section title + this
                  // button + 3 sprint rows + show-more + archive-sprints
                  // link all fit in the sidebar's visible area without
                  // scrolling on a standard 1080p viewport.
                  className="mb-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/30 bg-transparent px-2 py-1 text-xs font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary-subtle"
                >
                  <Plus size={13} strokeWidth={2.25} />
                  New sprint
                </button>
              )}

              {sprintsToShow.map(sprint => {
                const ds = sprintDisplayStatus(sprint);
                return (
                  <Link
                    key={sprint.id}
                    href={orgRoute(slug, `/projects/${projectId}/sprints/${sprint.id}`)}
                    // py-1 (was py-1.5) shaves ~4px per row so the section
                    // header + new-sprint CTA + 3 rows + show-more +
                    // archive-sprints link all fit in the visible sidebar
                    // area together, no scroll required.
                    className="flex min-w-0 items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-surface"
                  >
                    <span className="flex-1 truncate text-sm text-text-subtle">{sprint.name}</span>
                    <span className={`flex-shrink-0 ${SPRINT_PILL_BASE} ${ds.pillCls}`}>
                      {ds.label}
                    </span>
                  </Link>
                );
              })}

              {/* Same one-liner as projects in the global sidebar. Surfaces
                  the count of hidden sprints inline + drops the caller into
                  the dedicated sprints page where filter + sort live. */}
              {liveSprints.length > SPRINT_SIDEBAR_VISIBLE && (
                <Link
                  href={orgRoute(slug, `/projects/${projectId}/sprints`)}
                  className="group mt-0.5 flex w-full items-center justify-between gap-1 rounded px-2 py-1 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
                >
                  <span>+{liveSprints.length - SPRINT_SIDEBAR_VISIBLE} more</span>
                  <span className="flex items-center gap-0.5 text-text-placeholder/80 group-hover:text-text-subtle">
                    Show all
                    <ChevronRight size={11} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              )}

              {/* Archive sprints — lives at the end of the sprint section so
                  it groups with sprint navigation, not the account / sign-out
                  block where it previously crowded important destructive
                  actions. No sticky positioning; scrolls with the rest of
                  the sprint list. Subtle treatment so it doesn't compete
                  with active sprint rows for visual priority. */}
              <Link
                href={orgRoute(slug, `/projects/${projectId}/archive`)}
                className="group mt-2 flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-[12px] text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
              >
                <Archive size={12} className="flex-shrink-0 opacity-70" />
                <span className="flex-1 truncate">Archive sprints</span>
                <ChevronRight size={11} className="opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-70" />
              </Link>
            </div>
          );
        })()}

        {/* Bottom */}
        <div className="border-t border-border bg-surface px-2 py-2">
          <NavLink href={orgRoute(slug, '/settings')} icon={<Settings size={15} />}>Settings</NavLink>
          <button
            onClick={handleLogout}
            className="mt-0.5 flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>

      {showCreateSprint && (
        <CreateSprintModal
          projectId={project.id}
          projectKey={project.key}
          existingSprintNames={project.sprints.map(s => s.name)}
          onClose={() => setShowCreateSprint(false)}
        />
      )}
    </>
  );
}

// ── Shell wrapper ───────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, closeSidebar } = useUIStore();
  const [showCreateProject, setShowCreateProject] = useState(false);

  // Detect /orgs/<slug>/projects/[id]/* - the SubNav swap mirrors v1 routing.
  const projectMatch = pathname.match(/^\/orgs\/[^/]+\/projects\/([^/]+)/);
  const projectId    = projectMatch?.[1] ?? null;

  // Auto-close mobile drawer on navigation
  useEffect(() => {
    closeSidebar();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const sidebarContent = projectId
    ? <ProjectSidebar projectId={projectId} />
    : <GlobalSidebar onCreateProject={() => setShowCreateProject(true)} />;

  return (
    <>
      {/* Desktop sidebar - always visible */}
      <aside className="hidden md:block fixed top-14 bottom-9 left-0 z-20 w-60 overflow-hidden border-r border-border bg-surface-raised">
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay - sits BELOW the fixed header (top-14) so the
          nav stays sticky/visible when the drawer opens. User can tap the
          hamburger again to close (or tap the backdrop). */}
      <div className={`md:hidden fixed inset-x-0 top-14 bottom-0 z-40 ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={closeSidebar}
        />
        <aside
          className={`absolute left-0 top-0 bottom-0 w-72 overflow-hidden border-r border-border bg-surface-raised shadow-2xl transition-transform duration-300 ease-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {sidebarContent}
        </aside>
      </div>

      {showCreateProject && <CreateProjectModal onClose={() => setShowCreateProject(false)} />}
    </>
  );
}
