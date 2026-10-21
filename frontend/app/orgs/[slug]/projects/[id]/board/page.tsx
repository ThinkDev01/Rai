'use client';

import { useState, use, useEffect, useMemo, useRef } from 'react';
import { usePageView } from '@/lib/usePageView';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bug, BookOpen, CheckSquare, Zap,
  AlertCircle, ChevronUp, Minus, ChevronDown, ChevronsDown,
  Plus, Archive, ArrowUpLeft, GitBranch, GripVertical,
} from '@/lib/icons';
import { formatDate } from '@/lib/dates';
import { useProject } from '@/hooks/useProjects';
import { useMoveTicket } from '@/hooks/useTickets';
import { useAuthStore, useCurrentRole } from '@/store/auth.store';
import { canCreateTicketInProject, createTicketBlockedReason, memberColor } from '@/lib/project.utils';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { EpicTag } from '@/components/ticket/EpicTag';
import { buildEpicLookup } from '@/lib/ticket.meta';
import { ProjectSubNav, UNASSIGNED_FILTER, type TypeFilter, type PriorityFilter } from '@/components/shell/ProjectSubNav';
import { TicketPanel } from '@/components/shell/TicketPanel';
import { PageError } from '@/components/ui/PageError';
import { PageNotFound } from '@/components/ui/PageNotFound';
import { isNotFoundError } from '@/lib/errors';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import { MESSAGES } from '@/lib/messages';
import type { Ticket, TicketType, Priority, TicketStatus } from '@/types/api.types';

// ── Icon maps ─────────────────────────────────────────────────────────────────

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

type ColumnId = TicketStatus;
const COLUMN_IDS: ColumnId[] = ['todo', 'in_progress', 'in_review', 'done'];
type Columns = Record<ColumnId, Ticket[]>;

const COLUMN_META: Record<ColumnId, { label: string; dot: string; accent: string }> = {
  todo:        { label: 'To Do',       dot: 'bg-text-placeholder', accent: 'bg-text-placeholder' },
  in_progress: { label: 'In Progress', dot: 'bg-warning',          accent: 'bg-warning'          },
  in_review:   { label: 'In Review',   dot: 'bg-story',            accent: 'bg-story'            },
  done:        { label: 'Done',        dot: 'bg-success',          accent: 'bg-success'          },
};

// ── Card content (shared between live card + drag overlay) ────────────────────

function CardContent({ ticket, epicLookup }: { ticket: Ticket; epicLookup?: Map<string, { name: string; color: string }> }) {
  const childCount = ticket.subTicketKeys.length;
  const parentEpic = ticket.parentKey ? epicLookup?.get(ticket.parentKey) : undefined;
  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {TYPE_ICON[ticket.type]}
          <span className="text-[11px] text-text-placeholder">{ticket.key}</span>
          {/* Linked-ticket indicators - two visually distinct pills so it's
              obvious which one is the "I am a sub-ticket" vs "I AM a parent":
              - Sub-ticket: ↖ + parent's actual key (e.g. "↖ PROJ-1") -
                seeing the parent key inline removes ambiguity entirely.
              - Parent: tree icon + child count (e.g. "≡ 3") - the tree icon
                visually represents "has children" much more obviously than
                the previous Workflow icon. */}
          {/* Parent indicator: epic parent → colored epic tag (so you can spot
              the epic at a glance); any other parent → the plain key chip. */}
          {parentEpic ? (
            <EpicTag name={parentEpic.name} color={parentEpic.color} />
          ) : ticket.parentKey && (
            <span
              title={`Sub-ticket of ${ticket.parentKey}`}
              className="inline-flex items-center gap-0.5 rounded bg-text-subtle/10 px-1 py-0.5 text-[9px] font-mono font-semibold text-text-subtle"
            >
              <ArrowUpLeft size={9} />
              {ticket.parentKey}
            </span>
          )}
          {childCount > 0 && (
            <span
              title={`Has ${childCount} sub-ticket${childCount === 1 ? '' : 's'}`}
              className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-semibold text-primary"
            >
              <GitBranch size={9} />
              {childCount}
            </span>
          )}
        </div>
        {PRIORITY_ICON[ticket.priority]}
      </div>
      <p className="mb-3 text-sm font-medium leading-snug text-text line-clamp-2">
        {ticket.title}
      </p>
      <div className="flex items-center justify-end">
        {ticket.assignee ? (
          <div
            title={ticket.assignee.name}
            style={{ backgroundColor: memberColor(ticket.assignee.id) }}
            className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white"
          >
            {ticket.assignee.initials}
          </div>
        ) : (
          <div className="h-5 w-5 rounded-full border border-dashed border-text-placeholder bg-surface" />
        )}
      </div>
    </>
  );
}

