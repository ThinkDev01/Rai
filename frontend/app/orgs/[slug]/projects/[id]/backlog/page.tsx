'use client';

import { useState, use, Suspense, useRef, useMemo } from 'react';
import { usePageView } from '@/lib/usePageView';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Bug, BookOpen, CheckSquare, Zap, AlertCircle, ChevronUp, Minus, ChevronDown, ChevronsDown, Plus, ChevronRight, Play, CheckCheck } from '@/lib/icons';
import { useProject } from '@/hooks/useProjects';
import { useUpdateTicket } from '@/hooks/useTickets';
import { useStartSprint, useCompleteSprint } from '@/hooks/useSprints';
import { useAuthStore, useCurrentRole } from '@/store/auth.store';
import { canCreateTicketInProject, createTicketBlockedReason, memberColor } from '@/lib/project.utils';
import { sprintDisplayStatus, SPRINT_PILL_BASE, isLiveSprint } from '@/lib/sprint.utils';
import { confirmModal } from '@/lib/confirmModal';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { EpicTag } from '@/components/ticket/EpicTag';
import { buildEpicLookup } from '@/lib/ticket.meta';
import { ProjectSubNav, UNASSIGNED_FILTER, type TypeFilter, type PriorityFilter } from '@/components/shell/ProjectSubNav';
import { TicketPanel } from '@/components/shell/TicketPanel';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { PageError } from '@/components/ui/PageError';
import { PageNotFound } from '@/components/ui/PageNotFound';
import { isNotFoundError } from '@/lib/errors';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import type { Ticket, Sprint, TicketType, Priority } from '@/types/api.types';

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

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', in_review: 'In Review', done: 'Done',
};

function TicketRow({ ticket, projectId, onOpen, epicLookup }: { ticket: Ticket; projectId: string; onOpen: () => void; epicLookup?: Map<string, { name: string; color: string }> }) {
  const router = useRouter();
  const slug = useCurrentSlug() ?? '';
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentEpic = ticket.parentKey ? epicLookup?.get(ticket.parentKey) : undefined;

  function handleClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      router.push(orgRoute(slug, `/projects/${projectId}/tickets/${ticket.key}`));
    } else {
      clickTimer.current = setTimeout(() => { clickTimer.current = null; onOpen(); }, 220);
    }
  }

  return (
    <div
      onClick={handleClick}
      className="group flex items-center gap-3 rounded px-3 py-2 transition-colors hover:bg-surface cursor-pointer"
    >
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {TYPE_ICON[ticket.type]}
        {PRIORITY_ICON[ticket.priority]}
      </div>
      <span className="w-20 flex-shrink-0 text-xs text-text-placeholder font-mono">{ticket.key}</span>
      <span className="flex-1 text-sm text-text truncate">{ticket.title}</span>
      {parentEpic && <EpicTag name={parentEpic.name} color={parentEpic.color} />}
      <span className="flex-shrink-0 rounded bg-surface px-2 py-0.5 text-[11px] text-text-subtle">
        {STATUS_LABEL[ticket.status]}
      </span>
      {ticket.assignee ? (
        <div
          title={ticket.assignee.name}
          style={{ backgroundColor: memberColor(ticket.assignee.id) }}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
        >
          {ticket.assignee.initials}
        </div>
      ) : (
        <div className="h-6 w-6 flex-shrink-0 rounded-full border border-dashed border-text-placeholder bg-surface" />
      )}
    </div>
  );
}

