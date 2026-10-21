'use client';

import { use, useEffect, useRef, useState } from 'react';
import { usePageView } from '@/lib/usePageView';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ChevronLeft, User, Calendar, RefreshCw, Plus, Upload,
  MessageSquare, Link2, Pencil, Trash2, X, Check, Copy,
} from '@/lib/icons';
import { useProject } from '@/hooks/useProjects';
import { useTicket, useUpdateTicket, useDeleteTicket, useDeleteAttachment } from '@/hooks/useTickets';
import { useAuthStore, useCurrentRole } from '@/store/auth.store';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { CommentThread } from '@/components/comments/CommentThread';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { PageError } from '@/components/ui/PageError';
import { PageNotFound } from '@/components/ui/PageNotFound';
import { RichSelect } from '@/components/ui/RichSelect';
import { confirmModal } from '@/lib/confirmModal';
import { isNotFoundError } from '@/lib/errors';
import { formatDateTime } from '@/lib/dates';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import { canCreateTicketInProject, memberColor } from '@/lib/project.utils';
import {
  TYPE_META, PRIORITY_META, STATUS_META,
  STATUS_OPTIONS, PRIORITY_OPTIONS, TYPE_OPTIONS,
  buildAssigneeOptions, buildSprintOptions, buildParentOptions,
} from '@/lib/ticket.meta';
import { TicketDetailsCard } from '@/components/ticket/TicketDetailsCard';
import { EpicProgress } from '@/components/ticket/EpicProgress';
import { EpicTag } from '@/components/ticket/EpicTag';
import { PersistedAttachmentList } from '@/components/attachments/PersistedAttachmentList';
import { AttachmentList } from '@/components/attachments/AttachmentList';
import { useAttachments } from '@/hooks/useAttachments';
import { TICKET_ATTACHMENT_LIMITS } from '@/lib/uploads';
import type { Attachment, AttachmentInput, UpdateTicketPayload, TicketType, Priority, TicketStatus } from '@/types/api.types';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TicketDetailPage({ params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = use(params);
  usePageView('TicketDetailPage', 'Ticket detail page opened', { projectId: id, ticketKey: key });
  const router = useRouter();
  const slug   = useCurrentSlug() ?? '';
  const user   = useAuthStore(s => s.user);
  const role   = useCurrentRole();

  const { data: project, isLoading, error, refetch } = useProject(id);
  const { data: fullTicket } = useTicket(id, key);

  const [editingTitle, setEditingTitle]   = useState(false);
  const [titleDraft,   setTitleDraft]     = useState('');
  const [editingDesc,  setEditingDesc]    = useState(false);
  const [descDraft,    setDescDraft]      = useState('');
  // Comment compose/reply/edit/show-more state now lives inside
  // <CommentThread>; the page only forwards the `?expand=comments` deep-link
  // (sent by the TicketPanel's "view all comments" overflow) so the full-page
  // thread mounts already-expanded.
  const searchParams = useSearchParams();
  const expandComments = searchParams?.get('expand') === 'comments';

  const [editingParent, setEditingParent] = useState(false);
  const [showCreateSub, setShowCreateSub] = useState(false);
  const [linkMenuOpen, setLinkMenuOpen]   = useState(false);
  const linkMenuRef = useRef<HTMLDivElement>(null);

  // Attachment edit mode — same pending-file picker as the create modal, so
  // "add" behavior is identical. Deletes hit the backend directly; adds are
  // staged until Save calls useUpdateTicket with the confirmed keys.
  const [editingAttachments, setEditingAttachments] = useState(false);
  const [savingAttachments,  setSavingAttachments]  = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  // A delete during an edit session persists immediately (backend DELETE), but
  // the Save button must still enable so the user can finish/close the editor
  // after removing a file (Save is normally gated on staged NEW files).
  const [deletedInEdit, setDeletedInEdit] = useState(false);
  // Dedupe new picks against files already attached to the ticket while
  // editing — the picker skips a file whose name+size matches an existing one.
  // (fullTicket may still be undefined on the first render; useAttachments
  // treats a missing list as "no existing attachments".)
  const attEditor = useAttachments(TICKET_ATTACHMENT_LIMITS, fullTicket?.attachments ?? []);

  useEffect(() => {
    if (!linkMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (linkMenuRef.current && !linkMenuRef.current.contains(e.target as Node)) {
        setLinkMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [linkMenuOpen]);

  // Derive ticket + ticketId BEFORE the mutation hooks. The previous
  // version did this AFTER an `if (isLoading) return` early-return, so on
  // the first (loading) render none of the mutation hooks ran, and on the
  // second (data-loaded) render they all ran for the first time - React's
  // Rules of Hooks rightly rejected the mismatch. Fix: derive a stable
  // `ticketId` (falls back to '' while loading) and call every hook
  // unconditionally above the early returns. The mutations only fire on
  // user interaction, by which point ticket is loaded and id is real.
  const allTickets = project
    ? [...project.sprints.flatMap(s => s.tickets), ...(project.backlog ?? [])]
    : [];
  const ticket   = allTickets.find(t => t.key === key);
  const ticketId = ticket?.id ?? '';

  const { mutate: updateTicket, isPending: isUpdating }   = useUpdateTicket(id, ticketId);
  const { mutate: deleteTicket, isPending: isDeleting }   = useDeleteTicket(id);
  const { mutate: deleteAttachment } = useDeleteAttachment(id);

  // ── Loading / error / not-found states (hooks are all above this point) ──

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="h-11 flex-shrink-0 animate-pulse border-b border-border bg-surface-sunken" />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 sm:px-8 py-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3 flex flex-col gap-5">
                <div className="h-10 w-2/3 animate-pulse rounded-md bg-surface-sunken" />
                <div className="h-32 w-full animate-pulse rounded-xl bg-surface-sunken" />
                <div className="h-4 w-full animate-pulse rounded bg-surface-sunken" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-surface-sunken" />
              </div>
              <div className="lg:col-span-2 flex flex-col gap-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 w-full animate-pulse rounded bg-surface-sunken" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return isNotFoundError(error)
      ? <PageNotFound title="Project not found" message="This project doesn't exist or you don't have access." />
      : <PageError message="Failed to load ticket" onRetry={refetch} />;
  }

  if (!project) return null;
  if (!ticket) {
    return <PageNotFound title="Ticket not found" message={`Ticket ${key} doesn't exist or was deleted.`} />;
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const comments      = fullTicket?.comments ?? [];
  const ticketAttachments = fullTicket?.attachments ?? [];

  // Two distinct permission gates per docs/rbac.md §Ticket actions:
  //
  //   canEditTicket - status, assignee, reporter, type, priority, title,
  //   description: reporter + assignee + PM-in-project + admin + owner.
  //   "Operational rights" - the person doing the work can move it along.
  //
  //   canManageProjectTicket - sprint assignment + delete: PM + admin + owner
  //   only. Reporter/assignee cannot delete tickets (closing via status='done'
  //   is their path); sprint changes are project-management scope.
  //
  // Owner inherits all admin powers. This page's gates must match (a) the
  // board's drag-and-drop gate which already enforces "operational rights"
  // for status moves, and (b) backend enforcement. Previously this page had
  // a single `canManage` = owner/admin/PM, which incorrectly let any other
  // project member change status (no gate at all) but blocked reporter +
  // assignee from doing their own work via the detail page.
  const isReporter = ticket.reporter.id === user?.id;
  const isAssignee = ticket.assignee?.id === user?.id;
  const isAdminTier = role === 'owner' || role === 'admin' || role === 'project_manager';
  const canEditTicket            = isAdminTier || isReporter || isAssignee;
  const canManageProjectTicket   = isAdminTier;
  // Linked-tickets perms are split: changing the current ticket's parent
  // is an "edit" (operational rights); creating a sub-ticket is just
  // "create a ticket in this project" with a parent prefill, so any
  // project member who can create tickets can do it.
  const canLinkParent            = canEditTicket;
  const canAddSubTicket          = canCreateTicketInProject(project, user, role);

  const typeMeta      = TYPE_META[ticket.type];
  const statusMeta    = STATUS_META[ticket.status];
  const sprint        = project.sprints.find(s => s.tickets.some(t => t.key === ticket.key));
  const subTickets    = sprint?.tickets.filter(t => ticket.subTicketKeys.includes(t.key)) ?? [];
  const parentTicket  = ticket.parentKey ? allTickets.find(t => t.key === ticket.parentKey) : null;
  const activeSprints = project.sprints.filter(s => s.status !== 'completed');

  // ── Handlers ───────────────────────────────────────────────────────────────

  function saveTitle() {
    const trimmed = titleDraft.trim();
    // Min 2 chars (matches createTicketHandler + search 2-char floor).
    // Reject silently with a toast and keep edit mode open so the user
    // can fix the value — closing on the failed save would lose their input.
    if (trimmed.length > 0 && trimmed.length < 2) {
      toast.error('Title must be at least 2 characters');
      return;
    }
    if (trimmed && trimmed !== ticket!.title) updateTicket({ title: trimmed });
    setEditingTitle(false);
  }

  // Save the description (and any screenshot pasted into it, Teams-style).
  // A Ctrl+V'd image lands in attEditor.pending via onPaste — when the user
  // saves, presign+PUT those files and link the keys in the same PATCH. Stay
  // in edit mode on upload failure so nothing staged is silently dropped.
  async function saveDesc() {
    const trimmed = descDraft.trim();
    const payload: UpdateTicketPayload = {};
    if (trimmed !== (ticket!.description ?? '')) payload.description = trimmed || undefined;
    if (attEditor.pending.length > 0) {
      const keys = await attEditor.upload('ticket', ticketId);
      if (!keys) return;
      if (keys.length > 0) payload.attachments = keys;
    }
    if (Object.keys(payload).length === 0) {
      setEditingDesc(false);
      return;
    }
    updateTicket(payload, {
      onSuccess: () => {
        setEditingDesc(false);
        attEditor.clear();
      },
    });
  }

  // Delete is a hard-destructive action (per [[feedback_confirm_before_sensitive_action]]).
  // The visual treatment is intentionally minimal now (no boxed "Danger zone"
  // section) so the confirm modal IS the safety surface instead of the card.
  // Quick-copy the ticket key. Devs commonly use the key as their git
  // branch name (`feature/PROJ-12-fix-foo`), so making it one-click
  // copyable from the sticky header beats selecting + copying the badge.
  async function copyTicketKey() {
    if (!ticket) return;
    try {
      await navigator.clipboard.writeText(ticket.key);
      toast.success(`Copied ${ticket.key}`);
    } catch {
      toast.error('Failed to copy ticket key');
    }
  }

  async function confirmDelete() {
    const ok = await confirmModal({
      title:        `Delete ${ticket!.key}?`,
      description:  `Permanently delete this ticket and all its comments. This cannot be undone.`,
      confirmLabel: 'Delete ticket',
      variant:      'danger',
    });
    if (!ok) return;
    deleteTicket(ticket!.id, { onSuccess: () => router.back() });
  }

  // ── Attachment editing ─────────────────────────────────────────────────────
  // Delete is destructive (removes the S3 object + DB row) — confirm first.
  // Busy state lives on a single id so only the in-flight tile shows the
  // spinner/dimmed X.
  async function handleDeleteAttachment(a: Attachment) {
    if (deletingAttachmentId) return;
    const ok = await confirmModal({
      title:        'Delete attachment',
      description:  `Permanently delete "${a.name}" from this ticket? This cannot be undone.`,
      confirmLabel: 'Yes, delete',
      cancelLabel:  'No',
      variant:      'danger',
    });
    if (!ok) return;
    setDeletedInEdit(true);
    setDeletingAttachmentId(a.id);
    deleteAttachment(a.id, {
      onSettled: () => setDeletingAttachmentId(null),
    });
  }

  // Save staged adds: presign + PUT each pending file, then link the returned
  // keys to the ticket in the same PATCH (backend confirms the rows). Stay in
  // edit mode on failure so nothing the user staged is silently dropped.
  async function saveAttachments() {
    if (attEditor.pending.length === 0) {
      setEditingAttachments(false);
      return;
    }
    const keys = await attEditor.upload('ticket', ticketId);
    if (!keys) return;
    setSavingAttachments(true);
    updateTicket({ attachments: keys }, {
      onSuccess: () => {
        setSavingAttachments(false);
        setEditingAttachments(false);
        setDeletedInEdit(false);
        attEditor.clear();
      },
      onError: () => setSavingAttachments(false),
    });
  }

  function cancelAttachmentEdit() {
    setEditingAttachments(false);
    setDeletedInEdit(false);
    attEditor.clear();
  }

  const attachmentBusy = savingAttachments || attEditor.isUploading || deletingAttachmentId !== null;

  // Per-property RichSelect option lists. Static ones (status/priority/type)
  // come from the shared meta module; dynamic ones (assignee/sprint/parent)
  // are built per-render from the loaded project's members + sprints +
  // tickets. Parent options exclude the current ticket so you can't make a
  // ticket its own parent.
  const assigneeOptions = buildAssigneeOptions(project.members);
  const sprintOptions   = buildSprintOptions(activeSprints);
  const parentOptions   = buildParentOptions(allTickets.filter(t => t.id !== ticket.id));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">

      {/* ── Header bar: breadcrumb + status pill (sticky to top of scroll).
          Full-width container now (max-w-7xl) so it aligns with the wider
          two-column body underneath. */}
      <div className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 sm:px-8 py-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs text-text-placeholder transition-colors hover:text-text-subtle"
          >
            <ChevronLeft size={14} />
            Back
          </button>
          <span className="text-text-placeholder text-[11px]">·</span>
          <Link
            href={orgRoute(slug, `/projects/${id}/board`)}
            className="max-w-[160px] truncate text-xs text-text-placeholder transition-colors hover:text-text-subtle"
          >
            {project.name}
          </Link>
          {parentTicket && (
            <>
              <span className="text-text-placeholder text-[11px]">·</span>
              <Link href={orgRoute(slug, `/projects/${id}/tickets/${parentTicket.key}`)} className="text-xs text-text-link hover:underline">
                {parentTicket.key}
              </Link>
            </>
          )}
          <span className="text-text-placeholder text-[11px]">·</span>
          {/* Type + key badge - key doubles as a quick-copy button. The
              key + Copy icon are inside the same chip so the affordance
              reads as "this is your ticket id, click to copy". */}
          <button
            onClick={copyTicketKey}
            title={`Copy ${ticket.key}`}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors hover:brightness-95 ${typeMeta.cls}`}
          >
            {typeMeta.icon}
            {ticket.key}
            <Copy size={11} className="opacity-60" />
          </button>
          {/* Status pill - colored dot + accent text/border only (no flood bg) */}
          <span className={`ml-auto inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
        </div>
      </div>

      {/* ── Body: Jira-style two-column 70/30 split ──
          LEFT  (7 cols / 70%): title, description, parent + sub-tickets,
                                 labeled metadata block (Reporter / Created /
                                 Updated) ABOVE comments, then activity,
                                 then minimal delete row.
          RIGHT (3 cols / 30%): sticky Details panel - status, assignee,
                                 priority, type, sprint - each with a real
                                 visual (dot/avatar/icon/pill) per option. */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 py-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-10 lg:gap-8">

            {/* ── LEFT column (main content) ───────────────────────────── */}
            <article className="lg:col-span-7 flex flex-col gap-5 min-w-0">

              {/* Title - click-to-edit gated by canEditTicket */}
              <div>
                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onFocus={e => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }}
                    onBlur={saveTitle}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
                      if (e.key === 'Escape') setEditingTitle(false);
                    }}
                    className="w-full rounded-md border border-primary bg-surface-raised px-3 py-2 text-2xl font-semibold text-text outline-none leading-snug"
                  />
                ) : canEditTicket ? (
                  <h1
                    onClick={() => { setTitleDraft(ticket.title); setEditingTitle(true); }}
                    className="text-2xl font-semibold text-text leading-snug cursor-text hover:bg-surface-raised rounded-md px-2 -mx-2 py-1 transition-colors"
                  >
                    {ticket.title}
                  </h1>
                ) : (
                  <h1 className="text-2xl font-semibold text-text leading-snug px-2 -mx-2">
                    {ticket.title}
                  </h1>
                )}
              </div>

              {/* Description card - fully opaque so it reads as the main
                  content panel (vs the metadata strip below, which uses a
                  subtle surface bg to feel like reference info). */}
              <section className="group rounded-lg border border-border bg-surface-raised p-4 sm:p-5">
                <div className="mb-2.5 flex items-center gap-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
                    Description
                  </h3>
                  {!editingDesc && canEditTicket && (
                    <button
                      onClick={() => { setDescDraft(ticket.description ?? ''); setEditingDesc(true); }}
                      className="rounded p-0.5 text-text-placeholder opacity-0 transition-opacity hover:text-text group-hover:opacity-100 focus:opacity-100"
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                </div>

                {editingDesc ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      autoFocus
                      rows={10}
                      value={descDraft}
                      onChange={e => setDescDraft(e.target.value)}
                      onFocus={e => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }}
                      onPaste={attEditor.handlePaste}
                      placeholder="Add a description…"
                      className="w-full resize-none rounded border border-primary bg-surface-raised px-3 py-2 text-sm text-text outline-none placeholder:text-text-placeholder leading-relaxed"
                    />
                    {/* Paste-to-attach hint — a screenshot pasted here (Ctrl+V)
                        is added as a ticket attachment, not embedded in the
                        description text. */}
                    <p className="text-[11px] text-text-placeholder">
                      Tip: paste a screenshot (Ctrl+V) into the description to add it as a ticket attachment.
                    </p>
                    {/* Paste-to-attach — a screenshot pasted into the box lands
                        here as a pending file and links when Save runs. Picker
                        hidden: Ctrl+V is the only entry point (no "Attach
                        files" button). */}
                    <AttachmentList
                      pending={attEditor.pending}
                      limits={TICKET_ATTACHMENT_LIMITS}
                      onAdd={attEditor.addFiles}
                      onRemove={attEditor.remove}
                      disabled={isUpdating || attEditor.isUploading}
                      compact
                      noPicker
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveDesc}
                        disabled={isUpdating || attEditor.isUploading}
                        className="flex items-center gap-1.5 rounded bg-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                      >
                        {attEditor.isUploading ? <><Upload size={12} /> Uploading…</> : <><Check size={12} /> Save</>}
                      </button>
                      <button
                        onClick={() => setEditingDesc(false)}
                        className="flex items-center gap-1.5 rounded border border-border px-3 py-1 text-xs font-medium text-text-subtle transition-colors hover:bg-surface"
                      >
                        <X size={11} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : ticket.description ? (
                  // Read-only text — no click-to-edit here so users can
                  // select/copy normally. Editing is entered only via the
                  // Edit (pencil) button above.
                  <MarkdownRenderer content={ticket.description} />
                ) : canEditTicket ? (
                  <p
                    onClick={() => { setDescDraft(''); setEditingDesc(true); }}
                    className="cursor-text text-sm italic text-text-placeholder hover:text-text-subtle transition-colors"
                  >
                    No description - click to add one.
                  </p>
                ) : (
                  <p className="text-sm italic text-text-placeholder">
                    No description.
                  </p>
                )}
              </section>

              {/* Type-specific fields (Epic/Story/Bug) - nothing for Task */}
              <TicketDetailsCard
                ticket={ticket}
                canEdit={canEditTicket}
                isSaving={isUpdating}
                onSave={(payload) => updateTicket(payload)}
              />

              {/* Linked tickets - combined parent + children in ONE
                  compact section. Empty state collapses to a single
                  one-liner (label + [+ Link ticket] menu). The menu asks
                  which direction: parent (link THIS as a child of another)
                  vs sub-ticket (create a new child here). Both lists
                  render only when they actually have content - no wasted
                  rows of "No parent / No children" placeholders. */}
              {(parentTicket || subTickets.length > 0 || canLinkParent || canAddSubTicket) && (
                <section>
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
                      Linked tickets
                    </h3>
                    {(canLinkParent || canAddSubTicket) && (
                      <div ref={linkMenuRef} className="relative">
                        <button
                          onClick={() => setLinkMenuOpen(v => !v)}
                          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-placeholder transition-colors hover:bg-surface hover:text-text"
                        >
                          <Plus size={11} />
                          Link ticket
                        </button>
                        {linkMenuOpen && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-md border border-border bg-surface-raised shadow-lg ring-1 ring-black/5">
                            {canLinkParent && (
                              <button
                                onClick={() => { setEditingParent(true); setLinkMenuOpen(false); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-surface"
                              >
                                <Link2 size={12} className="text-text-placeholder" />
                                {parentTicket ? 'Change parent…' : 'Link to parent…'}
                              </button>
                            )}
                            {canAddSubTicket && (
                              <button
                                onClick={() => { setShowCreateSub(true); setLinkMenuOpen(false); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text transition-colors hover:bg-surface"
                              >
                                <Plus size={12} className="text-text-placeholder" />
                                Add sub-ticket…
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inline parent picker (when chosen from menu) */}
                  {editingParent && (
                    <div className="mt-2 flex flex-col gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Parent</span>
                      <RichSelect
                        value={ticket.parentKey ?? ''}
                        options={parentOptions}
                        onChange={v => {
                          updateTicket({ parentKey: v || null });
                          setEditingParent(false);
                        }}
                      />
                      <button
                        onClick={() => setEditingParent(false)}
                        className="self-start text-[11px] text-text-placeholder hover:text-text-subtle"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Parent display - only when set and not editing */}
                  {!editingParent && parentTicket && (
                    <div className="mt-2">
                      <p className="mb-1.5 text-[10px] font-medium text-text-placeholder">Parent</p>
                      <Link
                        href={orgRoute(slug, `/projects/${id}/tickets/${parentTicket.key}`)}
                        className="inline-flex items-center gap-2.5 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text transition-colors hover:border-primary hover:text-primary"
                      >
                        <span className={`flex items-center ${TYPE_META[parentTicket.type].cls}`}>
                          {TYPE_META[parentTicket.type].icon}
                        </span>
                        <span className="font-mono text-xs text-text-placeholder">{parentTicket.key}</span>
                        <span className="truncate max-w-xs">{parentTicket.title}</span>
                        {parentTicket.type === 'epic' && (
                          <EpicTag name={parentTicket.epicName || parentTicket.title} color={parentTicket.epicColor} />
                        )}
                        <Link2 size={12} className="flex-shrink-0 text-text-placeholder" />
                      </Link>
                    </div>
                  )}

                  {/* Epic progress - children done/total + colored bar. Shown
                      for epics even with zero children (says "no children yet"). */}
                  {ticket.type === 'epic' && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[10px] font-medium text-text-placeholder">Epic progress</p>
                      <EpicProgress childTickets={subTickets} color={ticket.epicColor} />
                    </div>
                  )}

                  {/* Children list - only when there are any */}
                  {subTickets.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[10px] font-medium text-text-placeholder">Children ({subTickets.length})</p>
                      <div className="overflow-hidden rounded-lg border border-border">
                        {subTickets.map((sub, idx) => (
                          <Link
                            key={sub.id}
                            href={orgRoute(slug, `/projects/${id}/tickets/${sub.key}`)}
                            className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface ${idx < subTickets.length - 1 ? 'border-b border-border' : ''}`}
                          >
                            <span className={`flex flex-shrink-0 items-center ${TYPE_META[sub.type].cls}`}>
                              {TYPE_META[sub.type].icon}
                            </span>
                            <span className="w-16 flex-shrink-0 font-mono text-xs text-text-placeholder">{sub.key}</span>
                            <span className="flex-1 truncate text-text">{sub.title}</span>
                            <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_META[sub.status].cls}`}>
                              {STATUS_META[sub.status].label}
                            </span>
                            {sub.assignee ? (
                              <div
                                title={sub.assignee.name}
                                style={{ backgroundColor: memberColor(sub.assignee.id) }}
                                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                              >
                                {sub.assignee.initials}
                              </div>
                            ) : (
                              <div className="h-5 w-5 flex-shrink-0 rounded-full border border-dashed border-text-placeholder bg-surface" />
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Metadata strip - intentionally subtle so it reads as
                  reference info, distinct from the description card above.
                  Subtle bg-surface, leading icons per field, vertical
                  dividers between cells. */}
              <section className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-md bg-surface px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <User size={12} className="text-text-placeholder" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Reporter</span>
                  <div
                    style={{ backgroundColor: memberColor(ticket.reporter.id) }}
                    className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                  >
                    {ticket.reporter.initials}
                  </div>
                  <span className="truncate text-text-subtle">{ticket.reporter.name}</span>
                </div>
                <span className="h-3 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <Calendar size={12} className="text-text-placeholder" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Created</span>
                  <span className="text-text-subtle">{formatDateTime(ticket.createdAt)}</span>
                </div>
                <span className="h-3 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <RefreshCw size={12} className="text-text-placeholder" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Updated</span>
                  <span className="text-text-subtle">{formatDateTime(ticket.updatedAt)}</span>
                </div>
              </section>

              {/* Attachments - read-only thumbnail grid of files linked to
                  this ticket, placed just above the Activity section per the
                  ticket-detail prototype. Preview/download via presigned GET
                  URLs the backend serves. Editable when the user has
                  operational rights: an Edit button reveals per-tile delete +
                  the same pending-file picker as the create modal (adds are
                  staged until Save links them via PATCH). */}
              {(ticketAttachments.length > 0 || canEditTicket) && (
                <section className="rounded-lg border border-border bg-surface-raised p-4 sm:p-5">
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
                      Attachments
                      {ticketAttachments.length > 0 && <span> ({ticketAttachments.length})</span>}
                    </h3>
                    {canEditTicket && (
                      editingAttachments ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={cancelAttachmentEdit}
                            disabled={attachmentBusy}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-subtle transition-colors hover:bg-surface disabled:opacity-50"
                          >
                            <X size={12} />
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveAttachments}
                            disabled={attachmentBusy || (attEditor.pending.length === 0 && !deletedInEdit)}
                            className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                          >
                            <Check size={12} />
                            {savingAttachments ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingAttachments(true)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-subtle transition-colors hover:bg-surface hover:text-text"
                        >
                          <Pencil size={11} />
                          Edit
                        </button>
                      )
                    )}
                  </div>

                  {editingAttachments ? (
                    <div className="flex flex-col gap-3">
                      {ticketAttachments.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-text-placeholder">
                            Existing
                          </span>
                          <PersistedAttachmentList
                            attachments={ticketAttachments}
                            onDelete={handleDeleteAttachment}
                            deletingId={deletingAttachmentId}
                          />
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-text-placeholder">
                          Add new
                        </span>
                        <AttachmentList
                          pending={attEditor.pending}
                          limits={TICKET_ATTACHMENT_LIMITS}
                          onAdd={attEditor.addFiles}
                          onRemove={attEditor.remove}
                          disabled={attachmentBusy}
                          compact
                        />
                      </div>
                    </div>
                  ) : (
                    <PersistedAttachmentList attachments={ticketAttachments} />
                  )}
                </section>
              )}

              {/* ── Activity / Comments ──
                  Comment form ABOVE comments so the caller never has to
                  scroll past existing comments to add a new one. Delete
                  button on each comment uses a muted-danger rest state
                  (text-danger/60) so it reads as "delete" the moment it
                  appears on hover. */}
              <section className="border-t border-border pt-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text">
                  <MessageSquare size={14} className="text-text-subtle" />
                  Activity
                  {comments.length > 0 && (
                    <span className="text-sm font-normal text-text-placeholder">({comments.length})</span>
                  )}
                </h3>

                {/* Threaded comment UI — shared with the TicketPanel via
                    <CommentThread> so the two surfaces never diverge. Owns its
                    own compose / reply / edit state + mutations. */}
                <CommentThread
                  variant="full"
                  comments={comments}
                  members={project.members}
                  projectId={id}
                  ticketId={ticket.id}
                  ticketKey={key}
                  reporterId={ticket.reporter.id}
                  assigneeId={ticket.assignee?.id ?? null}
                  currentUserId={user?.id}
                  currentUserName={user?.name}
                  currentUserEmail={user?.email}
                  orgRole={role}
                  initialShowAll={expandComments}
                />
              </section>

              {/* Minimal delete row (admin tier only per rbac.md note ⁵).
                  Desktop only - on mobile the right rail stacks below the
                  article, so a delete button at the article end would sit
                  ABOVE the Details panel (Status/Sprint/etc.). Mobile
                  copy below the grid keeps Delete as the page's last item
                  on phone, where users expect it. */}
              {canManageProjectTicket && (
                <div className="mt-2 hidden justify-end border-t border-border pt-3 lg:flex">
                  <button
                    onClick={confirmDelete}
                    disabled={isDeleting}
                    className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    {isDeleting ? 'Deleting…' : 'Delete ticket'}
                  </button>
                </div>
              )}
            </article>

            {/* ── RIGHT column (sticky Details panel) ─────────────────────
                Every field uses the custom RichSelect so the open list can
                paint icons / avatars / colored rows / framed pills per
                option (native <option> is unstylable cross-browser).
                Trigger reflects the currently-selected option's accent
                via the per-status / per-priority className helpers. */}
            <aside className="lg:col-span-3 min-w-0">
              <div className="lg:sticky lg:top-20 flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
                  Details
                </h3>

                {/* Status - per-option row color + dot, trigger accent matches selected */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Status</span>
                  <RichSelect
                    value={ticket.status}
                    options={STATUS_OPTIONS}
                    onChange={v => updateTicket({ status: v })}
                    disabled={isUpdating || !canEditTicket}
                    title={!canEditTicket ? 'Only the reporter, assignee, project manager, or admin can change status' : undefined}
                    triggerClassName={statusMeta.selectCls}
                  />
                </div>

                {/* Assignee - leading avatar in both trigger + each row */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Assignee</span>
                  <RichSelect
                    value={ticket.assignee?.id ?? ''}
                    options={assigneeOptions}
                    onChange={v => updateTicket({ assigneeId: v || null })}
                    disabled={isUpdating || !canEditTicket}
                    title={!canEditTicket ? 'Only the reporter, assignee, project manager, or admin can change assignee' : undefined}
                  />
                </div>

                {/* Priority - leading colored icon, row text in priority color */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Priority</span>
                  <RichSelect
                    value={ticket.priority}
                    options={PRIORITY_OPTIONS}
                    onChange={v => updateTicket({ priority: v })}
                    disabled={isUpdating || !canEditTicket}
                    title={!canEditTicket ? 'Only the reporter, assignee, project manager, or admin can change priority' : undefined}
                    triggerClassName={`border-border ${PRIORITY_META[ticket.priority].cls} font-medium`}
                  />
                </div>

                {/* Type - leading colored type chip */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Type</span>
                  <RichSelect
                    value={ticket.type}
                    options={TYPE_OPTIONS}
                    onChange={v => updateTicket({ type: v })}
                    disabled={isUpdating || !canEditTicket}
                    title={!canEditTicket ? 'Only the reporter, assignee, project manager, or admin can change type' : undefined}
                  />
                </div>

                {/* Sprint - PM+ edits; others see read-only sprint name + Active pill */}
                {canManageProjectTicket ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Sprint</span>
                    <RichSelect
                      value={ticket.sprintId ?? ''}
                      options={sprintOptions}
                      onChange={v => updateTicket({ sprintId: v || null })}
                      disabled={isUpdating}
                    />
                  </div>
                ) : sprint ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Sprint</span>
                    <div className="flex min-h-[34px] items-center gap-2 flex-wrap">
                      <span className="text-sm text-text truncate">{sprint.name}</span>
                      {sprint.status === 'active' ? (
                        <span className="rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success">Active</span>
                      ) : (
                        <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-placeholder">Planned</span>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </aside>

          </div>

          {/* Mobile-only Delete row. Renders OUTSIDE the grid so it's the
              very last thing on the page after the Details rail stacks
              below the article. Mirror of the desktop in-article delete. */}
          {canManageProjectTicket && (
            <div className="mt-6 flex justify-end border-t border-border pt-4 lg:hidden">
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
              >
                <Trash2 size={12} />
                {isDeleting ? 'Deleting…' : 'Delete ticket'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add sub-ticket modal - CreateTicketModal opened from the Child
          issues section, pre-filled with parentKey=this ticket's key so
          the created ticket lands as a child of the current one. */}
      {showCreateSub && (
        <CreateTicketModal
          project={project}
          initialParentKey={ticket.key}
          onClose={() => setShowCreateSub(false)}
        />
      )}
    </div>
  );
}
