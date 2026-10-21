'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDateTime } from '@/lib/dates';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  X, ArrowUpRight, Trash2,
  MessageSquare, Pencil, Plus, Link2, Copy,
} from '@/lib/icons';
import { useAuthStore, useCurrentRole } from '@/store/auth.store';
import { useTicket, useUpdateTicket, useDeleteTicket } from '@/hooks/useTickets';
import { CommentThread } from '@/components/comments/CommentThread';
import { PersistedAttachmentList } from '@/components/attachments/PersistedAttachmentList';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { RichSelect } from '@/components/ui/RichSelect';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import { confirmModal } from '@/lib/confirmModal';
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
import type { Ticket, Project } from '@/types/api.types';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  ticket: Ticket;
  project: Project;
  onClose: () => void;
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function TicketPanel({ ticket: initialTicket, project, onClose }: Props) {
  const user       = useAuthStore(s => s.user);
  const role       = useCurrentRole();
  const slug       = useCurrentSlug() ?? '';
  // Per docs/rbac.md §Ticket actions, split into two gates:
  //   canEditTicket          - status, assignee, type, priority, title,
  //   description: reporter + assignee + PM-in-project + admin + owner.
  //   canManageProjectTicket - sprint, parent, delete: PM+ only.
  const isAdminTier            = role === 'owner' || role === 'admin' || role === 'project_manager';
  const initialIsReporter      = initialTicket.reporter.id === user?.id;
  const initialIsAssignee      = initialTicket.assignee?.id === user?.id;
  const canEditTicket          = isAdminTier || initialIsReporter || initialIsAssignee;
  const canManageProjectTicket = isAdminTier;
  // Split gates for the link menu - see ticket detail page for rationale.
  const canLinkParent          = canEditTicket;
  const canAddSubTicket        = canCreateTicketInProject(project, user, role);

  // Always derive metadata from project so the panel stays fresh after mutations
  const ticket = useMemo(
    () =>
      [...project.sprints.flatMap(s => s.tickets), ...(project.backlog ?? [])]
        .find(t => t.id === initialTicket.id) ?? initialTicket,
    [project, initialTicket.id],
  );

  const allTickets = [...project.sprints.flatMap(s => s.tickets), ...(project.backlog ?? [])];

  // Fetch real comments - project data always returns comments: []
  const { data: fullTicket } = useTicket(project.id, ticket.key);
  const comments = fullTicket?.comments ?? [];
  // Attachments come from the same full-ticket query — the project rollup
  // doesn't carry them, so this is the only reliable source.
  const ticketAttachments = fullTicket?.attachments ?? [];

  const { mutate: updateTicket, isPending: isUpdating } = useUpdateTicket(project.id, ticket.id);
  const { mutate: deleteTicket, isPending: isDeleting } = useDeleteTicket(project.id);

  const [visible,       setVisible]       = useState(false);
  const [editingTitle,  setEditingTitle]  = useState(false);
  const [draftTitle,    setDraftTitle]    = useState('');
  const [editingDesc,   setEditingDesc]   = useState(false);
  const [draftDesc,     setDraftDesc]     = useState('');
  const [editingParent, setEditingParent] = useState(false);
  const [showCreateSub, setShowCreateSub] = useState(false);
  const [linkMenuOpen, setLinkMenuOpen]   = useState(false);
  const linkMenuRef = useRef<HTMLDivElement>(null);

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

  const titleRef = useRef<HTMLInputElement>(null);
  const descRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editingTitle && !editingDesc) close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
      const l = titleRef.current.value.length;
      titleRef.current.setSelectionRange(l, l);
    }
  }, [editingTitle]);
  useEffect(() => {
    if (editingDesc && descRef.current) {
      descRef.current.focus();
      const l = descRef.current.value.length;
      descRef.current.setSelectionRange(l, l);
    }
  }, [editingDesc]);

  function close() { setVisible(false); setTimeout(onClose, 180); }

  function saveTitle() {
    const trimmed = draftTitle.trim();
    // Min 2 chars — matches the create flow + backend validation. Toast +
    // keep editing on too-short so the user can correct without losing input.
    if (trimmed.length > 0 && trimmed.length < 2) {
      toast.error('Title must be at least 2 characters');
      return;
    }
    if (trimmed && trimmed !== ticket.title) updateTicket({ title: trimmed });
    setEditingTitle(false);
  }

  function saveDesc() {
    updateTicket({ description: draftDesc.trim() || undefined });
    setEditingDesc(false);
  }

  async function copyTicketKey() {
    try {
      await navigator.clipboard.writeText(ticket.key);
      toast.success(`Copied ${ticket.key}`);
    } catch {
      toast.error('Failed to copy ticket key');
    }
  }

  async function confirmDelete() {
    const ok = await confirmModal({
      title:        `Delete ${ticket.key}?`,
      description:  `Permanently delete this ticket and all its comments. This cannot be undone.`,
      confirmLabel: 'Delete ticket',
      variant:      'danger',
    });
    if (!ok) return;
    deleteTicket(ticket.id, { onSuccess: close });
  }

  const sprint        = project.sprints.find(s => s.tickets.some(t => t.id === ticket.id));
  const subTickets    = sprint?.tickets.filter(t => ticket.subTicketKeys.includes(t.key)) ?? [];
  const parentTicket  = ticket.parentKey ? allTickets.find(t => t.key === ticket.parentKey) : null;
  const activeSprints = project.sprints.filter(s => s.status !== 'completed');

  const typeMeta   = TYPE_META[ticket.type];
  const statusMeta = STATUS_META[ticket.status];

  // RichSelect option lists - shared meta + dynamic builders.
  const assigneeOptions = buildAssigneeOptions(project.members);
  const sprintOptions   = buildSprintOptions(activeSprints);
  const parentOptions   = buildParentOptions(allTickets.filter(t => t.id !== ticket.id));

  // ── Main content (left) ───────────────────────────────────────────────────

  const mainContent = (
    <div className="md:flex-1 md:overflow-y-auto px-5 py-5">

      {/* Title - click to edit */}
      <div className="mb-4">
        {editingTitle ? (
          <input
            ref={titleRef}
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            className="w-full rounded border border-primary bg-surface-raised px-2 py-1 text-xl font-semibold text-text outline-none leading-snug"
          />
        ) : canEditTicket ? (
          <h2
            onClick={() => { setDraftTitle(ticket.title); setEditingTitle(true); }}
            className="text-xl font-semibold leading-snug text-text cursor-text hover:bg-surface rounded px-2 py-1 -mx-2 -my-1 transition-colors"
            title="Click to edit"
          >
            {ticket.title}
          </h2>
        ) : (
          <h2 className="text-xl font-semibold leading-snug text-text px-2 py-1 -mx-2 -my-1">
            {ticket.title}
          </h2>
        )}
      </div>

      {/* Description - bg-surface-raised opaque card */}
      <section className="group/desc mb-5 rounded-lg border border-border bg-surface-raised p-4">
        <div className="mb-2 flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
            Description
          </p>
          {!editingDesc && canEditTicket && (
            <button
              onClick={() => { setDraftDesc(ticket.description ?? ''); setEditingDesc(true); }}
              className="opacity-0 group-hover/desc:opacity-100 flex items-center gap-1 text-[10px] text-text-placeholder transition-all hover:text-text"
            >
              <Pencil size={10} />
              Edit
            </button>
          )}
        </div>
        {editingDesc ? (
          <div className="flex flex-col gap-2">
            <textarea
              ref={descRef}
              rows={10}
              value={draftDesc}
              onChange={e => setDraftDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setEditingDesc(false); }}
              className="w-full resize-none rounded border border-primary bg-surface-raised px-3 py-2 text-sm text-text outline-none leading-relaxed placeholder:text-text-placeholder"
              placeholder="Add a description..."
            />
            <div className="flex gap-2">
              <button
                onClick={saveDesc}
                className="rounded bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-hover"
              >
                Save
              </button>
              <button
                onClick={() => setEditingDesc(false)}
                className="rounded border border-border px-3 py-1 text-xs text-text-subtle hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : ticket.description ? (
          // Read-only text — no click-to-edit here so users can select/copy
          // normally. Editing is entered only via the Edit button above.
          <div className="px-2 py-1 -mx-2">
            <MarkdownRenderer content={ticket.description} />
          </div>
        ) : canEditTicket ? (
          <p
            onClick={() => { setDraftDesc(''); setEditingDesc(true); }}
            className="text-sm text-text-placeholder cursor-text hover:bg-surface rounded px-2 py-1 -mx-2 transition-colors"
          >
            No description - click to add one.
          </p>
        ) : (
          <p className="text-sm text-text-placeholder px-2 py-1 -mx-2">
            No description.
          </p>
        )}
      </section>

      {/* Type-specific fields (Epic/Story/Bug) - nothing for Task */}
      <div className="mb-5">
        <TicketDetailsCard
          ticket={ticket}
          canEdit={canEditTicket}
          isSaving={isUpdating}
          onSave={(payload) => updateTicket(payload)}
        />
      </div>

      {/* Linked tickets - combined parent + children in ONE compact
          section. Empty state = single one-liner. See ticket detail page
          for full rationale. */}
      {(parentTicket || subTickets.length > 0 || canLinkParent || canAddSubTicket) && (
        <section className="mb-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
              Linked tickets
            </p>
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

          {/* Inline parent picker */}
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

          {/* Parent display */}
          {!editingParent && parentTicket && (
            <div className="mt-2">
              <p className="mb-1.5 text-[10px] font-medium text-text-placeholder">Parent</p>
              <Link
                href={orgRoute(slug, `/projects/${project.id}/tickets/${parentTicket.key}`)}
                onClick={close}
                className="inline-flex items-center gap-2 rounded border border-border bg-surface-raised px-3 py-1.5 text-sm text-text transition-colors hover:border-primary hover:text-primary"
              >
                <span className={`flex items-center ${TYPE_META[parentTicket.type].cls}`}>
                  {TYPE_META[parentTicket.type].icon}
                </span>
                <span className="font-mono text-xs text-text-placeholder">{parentTicket.key}</span>
                <span className="max-w-[200px] truncate">{parentTicket.title}</span>
                {parentTicket.type === 'epic' && (
                  <EpicTag name={parentTicket.epicName || parentTicket.title} color={parentTicket.epicColor} />
                )}
                <Link2 size={11} className="flex-shrink-0 text-text-placeholder" />
              </Link>
            </div>
          )}

          {/* Epic progress - children done/total + colored bar (epics only) */}
          {ticket.type === 'epic' && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-medium text-text-placeholder">Epic progress</p>
              <EpicProgress childTickets={subTickets} color={ticket.epicColor} />
            </div>
          )}

          {/* Children list */}
          {subTickets.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-medium text-text-placeholder">Children ({subTickets.length})</p>
              <div className="overflow-hidden rounded-lg border border-border">
                {subTickets.map((sub, idx) => (
                  <Link
                    key={sub.id}
                    href={orgRoute(slug, `/projects/${project.id}/tickets/${sub.key}`)}
                    onClick={close}
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
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Attachments — thumbnail grid, mirroring the full ticket page. Lives
          just above Activity so files are visible without opening the full
          page. Read-only here (preview via the shared modal); the full page
          owns add/delete. */}
      {ticketAttachments.length > 0 && (
        <section className="mb-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
            Attachments · {ticketAttachments.length}
          </p>
          <PersistedAttachmentList attachments={ticketAttachments} />
        </section>
      )}

      {/* Activity / Comments — full threaded UI (reply + edit + delete),
          shared with the full ticket page via <CommentThread>. The panel
          caps the list and links out to the full page for overflow. */}
      <div>
        <p className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
          <MessageSquare size={11} />
          Activity{comments.length > 0 ? ` · ${comments.length}` : ''}
        </p>
        <CommentThread
          variant="panel"
          comments={comments}
          members={project.members}
          projectId={project.id}
          ticketId={ticket.id}
          ticketKey={ticket.key}
          reporterId={ticket.reporter.id}
          assigneeId={ticket.assignee?.id ?? null}
          currentUserId={user?.id}
          currentUserName={user?.name}
          currentUserEmail={user?.email}
          orgRole={role}
          fullPageHref={`${orgRoute(slug, `/projects/${project.id}/tickets/${ticket.key}`)}?expand=comments`}
        />
      </div>
    </div>
  );

  // ── Details sidebar (always visible) ─────────────────────────────────────

  const detailsSidebar = (
    <div className="md:w-56 md:flex-shrink-0 md:overflow-y-auto md:scrollbar-subtle border-t md:border-t-0 md:border-l border-border bg-surface/40 px-5 md:px-4 py-5">
      <div className="flex flex-col gap-4">

        {/* Status - per-option colored row + dot */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Status</span>
          <RichSelect
            value={ticket.status}
            options={STATUS_OPTIONS}
            onChange={v => updateTicket({ status: v })}
            disabled={!canEditTicket}
            title={!canEditTicket ? 'Only the reporter, assignee, project manager, or admin can change status' : undefined}
            triggerClassName={statusMeta.selectCls}
          />
        </div>

        {/* Type */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Type</span>
          <RichSelect
            value={ticket.type}
            options={TYPE_OPTIONS}
            onChange={v => updateTicket({ type: v })}
            disabled={!canEditTicket}
            title={!canEditTicket ? 'Only the reporter, assignee, project manager, or admin can change type' : undefined}
          />
        </div>

        {/* Priority */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Priority</span>
          <RichSelect
            value={ticket.priority}
            options={PRIORITY_OPTIONS}
            onChange={v => updateTicket({ priority: v })}
            disabled={!canEditTicket}
            title={!canEditTicket ? 'Only the reporter, assignee, project manager, or admin can change priority' : undefined}
            triggerClassName={`border-border ${PRIORITY_META[ticket.priority].cls} font-medium`}
          />
        </div>

        {/* Assignee */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Assignee</span>
          <RichSelect
            value={ticket.assignee?.id ?? ''}
            options={assigneeOptions}
            onChange={v => updateTicket({ assigneeId: v || null })}
            disabled={!canEditTicket}
            title={!canEditTicket ? 'Only the reporter, assignee, project manager, or admin can change assignee' : undefined}
          />
        </div>

        {/* Reporter (read-only) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Reporter</span>
          <div className="flex items-center gap-2">
            <div
              style={{ backgroundColor: memberColor(ticket.reporter.id) }}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
            >
              {ticket.reporter.initials}
            </div>
            <span className="text-xs text-text truncate">{ticket.reporter.name}</span>
          </div>
        </div>

        {/* Sprint - PM+ edits; others see read-only name + Active pill */}
        {canManageProjectTicket ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Sprint</span>
            <RichSelect
              value={ticket.sprintId ?? ''}
              options={sprintOptions}
              onChange={v => updateTicket({ sprintId: v || null })}
            />
          </div>
        ) : sprint ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Sprint</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-text truncate">{sprint.name}</span>
              {sprint.status === 'active' ? (
                <span className="rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success">Active</span>
              ) : (
                <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-placeholder">Planned</span>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Created</span>
            <span className="text-xs text-text-subtle">{formatDateTime(ticket.createdAt)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">Updated</span>
            <span className="text-xs text-text-subtle">{formatDateTime(ticket.updatedAt)}</span>
          </div>
        </div>

        {/* Minimal delete - confirm modal handles the safety surface */}
        {canManageProjectTicket && (
          <div className="border-t border-border pt-3">
            <button
              onClick={confirmDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
            >
              <Trash2 size={12} />
              {isDeleting ? 'Deleting…' : 'Delete ticket'}
            </button>
          </div>
        )}

      </div>
    </div>
  );

  return (
    <>
      {/* Soft backdrop */}
      <div
        className={`fixed bottom-0 left-0 md:left-60 right-0 top-14 z-[28] bg-black/20 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />

      {/* Slide-over panel */}
      <div
        className={`fixed bottom-9 right-0 top-14 z-[29] flex flex-col border-l border-border bg-surface-raised shadow-2xl
          w-full md:w-[780px] md:max-w-[calc(100vw-15rem)]
          transition-transform duration-200 ease-out
          ${visible ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Panel header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-surface-raised px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <button
              onClick={copyTicketKey}
              title={`Copy ${ticket.key}`}
              className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors hover:brightness-95 ${typeMeta.cls}`}
            >
              {typeMeta.icon}
              {ticket.key}
              <Copy size={10} className="opacity-60" />
            </button>
            {parentTicket && (
              <span className="text-xs text-text-placeholder">↳ {parentTicket.key}</span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <Link
              href={orgRoute(slug, `/projects/${project.id}/tickets/${ticket.key}`)}
              title="Open full page"
              className="flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-text-placeholder transition-colors hover:bg-surface hover:text-text"
            >
              <ArrowUpRight size={13} />
              <span className="hidden sm:inline">Full page</span>
            </Link>
            <button onClick={close} className="rounded p-1.5 text-text-placeholder transition-colors hover:bg-surface hover:text-text">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body - desktop = side-by-side scroll panes; mobile = single
            vertical scroll, details stacked below main content (the
            cramped 700px-wide layout on a 360px screen was unusable). */}
        <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {mainContent}
          {detailsSidebar}
        </div>
      </div>

      {/* Add sub-ticket modal */}
      {showCreateSub && (
        <CreateTicketModal
          project={project}
          initialParentKey={ticket.key}
          onClose={() => setShowCreateSub(false)}
        />
      )}
    </>
  );
}