function SprintSection({
  sprint, initialOpen, projectId, canManage, hasActiveSprint, onOpenTicket, onAddTicket,
  filterAssignees, filterType, filterPriority, canCreateTicket, epicLookup,
}: {
  sprint: Sprint;
  initialOpen: boolean;
  projectId: string;
  canManage: boolean;
  hasActiveSprint: boolean;
  onOpenTicket: (ticket: Ticket) => void;
  onAddTicket: () => void;
  filterAssignees: string[];
  filterType: TypeFilter;
  filterPriority: PriorityFilter;
  canCreateTicket: boolean;
  epicLookup?: Map<string, { name: string; color: string }>;
}) {
  const [open, setOpen] = useState(initialOpen);
  const { mutate: startSprint, isPending: isStarting }       = useStartSprint(projectId, sprint.id);
  const { mutate: completeSprint, isPending: isCompleting }  = useCompleteSprint(projectId, sprint.id);
  const done = sprint.tickets.filter(t => t.status === 'done').length;
  const visibleTickets = sprint.tickets.filter(t => {
    if (filterAssignees.length > 0 && !filterAssignees.includes(t.assignee?.id ?? UNASSIGNED_FILTER)) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  return (
    <div className="mb-4">
      <div className="flex items-center">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex flex-1 items-center gap-2 rounded px-3 py-2 transition-colors hover:bg-surface"
        >
          <ChevronRight
            size={15}
            className={`flex-shrink-0 text-text-placeholder transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <span className="font-semibold text-sm text-text">{sprint.name}</span>
          {(() => {
            const ds = sprintDisplayStatus(sprint);
            return <span className={`${SPRINT_PILL_BASE} ${ds.pillCls}`}>{ds.label}</span>;
          })()}
          <span className="ml-auto text-xs text-text-placeholder">
            {done}/{sprint.tickets.length} done
          </span>
        </button>

        {canManage && sprint.status === 'planned' && !hasActiveSprint && (
          <button
            onClick={() => startSprint()}
            disabled={isStarting}
            className="ml-2 flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:border-success hover:text-success disabled:opacity-50"
          >
            <Play size={11} />
            {isStarting ? 'Starting…' : 'Start'}
          </button>
        )}
        {canManage && sprint.status === 'active' && (
          <button
            onClick={async () => {
              // Same irreversible action as the sprint page — gate it so a
              // stray click can't complete the sprint and freeze it.
              const ok = await confirmModal({
                title: 'Complete this sprint?',
                description: 'Incomplete tickets return to the backlog and the sprint is locked — this cannot be undone.',
                confirmLabel: 'Complete sprint',
                cancelLabel: 'Keep sprint active',
                variant: 'warning',
              });
              if (ok) completeSprint();
            }}
            disabled={isCompleting}
            title="Incomplete tickets will return to backlog"
            className="ml-2 flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <CheckCheck size={11} />
            {isCompleting ? 'Completing…' : 'Complete'}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-1 ml-4 border-l border-border pl-2">
          {sprint.tickets.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-placeholder">No tickets in this sprint.</p>
          ) : visibleTickets.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-placeholder italic">No tickets match the current filters.</p>
          ) : (
            visibleTickets.map(ticket => (
              <TicketRow key={ticket.id} ticket={ticket} projectId={projectId} onOpen={() => onOpenTicket(ticket)} epicLookup={epicLookup} />
            ))
          )}
          {canCreateTicket && (
            <button
              onClick={onAddTicket}
              className="flex items-center gap-1.5 rounded px-3 py-2 text-sm text-text-placeholder transition-colors hover:bg-surface hover:text-text"
            >
              <Plus size={13} />
              Add ticket
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BacklogSection({
  tickets, projectId, canManage, sprints, onOpenTicket, onAddTicket,
  filterAssignees, filterType, filterPriority, canCreateTicket, epicLookup,
}: {
  tickets: Ticket[];
  projectId: string;
  canManage: boolean;
  sprints: Sprint[];
  onOpenTicket: (ticket: Ticket) => void;
  onAddTicket: () => void;
  filterAssignees: string[];
  filterType: TypeFilter;
  filterPriority: PriorityFilter;
  canCreateTicket: boolean;
  epicLookup?: Map<string, { name: string; color: string }>;
}) {
  const [open, setOpen] = useState(true);
  // "Move to sprint" picker - only live (non-archived) non-completed sprints.
  const activeSprints = sprints.filter(s => s.status !== 'completed' && isLiveSprint(s));
  const visibleTickets = tickets.filter(t => {
    if (filterAssignees.length > 0 && !filterAssignees.includes(t.assignee?.id ?? UNASSIGNED_FILTER)) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex flex-1 items-center gap-2 rounded px-3 py-2 transition-colors hover:bg-surface"
        >
          <ChevronRight
            size={15}
            className={`flex-shrink-0 text-text-placeholder transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <span className="font-semibold text-sm text-text">Backlog</span>
          <span className="text-xs text-text-placeholder ml-1">{tickets.length} tickets</span>
        </button>
        {canCreateTicket && (
          <button
            onClick={onAddTicket}
            className="ml-2 flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary"
          >
            <Plus size={11} />
            Add ticket
          </button>
        )}
      </div>

      {open && (
        <div className="mt-1 ml-4 border-l border-border pl-2">
          {tickets.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-placeholder">No tickets in backlog.</p>
          ) : visibleTickets.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-placeholder italic">No tickets match the current filters.</p>
          ) : (
            visibleTickets.map(ticket => (
              <BacklogTicketRow
                key={ticket.id}
                ticket={ticket}
                projectId={projectId}
                canManage={canManage}
                sprints={activeSprints}
                onOpen={() => onOpenTicket(ticket)}
                epicLookup={epicLookup}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BacklogTicketRow({
  ticket, projectId, canManage, sprints, onOpen, epicLookup,
}: {
  ticket: Ticket;
  projectId: string;
  canManage: boolean;
  sprints: Sprint[];
  onOpen: () => void;
  epicLookup?: Map<string, { name: string; color: string }>;
}) {
  const router = useRouter();
  const slug = useCurrentSlug() ?? '';
  const { mutate: updateTicket, isPending } = useUpdateTicket(projectId, ticket.id);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentEpic = ticket.parentKey ? epicLookup?.get(ticket.parentKey) : undefined;

  function handleClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      router.push(orgRoute(slug, `/projects/${projectId}/tickets/${ticket.key}`));
    } else {
      clickTimer.current = setTimeout(() => { clickTimer.current = null; onOpen(); }, 220);
    }
  }

  return (
    <div className="group flex items-center gap-3 rounded px-3 py-2 transition-colors hover:bg-surface">
      <div
        onClick={handleClick}
        className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
      >
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {TYPE_ICON[ticket.type]}
          {PRIORITY_ICON[ticket.priority]}
        </div>
        <span className="w-20 flex-shrink-0 text-xs text-text-placeholder font-mono">{ticket.key}</span>
        <span className="flex-1 text-sm text-text truncate">{ticket.title}</span>
        {parentEpic && <EpicTag name={parentEpic.name} color={parentEpic.color} />}
        <span className="flex-shrink-0 rounded bg-surface px-2 py-0.5 text-[11px] text-text-subtle">
          {STATUS_LABEL[ticket.status]}
        </span>
        {ticket.assignee ? (
          <div
            title={ticket.assignee.name}
            style={{ backgroundColor: memberColor(ticket.assignee.id) }}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
          >
            {ticket.assignee.initials}
          </div>
        ) : (
          <div className="h-6 w-6 flex-shrink-0 rounded-full border border-dashed border-text-placeholder bg-surface" />
        )}
      </div>

      {canManage && sprints.length > 0 && (
        <select
          disabled={isPending}
          defaultValue=""
          onChange={e => {
            if (e.target.value) updateTicket({ sprintId: e.target.value });
          }}
          onClick={e => e.stopPropagation()}
          className="flex-shrink-0 rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text-subtle outline-none transition-colors focus:border-primary disabled:opacity-50"
        >
          <option value="" disabled>Move to sprint…</option>
          {sprints.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} · {sprintDisplayStatus(s).label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function BacklogContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const highlightSprint = searchParams.get('sprint');
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [panelTicket, setPanelTicket] = useState<Ticket | null>(null);
  const [filterType,      setFilterType]      = useState<TypeFilter>('all');
  const [filterAssignees, setFilterAssignees] = useState<string[]>([]);
  const [filterPriority,  setFilterPriority]  = useState<PriorityFilter>('all');
  const { data: project, isLoading, error, refetch } = useProject(id);
  const user = useAuthStore(s => s.user);
  const role = useCurrentRole();

  if (isLoading) {
    return (
      <div className="flex flex-col">
        <div className="h-10 animate-pulse border-b border-border bg-surface-sunken" />
        <div className="px-4 sm:px-6 py-6">
          <div className="h-6 w-32 animate-pulse rounded bg-surface-sunken mb-5" />
          <div className="rounded-lg border border-border bg-surface-raised shadow-sm p-3 flex flex-col gap-1">
            {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return isNotFoundError(error)
      ? <PageNotFound title="Project not found" message="This project doesn't exist or you don't have access." />
      : <PageError message="Failed to load backlog" onRetry={refetch} />;
  }
  if (!project) return null;

  // Sprint + ticket management: owner / admin / project_manager (rbac.md).
  // 'owner' inherits all PM/admin powers.
  const canManage = role === 'owner' || role === 'admin' || role === 'project_manager';
  const hasActiveSprint = project.sprints.some(s => s.status === 'active' && isLiveSprint(s));
  // Create-ticket gate per docs/rbac.md §Ticket actions (mirrors backend).
  const canCreate =
    !project.archived && canCreateTicketInProject(project, user, role);
  const createBlocked = project.archived
    ? 'Project is archived'
    : createTicketBlockedReason(project, user, role);
  const backlogTickets = project.backlog ?? [];
  // Epic lookup across the project so rows can show their parent epic's tag.
  const epicLookup = buildEpicLookup([...project.sprints.flatMap(s => s.tickets), ...backlogTickets]);
  // Archived sprints live on the Archive page - filter them out of the
  // backlog view so an archived "g1" doesn't keep appearing as Planned.
  const liveSprints = project.sprints.filter(isLiveSprint);
  const totalCount  = liveSprints.reduce((sum, s) => sum + s.tickets.length, 0) + backlogTickets.length;

  // Active sprint first, then planned (by creation order), then completed
  const rank = (s: string) => s === 'active' ? 0 : s === 'planned' ? 1 : 2;
  const sortedSprints = [...liveSprints].sort((a, b) => rank(a.status) - rank(b.status));

  function isInitiallyOpen(sprint: Sprint): boolean {
    if (highlightSprint) return sprint.id === highlightSprint;
    const activeSprint = liveSprints.find(s => s.status === 'active');
    if (activeSprint) return sprint.id === activeSprint.id;
    return sprint.id === sortedSprints[0]?.id;
  }

  const isEmpty = liveSprints.length === 0 && backlogTickets.length === 0;

  return (
    <div className="flex flex-col">
      <ProjectSubNav
        project={project}
        onFilterChange={(type, assignees, priority) => { setFilterType(type); setFilterAssignees(assignees); setFilterPriority(priority); }}
      />

      <div className="px-4 sm:px-6 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-semibold text-text text-lg">Backlog</h2>
            <span className="text-sm text-text-placeholder">
              {totalCount} tickets · {project.sprints.length} sprints
            </span>
          </div>
          <button
            onClick={() => setShowCreateTicket(true)}
            disabled={!canCreate}
            title={canCreate ? 'Create a ticket' : createBlocked}
            className="flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary"
          >
            <Plus size={14} />
            Create ticket
          </button>
        </div>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <h2 className="text-base font-semibold text-text">No sprints or tickets yet</h2>
            <p className="mt-1.5 max-w-xs text-sm text-text-subtle">
              Create a sprint from the sidebar, then add tickets to get started.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
            <div className="px-3 py-1">
              {sortedSprints.map(sprint => (
                <SprintSection
                  key={sprint.id}
                  sprint={sprint}
                  initialOpen={isInitiallyOpen(sprint)}
                  projectId={id}
                  canManage={canManage}
                  hasActiveSprint={hasActiveSprint}
                  onOpenTicket={setPanelTicket}
                  onAddTicket={() => setShowCreateTicket(true)}
                  filterAssignees={filterAssignees}
                  filterType={filterType}
                  filterPriority={filterPriority}
                  canCreateTicket={canCreate}
                  epicLookup={epicLookup}
                />
              ))}
              <BacklogSection
                tickets={backlogTickets}
                projectId={id}
                canManage={canManage}
                sprints={project.sprints}
                onOpenTicket={setPanelTicket}
                onAddTicket={() => setShowCreateTicket(true)}
                filterAssignees={filterAssignees}
                filterType={filterType}
                filterPriority={filterPriority}
                canCreateTicket={canCreate}
                epicLookup={epicLookup}
              />
            </div>
          </div>
        )}

        {showCreateTicket && (
          <CreateTicketModal project={project} onClose={() => setShowCreateTicket(false)} />
        )}
      </div>

      {panelTicket && (
        <TicketPanel
          ticket={panelTicket}
          project={project}
          onClose={() => setPanelTicket(null)}
        />
      )}
    </div>
  );
}

export default function BacklogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  usePageView('BacklogPage', 'Backlog page opened', { projectId: id });
  return (
    <Suspense fallback={null}>
      <BacklogContent id={id} />
    </Suspense>
  );
}