// ── Draggable card ─────────────────────────────────────────────────────────────

function DraggableCard({ ticket, onOpen, onDoubleOpen, disabled = false, isCoarsePointer = false, epicLookup }: { ticket: Ticket; onOpen: () => void; onDoubleOpen: () => void; disabled?: boolean; isCoarsePointer?: boolean; epicLookup?: Map<string, { name: string; color: string }> }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    disabled,
  });
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick() {
    // Touch devices: synthesised click duplication from touch + pointer +
    // mouse-emulation made the 220ms double-click window mis-fire as a
    // "navigate to ticket page" trigger, so on coarse pointers we just open
    // the side panel on every tap. Full-page navigation is available from
    // the panel header for users who want it.
    if (isCoarsePointer) {
      onOpen();
      return;
    }
    if (clickTimer.current) {
      // Second click within 220ms → double-click, navigate
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onDoubleOpen();
    } else {
      // First click → wait to see if a second arrives
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onOpen();
      }, 220);
    }
  }

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  // On mobile (coarse pointer / touch) we split drag vs scroll:
  //   - A grip handle gets the dnd listeners + touch-action:none so drag activates
  //   - The card body uses touch-action:pan-x so horizontal row scroll still works
  // On desktop the whole card is draggable (mouse has no scroll conflict).
  const mobileHandle = isCoarsePointer && !disabled;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(mobileHandle ? {} : disabled ? {} : listeners)}
      onClick={handleClick}
      className={`relative rounded-lg border bg-surface-raised select-none transition-all duration-100
        w-64 flex-shrink-0 md:w-auto md:flex-shrink
        ${mobileHandle ? 'touch-pan-x' : ''}
        ${disabled
          ? 'cursor-default p-3'
          : mobileHandle
            ? 'cursor-default pl-8 pr-3 py-3'
            : 'cursor-grab active:cursor-grabbing touch-pan-y p-3'
        }
        ${isDragging
          ? 'border-primary/20 opacity-30 shadow-none'
          : 'border-border shadow-sm hover:border-primary/40 hover:shadow-md'
        }`}
    >
      {mobileHandle && (
        <span
          ref={setActivatorNodeRef}
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-7 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing text-text-placeholder"
        >
          <GripVertical size={14} />
        </span>
      )}
      <CardContent ticket={ticket} epicLookup={epicLookup} />
    </div>
  );
}

// ── Droppable column ──────────────────────────────────────────────────────────

