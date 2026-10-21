'use client';

import { use, useState, useEffect } from 'react';
import { usePageView } from '@/lib/usePageView';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Target, CheckCircle2,
  Bug, BookOpen, CheckSquare, Zap,
  AlertCircle, ChevronUp, Minus, ChevronDown, ChevronsDown,
  Archive, ArchiveRestore, ArrowUpRight, List, Pencil, X, Play, CheckCheck, Trash2,
} from '@/lib/icons';
import { useProject } from '@/hooks/useProjects';
import {
  useUpdateSprint, useStartSprint, useCompleteSprint, useDeleteSprint,
  useArchiveSprint, useUnarchiveSprint,
} from '@/hooks/useSprints';
import { useAuthStore, useCurrentRole } from '@/store/auth.store';
import { PageError } from '@/components/ui/PageError';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { PageNotFound } from '@/components/ui/PageNotFound';
import { isNotFoundError } from '@/lib/errors';
import { memberColor } from '@/lib/project.utils';
import { MESSAGES } from '@/lib/messages';
import { confirmModal } from '@/lib/confirmModal';
import { DatePicker } from '@/components/ui/DatePicker';
import { toast } from 'sonner';
import type { TicketType, Priority, TicketStatus, UpdateSprintPayload } from '@/types/api.types';
import { formatDate, toDateInputValue } from '@/lib/dates';
import { sprintDisplayStatus, SPRINT_PILL_BASE } from '@/lib/sprint.utils';
import { orgRoute, useCurrentSlug } from '@/lib/routes';

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