function DroppableColumn({ colId, tickets, onOpen, onDoubleOpen, onAddTicket, isUser, currentUserId, canCreateTicket, createBlockedReason, isCoarsePointer, epicLookup }: {
  colId: ColumnId;
  tickets: Ticket[];
  onOpen: (ticket: Ticket) => void;
  onDoubleOpen: (ticket: Ticket) => void;
  onAddTicket: (status: ColumnId) => void;
  isUser: boolean;
  currentUserId: string;
  canCreateTicket: boolean;
  createBlockedReason: string;
  isCoarsePointer: boolean;
  epicLookup?: Map<string, { name: string; color: string }>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId });
  const meta = COLUMN_META[colId];

  return (
    <div className="group/col flex w-full flex-col md:w-auto md:flex-1 md:min-w-52">
      {/* Column header */}
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <div className={`h-3 w-1 flex-shrink-0 rounded-full ${meta.accent}`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
          {meta.label}
        </span>
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-medium text-text-placeholder">
          {tickets.length}
        </span>
      </div>

      {/* Column body - droppable. Mobile: cards lay out in a horizontal
          scroll row inside the column so a tall To-Do list doesn't push
          all other columns far below the fold; user still drags UP/DOWN
          to change status (dnd-kit's auto-scroll handles page scroll while
          dragging out of the row). Desktop: traditional vertical stack. */}
      <div
        ref={setNodeRef}
        className={`flex flex-row gap-2 overflow-x-auto rounded-xl border p-2.5 min-h-[100px] transition-colors duration-150
          md:flex-1 md:flex-col md:overflow-x-visible md:min-h-[200px]
          ${isOver
            ? 'border-primary/30 bg-primary-subtle'
            : 'border-surface-sunken bg-surface-sunken'
          }`}
      >
        {tickets.map(ticket => (
          <DraggableCard
            key={ticket.id}
            ticket={ticket}
            onOpen={() => onOpen(ticket)}
            onDoubleOpen={() => onDoubleOpen(ticket)}
            disabled={isUser && ticket.assignee?.id !== currentUserId && ticket.reporter.id !== currentUserId}
            isCoarsePointer={isCoarsePointer}
            epicLookup={epicLookup}
          />
        ))}

        {/* Add ticket - mobile: always visible at the end of the row (hover
            doesn't fire on touch); desktop: hidden until the column is
            hovered, matches v1 affordance. */}
        {canCreateTicket && (
          <button
            onClick={() => onAddTicket(colId)}
            className="flex flex-shrink-0 items-center gap-1.5 self-center whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-text-placeholder transition-opacity hover:bg-surface hover:text-text
              md:mt-1 md:self-auto md:opacity-0 md:group-hover/col:opacity-100"
          >
            <Plus size={12} />
            Add ticket
          </button>
        )}
        {!canCreateTicket && createBlockedReason && (
          <p className="flex-shrink-0 self-center whitespace-nowrap px-2 text-[10px] italic text-text-placeholder md:mt-1 md:self-auto md:whitespace-normal">
            {/* Render once per column so the reason is visible without hover. */}
            {createBlockedReason}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Board page ────────────────────────────────────────────────────────────────

export default function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  usePageView('BoardPage', 'Board page opened', { projectId: id });
  const router = useRouter();
  const slug   = useCurrentSlug() ?? '';
  const { data: project, isLoading, error, refetch } = useProject(id);
  const { mutate: moveTicket } = useMoveTicket(id);
  const user = useAuthStore(s => s.user);
  const role = useCurrentRole();

  // Coarse pointer = touch device. Disables the double-click-to-navigate
  // path on cards because synthesised click duplication from touch + mouse
  // emulation caused taps to register as double-clicks on mobile, sending
  // users to the full ticket page when they meant to open the side panel.
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsCoarsePointer(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsCoarsePointer(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // 'user' role (or no membership / role missing) = lowest tier, drag/drop
  // gated to tickets they assigned themselves or report. Owner/admin/PM are
  // not "isUser" so the gate doesn't apply.
  const isUser = role === 'user' || role === null;
  const currentUserId = String(user?.id ?? '');

  const sprint = project?.sprints.find(s => s.status === 'active');

  const [columns, setColumns] = useState<Columns>({
    todo: [], in_progress: [], in_review: [], done: [],
  });

  // Re-sync columns whenever the set of tickets or their statuses change.
  // Using a stable string key avoids re-running on every render while still
  // catching new tickets (create) and status changes (update from ticket page).
  const ticketsKey = sprint?.tickets.map(t => `${t.id}:${t.status}:${t.title}:${t.assignee?.id ?? ''}`).join(',') ?? '';
  useEffect(() => {
    if (sprint) {
      setColumns({
        todo:        sprint.tickets.filter(t => t.status === 'todo'),
        in_progress: sprint.tickets.filter(t => t.status === 'in_progress'),
        in_review:   sprint.tickets.filter(t => t.status === 'in_review'),
        done:        sprint.tickets.filter(t => t.status === 'done'),
      });
    }
  }, [ticketsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Epic lookup across the whole project (all sprints + backlog) so a card can
  // show its parent epic's colored tag. Built once per project load.
  const epicLookup = useMemo(
    () => buildEpicLookup(project ? [...project.sprints.flatMap(s => s.tickets), ...(project.backlog ?? [])] : []),
    [project],
  );

  const [activeTicket,   setActiveTicket]   = useState<Ticket | null>(null);
  const [panelTicket,    setPanelTicket]    = useState<Ticket | null>(null);
  const [createFor,      setCreateFor]      = useState<{ status: ColumnId; locked: boolean } | null>(null);
  const [filterType,      setFilterType]      = useState<TypeFilter>('all');
  const [filterAssignees, setFilterAssignees] = useState<string[]>([]);
  const [filterPriority,  setFilterPriority]  = useState<PriorityFilter>('all');

  const visibleColumns = useMemo(() => {
    const noFilter = filterType === 'all' && filterAssignees.length === 0 && filterPriority === 'all';
    if (noFilter) return columns;
    const apply = (tickets: Ticket[]) => tickets.filter(t => {
      if (filterAssignees.length > 0 && !filterAssignees.includes(t.assignee?.id ?? UNASSIGNED_FILTER)) return false;
      if (filterType !== 'all' && t.type !== (filterType as TicketType)) return false;
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      return true;
    });
    return { todo: apply(columns.todo), in_progress: apply(columns.in_progress), in_review: apply(columns.in_review), done: apply(columns.done) };
  }, [columns, filterType, filterAssignees, filterPriority]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    // Touch: long-press to activate (200ms is snappier than the default
    // 250ms while still distinguishing tap from drag). Tolerance bumped
    // to 10px - common finger drift before the long-press completes was
    // cancelling activation at the tighter 8px threshold.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 10 },
    })
  );

  function findColumn(ticketId: string): ColumnId | null {
    return COLUMN_IDS.find(col => columns[col].some(t => t.id === ticketId)) ?? null;
  }

  function handleDragStart({ active }: DragStartEvent) {
    const col = findColumn(active.id as string);
    if (col) {
      setActiveTicket(columns[col].find(t => t.id === active.id) ?? null);
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveTicket(null);
    if (!over) return;

    const sourceCol = findColumn(active.id as string);
    const targetCol = over.id as ColumnId;

    if (!sourceCol || !COLUMN_IDS.includes(targetCol) || sourceCol === targetCol) return;

    // Snapshot for rollback on API failure
    const prevColumns = columns;

    // Optimistic update - instant visual feedback
    setColumns(prev => {
      const ticket = prev[sourceCol].find(t => t.id === active.id)!;
      return {
        ...prev,
        [sourceCol]: prev[sourceCol].filter(t => t.id !== active.id),
        [targetCol]: [...prev[targetCol], { ...ticket, status: targetCol }],
      };
    });

    // Persist to backend - revert on failure
    moveTicket(
      { ticketId: active.id as string, status: targetCol },
      { onError: () => setColumns(prevColumns) },
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="h-10 animate-pulse border-b border-border bg-surface-sunken" />
        <div className="h-14 animate-pulse border-b border-border bg-surface-sunken" />
        <div className="flex flex-1 flex-col gap-4 p-6 md:flex-row">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 w-full animate-pulse rounded-xl bg-surface-sunken md:h-auto md:w-auto md:flex-1 md:min-w-52" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return isNotFoundError(error)
      ? <PageNotFound title="Project not found" message="This project doesn't exist or you don't have access." />
      : <PageError message="Failed to load board" onRetry={refetch} />;
  }
  if (!project) return null;

  // Create-ticket gate - mirrors backend rbac per docs/rbac.md.
  // Org-level owner/admin can always create; PM-in or PM-on-public can; users
  // must be project members. Archived projects are always read-only.
  const canCreate =
    !project.archived && canCreateTicketInProject(project, user, role);
  const createBlocked = project.archived
    ? 'Project is archived'
    : createTicketBlockedReason(project, user, role);

  if (!sprint) {
    const hasNoSprints = project.sprints.length === 0;
    const msg = project.archived
      ? MESSAGES.board.noActiveSprint_archived
      : hasNoSprints
        ? MESSAGES.board.noSprints
        : MESSAGES.board.noActiveSprint;

    return (
      <div className="flex flex-col">
        <ProjectSubNav project={project} />
        {project.archived && (
          <div className="mx-6 mt-4 flex items-center gap-2.5 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3 text-sm text-warning">
            <Archive size={15} className="flex-shrink-0" />
            <span>This project is archived and read-only.</span>
          </div>
        )}
        <div className="flex flex-col items-center justify-center py-24 text-center px-8">
          <Zap size={32} className="mb-3 text-border" />
          <h2 className="text-base font-semibold text-text">{msg.title}</h2>
          <p className="mt-1.5 max-w-xs text-sm text-text-subtle">{msg.description}</p>
          {!project.archived && 'cta' in msg && (
            <Link
              href={orgRoute(slug, `/projects/${id}/backlog`)}
              className="mt-5 rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              {msg.cta}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col">
        <ProjectSubNav
          project={project}
          onFilterChange={(type, assignees, priority) => { setFilterType(type); setFilterAssignees(assignees); setFilterPriority(priority); }}
        />

        {/* Board header */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h2 className="font-semibold text-text truncate">{sprint.name}</h2>
            <span className="flex-shrink-0 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
              Active
            </span>
            <span className="hidden sm:block text-xs text-text-placeholder whitespace-nowrap">
              {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
            </span>
          </div>
          <button
            onClick={() => setCreateFor({ status: 'todo', locked: false })}
            disabled={!canCreate}
            title={canCreate ? 'Create a ticket in this sprint' : createBlocked}
            className="flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary"
          >
            <Plus size={14} />
            Create ticket
          </button>
        </div>

        {/* Columns - horizontal kanban on desktop, vertical stack on mobile so
            cards drag up/down between status sections instead of left/right
            (way more usable in narrow viewports). dnd-kit is direction-
            agnostic so handleDragStart/handleDragEnd work for both layouts
            unchanged - we're just flipping the flex direction + scroll axis. */}
        <div className="flex-1 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden px-4 sm:px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:min-h-[400px] md:gap-5 md:min-w-[800px]">
            {COLUMN_IDS.map(colId => (
              <DroppableColumn
                key={colId}
                colId={colId}
                tickets={visibleColumns[colId]}
                onOpen={setPanelTicket}
                onDoubleOpen={ticket => router.push(orgRoute(slug, `/projects/${id}/tickets/${ticket.key}`))}
                onAddTicket={(status) => setCreateFor({ status, locked: false })}
                isUser={isUser}
                currentUserId={currentUserId}
                canCreateTicket={canCreate}
                createBlockedReason={createBlocked}
                isCoarsePointer={isCoarsePointer}
                epicLookup={epicLookup}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Drag overlay - ghost card while dragging. Width matches the live
          card width on each breakpoint (w-64 mobile, w-52 desktop) so the
          overlay sits cleanly over the source position. */}
      <DragOverlay dropAnimation={null}>
        {activeTicket ? (
          <div className="w-64 md:w-52 rounded-lg border border-primary/30 bg-surface-raised p-3 shadow-2xl rotate-[1.5deg] scale-[1.02] opacity-95 cursor-grabbing">
            <CardContent ticket={activeTicket} epicLookup={epicLookup} />
          </div>
        ) : null}
      </DragOverlay>

      {/* Modals & panel */}
      {createFor !== null && (
        <CreateTicketModal
          project={project}
          initialStatus={createFor.status}
          lockStatus={createFor.locked}
          onClose={() => setCreateFor(null)}
        />
      )}
      {panelTicket && (
        <TicketPanel
          ticket={panelTicket}
          project={project}
          onClose={() => setPanelTicket(null)}
        />
      )}
    </DndContext>
  );
}