export default function SprintPage({ params }: { params: Promise<{ id: string; sprintId: string }> }) {
  const { id, sprintId } = use(params);
  usePageView('SprintPage', 'Sprint detail page opened', { projectId: id, sprintId });
  const router = useRouter();
  const slug   = useCurrentSlug() ?? '';
  const { data: project, isLoading, error, refetch } = useProject(id);
  const { mutate: updateSprint,    isPending: isSaving      } = useUpdateSprint(id, sprintId);
  const { mutate: startSprint,     isPending: isStarting    } = useStartSprint(id, sprintId);
  const { mutate: completeSprint,  isPending: isCompleting  } = useCompleteSprint(id, sprintId);
  const { mutate: deleteSprint,    isPending: isDeleting    } = useDeleteSprint(id, sprintId);
  const { mutate: archiveSprint,   isPending: isArchiving   } = useArchiveSprint(id, sprintId);
  const { mutate: unarchiveSprint, isPending: isUnarchiving } = useUnarchiveSprint(id, sprintId);
  const user = useAuthStore(s => s.user);
  const role = useCurrentRole();
  // Sprint actions per rbac.md: owner/admin always; PM with project access.
  // The "is sprint manager" gate is the role check; backend re-verifies
  // PM-on-private membership via loadProjectForCaller.
  const isAdminTier   = role === 'owner' || role === 'admin';
  const canManageSprint = isAdminTier || role === 'project_manager';
  const [confirmDelete,    setConfirmDelete]    = useState(false);
  const [confirmArchive,   setConfirmArchive]   = useState(false);
  const [confirmUnarchive, setConfirmUnarchive] = useState(false);

  // Ticket list show-more gate. Sprints with 100+ tickets shouldn't dump
  // every row on first paint — the user sees nothing useful past the fold.
  // Initial cut = 25 rows, batched expand 25 at a time. "Show less" resets.
  const TICKETS_INITIAL = 25;
  const TICKETS_BATCH   = 25;
  const [ticketsVisible, setTicketsVisible] = useState(TICKETS_INITIAL);

  const sprint = project?.sprints.find(s => s.id === sprintId);

  const [goal,      setGoal]      = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState('');
  // Editable sprint timings. <input type="date"> needs YYYY-MM-DD. The API
  // returns DATE columns as UTC timestamps, so we derive the value in IST via
  // toDateInputValue (a naive slice would pull the day back one under IST).
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd,   setDraftEnd]   = useState('');
  // Rename flow - separate from goal edits since changing the sprint name
  // affects how it shows up in reports, archive, search etc. Confirmation
  // dialog forces a deliberate intent (not just a stray click).
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  // Sync when sprint data loads
  useEffect(() => {
    if (sprint) {
      setGoal(sprint.goal ?? '');
    }
  }, [sprint?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex flex-col px-4 sm:px-6 py-6">
        <div className="mb-6">
          <div className="h-7 w-48 animate-pulse rounded bg-surface-sunken mb-2" />
          <div className="h-4 w-32 animate-pulse rounded bg-surface-sunken" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="col-span-1 lg:col-span-2 flex flex-col gap-5">
            <div className="h-32 animate-pulse rounded-lg bg-surface-sunken" />
            <div className="h-48 animate-pulse rounded-lg bg-surface-sunken" />
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-28 animate-pulse rounded-lg bg-surface-sunken" />
            <div className="h-40 animate-pulse rounded-lg bg-surface-sunken" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return isNotFoundError(error)
      ? <PageNotFound title="Project not found" message="This project doesn't exist or you don't have access." />
      : <PageError message="Failed to load sprint" onRetry={refetch} />;
  }
  if (!project) return null;

  if (!sprint) {
    return <PageNotFound title="Sprint not found" message="This sprint doesn't exist or was deleted." />;
  }

  const isPlanned   = sprint.status === 'planned';
  const isActive    = sprint.status === 'active';
  const isCompleted = sprint.status === 'completed';
  const isArchived  = Boolean(sprint.archivedAt);
  // Sprint manage: owner/admin/PM per rbac.md. Owner inherits all powers.
  const canManage   = role === 'owner' || role === 'admin' || role === 'project_manager';
  // Edits (goal, rename, dates, etc.) are blocked when:
  //   - sprint is completed (historical record locked)
  //   - sprint is archived  (read-only until unarchived)
  //   - caller lacks the role
  // Unarchive itself is always available via the bottom action row when
  // canManageSprint - that's how you bring an archived sprint back to
  // editable state.
  const canEdit     = !isCompleted && !isArchived && canManage;
  const hasActiveSprint = project.sprints.some(s => s.status === 'active');

  function startEdit() {
    setDraftGoal(goal);
    setDraftStart(toDateInputValue(sprint?.startDate));
    setDraftEnd(toDateInputValue(sprint?.endDate));
    setIsEditing(true);
  }
  function cancelEdit() {
    setIsEditing(false);
  }
  function saveEdit() {
    // YYYY-MM-DD compares correctly as a string, so this guards order cheaply.
    if (draftStart && draftEnd && draftEnd < draftStart) {
      toast.error('End date must be on or after the start date');
      return;
    }
    const payload: UpdateSprintPayload = { goal: draftGoal };
    if (draftStart) payload.startDate = draftStart;
    if (draftEnd)   payload.endDate   = draftEnd;
    updateSprint(payload, {
      onSuccess: () => {
        setGoal(draftGoal);
        setIsEditing(false);
      },
    });
  }

  const done        = sprint.tickets.filter(t => t.status === 'done').length;
  const total       = sprint.tickets.length;
  const pct         = total > 0 ? Math.round((done / total) * 100) : 0;

  const byStatus = {
    todo:        sprint.tickets.filter(t => t.status === 'todo'),
    in_progress: sprint.tickets.filter(t => t.status === 'in_progress'),
    in_review:   sprint.tickets.filter(t => t.status === 'in_review'),
    done:        sprint.tickets.filter(t => t.status === 'done'),
  };

  function openRename() {
    setRenameDraft(sprint!.name);
    setRenameOpen(true);
  }
  function submitRename() {
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === sprint!.name) { setRenameOpen(false); return; }
    updateSprint(
      { name: trimmed },
      { onSuccess: () => setRenameOpen(false) },
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 sm:px-6 py-6">

        {/* Archived banner - read-only signal at the very top so it's
            impossible to miss. Edits + status transitions are gated by
            canEdit which already accounts for archivedAt. */}
        {isArchived && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-text-placeholder/40 bg-surface-sunken px-4 py-3 text-sm">
            <div className="flex items-center gap-2.5 text-text-subtle">
              <Archive size={15} className="flex-shrink-0" />
              <span>This sprint is archived and read-only. Unarchive it below to edit.</span>
            </div>
          </div>
        )}

        {/* Sprint header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-xl font-bold text-text">{sprint.name}</h1>
              {(() => {
                const ds = sprintDisplayStatus(sprint);
                // Slightly larger than the list pill (px-2 py-0.5) to read
                // as a page header element, not a list-row indicator.
                return (
                  <span className={`${SPRINT_PILL_BASE} px-2 py-0.5 text-[10px] ${ds.pillCls}`}>
                    {ds.label}
                  </span>
                );
              })()}
              {/* Rename - small inline icon button next to the name. Always
                  uses a confirmation dialog (name is referenced in reports,
                  archive, search; stray edits would be annoying to undo). */}
              {canEdit && (
                <button
                  type="button"
                  onClick={openRename}
                  title="Rename sprint"
                  className="flex h-6 w-6 items-center justify-center rounded text-text-placeholder transition-colors hover:bg-surface hover:text-text"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
            <p className="text-sm text-text-placeholder">{formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}</p>
          </div>
          <div className="flex items-center gap-2">
            {isCompleted && (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 size={14} />
                Sprint completed
              </div>
            )}
            {canManage && isPlanned && !hasActiveSprint && (
              <button
                onClick={() => startSprint()}
                disabled={isStarting}
                className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:border-success hover:text-success disabled:opacity-50"
              >
                <Play size={12} />
                {isStarting ? 'Starting…' : 'Start sprint'}
              </button>
            )}
            {canManage && isActive && !isEditing && (
              <button
                onClick={async () => {
                  // Completing is irreversible: incomplete tickets drop back to
                  // the backlog and the sprint is frozen (no un-complete). Gate
                  // it behind an explicit confirm so a stray click can't end it.
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
                className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              >
                <CheckCheck size={12} />
                {isCompleting ? 'Completing…' : 'Complete sprint'}
              </button>
            )}
            {canEdit && !isEditing && (
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary"
              >
                <Pencil size={12} />
                Edit
              </button>
            )}
            {canEdit && isEditing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelEdit}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface disabled:opacity-50"
                >
                  <X size={12} />
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={isSaving}
                  className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left - goal + tickets */}
          <div className="col-span-1 lg:col-span-2 flex flex-col gap-5">

            {/* Goal */}
            <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
                <Target size={14} className="text-primary" />
                <p className="text-sm font-semibold text-text">Sprint Goal</p>
              </div>
              <div className="px-5 py-4">
                {isEditing ? (
                  <textarea
                    rows={10}
                    value={draftGoal}
                    onChange={e => setDraftGoal(e.target.value)}
                    placeholder="What is this sprint trying to achieve? Write a clear, focused goal…"
                    className="w-full resize-none rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-placeholder focus:border-primary focus:outline-none leading-relaxed"
                  />
                ) : goal ? (
                  <MarkdownRenderer content={goal} />
                ) : (
                  <p className="text-sm italic text-text-placeholder">
                    {canEdit ? 'No goal set - click Edit to add one.' : 'No goal was set for this sprint.'}
                  </p>
                )}
              </div>
            </div>

            {/* Tickets section */}
            {isCompleted ? (
              <div className="grid grid-cols-2 gap-4">
                <Link
                  href={orgRoute(slug, `/projects/${id}/backlog?sprint=${sprintId}`)}
                  className="group rounded-lg border border-border bg-surface-raised shadow-sm p-5 transition-colors hover:border-primary/40 hover:bg-surface"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <List size={15} className="text-text-subtle" />
                      <p className="text-sm font-semibold text-text">Backlogged</p>
                    </div>
                    <ArrowUpRight size={14} className="text-text-placeholder transition-colors group-hover:text-primary" />
                  </div>
                  <p className="text-3xl font-bold text-text">
                    {sprint.tickets.filter(t => t.status !== 'done').length}
                  </p>
                  <p className="mt-1 text-xs text-text-placeholder">
                    Incomplete tickets returned to backlog
                  </p>
                </Link>

                <Link
                  href={orgRoute(slug, `/projects/${id}/archive`)}
                  className="group rounded-lg border border-border bg-surface-raised shadow-sm p-5 transition-colors hover:border-success/40 hover:bg-success-subtle/20"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Archive size={15} className="text-success" />
                      <p className="text-sm font-semibold text-text">Archived</p>
                    </div>
                    <ArrowUpRight size={14} className="text-text-placeholder transition-colors group-hover:text-success" />
                  </div>
                  <p className="text-3xl font-bold text-success">
                    {sprint.tickets.filter(t => t.status === 'done').length}
                  </p>
                  <p className="mt-1 text-xs text-text-placeholder">
                    Completed tickets archived with this sprint
                  </p>
                </Link>
              </div>
            ) : (
            <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-hidden">
              <div className="border-b border-border px-5 py-3.5">
                <p className="text-sm font-semibold text-text">Tickets ({total})</p>
              </div>
              {total === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                  <p className="text-sm font-semibold text-text">{MESSAGES.sprint.noTickets.title}</p>
                  <p className="mt-1 text-sm text-text-placeholder">{MESSAGES.sprint.noTickets.description}</p>
                </div>
              ) : (() => {
                const visibleTickets = sprint.tickets.slice(0, ticketsVisible);
                const remaining      = sprint.tickets.length - visibleTickets.length;
                const nextBatch      = Math.min(TICKETS_BATCH, remaining);
                const expandedPastInitial = ticketsVisible > TICKETS_INITIAL;
                return (
                  <>
                    <div className="divide-y divide-border">
                      {visibleTickets.map(ticket => {
                        const sm = STATUS_META[ticket.status];
                        return (
                          <div key={ticket.id} className="flex items-center gap-3 px-5 py-2.5">
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {TYPE_ICON[ticket.type]}
                              {PRIORITY_ICON[ticket.priority]}
                            </div>
                            <span className="w-20 flex-shrink-0 font-mono text-xs text-text-placeholder">{ticket.key}</span>
                            <span className="flex-1 truncate text-sm text-text">{ticket.title}</span>
                            <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${sm.cls}`}>
                              {sm.label}
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
                      })}
                    </div>

                    {/* Show-more footer. Mirrors the sprint-history pattern
                        on the overview page (batched expand + show-less
                        reset) so users see one consistent affordance for
                        long lists across the app. */}
                    {(remaining > 0 || expandedPastInitial) && (
                      <div className="flex items-center gap-2 border-t border-border px-5 py-2.5">
                        {remaining > 0 && (
                          <button
                            onClick={() => setTicketsVisible(v => v + TICKETS_BATCH)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
                          >
                            <ChevronDown size={11} />
                            Show {nextBatch} more
                            <span className="ml-1 text-text-placeholder/60">({remaining} left)</span>
                          </button>
                        )}
                        {expandedPastInitial && (
                          <button
                            onClick={() => setTicketsVisible(TICKETS_INITIAL)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-text-subtle"
                          >
                            <ChevronUp size={11} />
                            Show less
                          </button>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            )}

          </div>

          {/* Right - progress + breakdown */}
          <div className="flex flex-col gap-4">

            {/* Progress */}
            <div className="rounded-lg border border-border bg-surface-raised shadow-sm p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-text-placeholder">Progress</p>
              <div className="mb-3 flex items-end justify-between">
                <span className="text-3xl font-bold text-text">{pct}%</span>
                <span className="text-sm text-text-placeholder">{done}/{total} done</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className={`h-full rounded-full ${isCompleted ? 'bg-success' : 'bg-primary'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Status breakdown */}
            <div className="rounded-lg border border-border bg-surface-raised shadow-sm p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-text-placeholder">By Status</p>
              <div className="flex flex-col gap-2.5">
                {([
                  { label: 'To Do',       count: byStatus.todo.length,        cls: 'bg-text-placeholder' },
                  { label: 'In Progress', count: byStatus.in_progress.length, cls: 'bg-warning'          },
                  { label: 'In Review',   count: byStatus.in_review.length,   cls: 'bg-info'             },
                  { label: 'Done',        count: byStatus.done.length,        cls: 'bg-success'          },
                ] as const).map(({ label, count, cls }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <div className={`h-2 w-2 flex-shrink-0 rounded-full ${cls}`} />
                    <span className="flex-1 text-sm text-text-subtle">{label}</span>
                    <span className="text-sm font-semibold text-text">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sprint meta */}
            <div className="rounded-lg border border-border bg-surface-raised shadow-sm p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-text-placeholder">Details</p>
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-placeholder mb-0.5">Start</p>
                  {isEditing ? (
                    <DatePicker
                      value={draftStart}
                      onChange={setDraftStart}
                      max={draftEnd || undefined}
                      placeholder="Pick start"
                    />
                  ) : (
                    <p className="text-text">{formatDate(sprint.startDate)}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-placeholder mb-0.5">End</p>
                  {isEditing ? (
                    <DatePicker
                      value={draftEnd}
                      onChange={setDraftEnd}
                      min={draftStart || undefined}
                      placeholder="Pick end"
                    />
                  ) : (
                    <p className="text-text">{formatDate(sprint.endDate)}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-placeholder mb-0.5">Project</p>
                  <p className="text-text">{project.name}</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Sprint actions - Archive + Delete sit side-by-side. Per rbac.md
            §Sprint actions:
              - Archive / Unarchive → owner / admin / PM (canManageSprint)
              - Delete sprint       → same set, BUT backend limits to status='planned'
            Active sprints cannot be archived in-place - finish them first.
            Already-completed sprints can still be archived (move to Archive page). */}
        {canManageSprint && (
          <div className="mt-8 border-t border-border pt-6 flex flex-wrap items-center gap-3">
            {/* Archive / Unarchive - toggles on archivedAt presence.
                Both directions get an inline confirm card (matches the
                Archive/Delete pattern below). Unarchive changes persistent
                state and pulls the sprint back into the active list - never
                fire from a single click. */}
            {sprint.archivedAt ? (
              !confirmUnarchive ? (
                <button
                  onClick={() => setConfirmUnarchive(true)}
                  className="flex items-center gap-2 rounded border border-success/40 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/10"
                >
                  <ArchiveRestore size={13} />
                  Unarchive sprint
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-text-subtle">Move this sprint back to the active list?</p>
                  <button
                    onClick={() => unarchiveSprint(undefined, { onSuccess: () => setConfirmUnarchive(false) })}
                    disabled={isUnarchiving}
                    className="rounded bg-success px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-60"
                  >
                    {isUnarchiving ? 'Unarchiving…' : 'Confirm unarchive'}
                  </button>
                  <button
                    onClick={() => setConfirmUnarchive(false)}
                    className="rounded border border-border px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface"
                  >
                    Cancel
                  </button>
                </div>
              )
            ) : (
              !confirmArchive ? (
                <button
                  onClick={() => setConfirmArchive(true)}
                  disabled={sprint.status === 'active'}
                  title={sprint.status === 'active' ? 'Complete the sprint first - active sprints cannot be archived in-place' : 'Move this sprint to the Archive page'}
                  className="flex items-center gap-2 rounded border border-warning/40 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Archive size={13} />
                  Archive sprint
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-text-subtle">Move this sprint to the Archive page?</p>
                  <button
                    onClick={() => archiveSprint(undefined, { onSuccess: () => setConfirmArchive(false) })}
                    disabled={isArchiving}
                    className="rounded bg-warning px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-warning/90 disabled:opacity-60"
                  >
                    {isArchiving ? 'Archiving…' : 'Confirm archive'}
                  </button>
                  <button
                    onClick={() => setConfirmArchive(false)}
                    className="rounded border border-border px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface"
                  >
                    Cancel
                  </button>
                </div>
              )
            )}

            {/* Delete sprint - owner/admin only (rbac.md note ⁷); backend blocks non-planned. */}
            {isAdminTier && !isCompleted && (
              !confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 rounded border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  <Trash2 size={13} />
                  Delete sprint
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-text-subtle">Are you sure? Tickets will return to backlog.</p>
                  <button
                    onClick={() => deleteSprint(undefined, { onSuccess: () => router.replace(orgRoute(slug, `/projects/${id}/backlog`)) })}
                    disabled={isDeleting}
                    className="rounded bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-60"
                  >
                    {isDeleting ? 'Deleting…' : 'Confirm delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded border border-border px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface"
                  >
                    Cancel
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Rename sprint - confirmation modal. Stricter than the inline goal
          edit because the name flows into reports, archive, search, and
          ticket-context UI; stray edits are annoying. */}
      {renameOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={e => { if (e.target === e.currentTarget && !isSaving) setRenameOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface-raised shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-text">
                <Pencil size={14} />
                Rename sprint
              </h2>
              <button
                onClick={() => setRenameOpen(false)}
                disabled={isSaving}
                className="rounded p-1 text-text-placeholder hover:bg-surface hover:text-text disabled:opacity-50"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-5 py-5">
              <div className="rounded border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-text-subtle">
                The new name will appear in reports, the sidebar, search, and any links that reference this sprint. Tickets keep their existing keys.
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="sprint-rename" className="text-xs font-medium text-text-subtle">New sprint name</label>
                <input
                  id="sprint-rename"
                  autoFocus
                  type="text"
                  value={renameDraft}
                  onChange={e => setRenameDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitRename(); }}
                  placeholder={sprint.name}
                  disabled={isSaving}
                  className="rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none focus:border-primary disabled:opacity-50"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameOpen(false)}
                  disabled={isSaving}
                  className="rounded border border-border px-4 py-2 text-sm font-medium text-text-subtle transition-colors hover:bg-surface disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitRename}
                  disabled={isSaving || !renameDraft.trim() || renameDraft.trim() === sprint.name}
                  className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? 'Renaming…' : 'Rename sprint'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
