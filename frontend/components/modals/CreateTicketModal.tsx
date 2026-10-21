'use client';

import { useState } from 'react';
import { X } from '@/lib/icons';
import { useCreateTicket } from '@/hooks/useTickets';
import { useAuthStore } from '@/store/auth.store';
import { RichSelect } from '@/components/ui/RichSelect';
import {
  STATUS_META,
  STATUS_OPTIONS, PRIORITY_OPTIONS, TYPE_OPTIONS,
  buildAssigneeOptions, buildSprintOptions, buildParentOptions,
} from '@/lib/ticket.meta';
import {
  TicketTypeFieldsForm, EMPTY_TYPE_FIELDS, typeFieldsToPayload,
  type TypeFieldsValue,
} from '@/components/ticket/TicketTypeFieldsForm';
import { capitalizeFirst } from '@/lib/text.utils';
import { AttachmentList } from '@/components/attachments/AttachmentList';
import { useAttachments } from '@/hooks/useAttachments';
import { TICKET_ATTACHMENT_LIMITS, hasInvalid } from '@/lib/uploads';
import type { Project, TicketType, Priority, TicketStatus } from '@/types/api.types';

interface Props {
  project: Project;
  onClose: () => void;
  initialStatus?:    TicketStatus;
  lockStatus?:       boolean;
  /** Pre-fill the parent picker. Used by the ticket detail page's "Add
   *  sub-ticket" button to land the new ticket as a child of the current. */
  initialParentKey?: string;
}

export function CreateTicketModal({ project, onClose, initialStatus, lockStatus = false, initialParentKey }: Props) {
  const activeSprint  = project.sprints.find(s => s.status === 'active');
  const defaultSprint = activeSprint ?? project.sprints.find(s => s.status === 'planned');

  // Default-to-me: assignee pre-fills with the current user when they're a
  // project member. Mirrors the board / backlog assignee-filter default
  // (ProjectSubNav). Non-members fall back to unassigned ('') because
  // selecting them would block their own ticket creation (RBAC checks
  // assignee membership). The caller can always switch via the picker.
  const currentUserId = useAuthStore(s => s.user?.id);
  const isProjectMember = !!currentUserId && project.members.some(m => m.id === currentUserId);
  const defaultAssigneeId = isProjectMember ? currentUserId! : '';

  const [title, setTitle]           = useState('');
  const [type, setType]             = useState<TicketType>('task');
  const [priority, setPriority]     = useState<Priority>('medium');
  const [status, setStatus]         = useState<TicketStatus>(initialStatus ?? 'todo');
  const [assigneeId, setAssignee]   = useState(defaultAssigneeId);
  const [description, setDesc]      = useState('');
  const [sprintId, setSprintId]     = useState(defaultSprint?.id ?? '');
  const [parentKey, setParentKey]   = useState(initialParentKey ?? '');
  const [titleError, setTitleError] = useState('');
  // Type-specific fields (Epic/Story/Bug). Kept across type switches so a user
  // who toggles type back and forth doesn't lose what they typed; only the
  // fields for the selected type are submitted.
  const [typeFields, setTypeFields] = useState<TypeFieldsValue>(EMPTY_TYPE_FIELDS);
  const patchTypeFields = (patch: Partial<TypeFieldsValue>) => setTypeFields(prev => ({ ...prev, ...patch }));

  // All tickets across sprints + backlog (for parent selector)
  const allTickets = [
    ...project.sprints.flatMap(s => s.tickets),
    ...(project.backlog ?? []),
  ];
  const activeSprints   = project.sprints.filter(s => s.status !== 'completed');
  const assigneeOptions = buildAssigneeOptions(project.members);
  const sprintOptions   = buildSprintOptions(activeSprints);
  const parentOptions   = buildParentOptions(allTickets);

  const { mutate: createTicket, isPending } = useCreateTicket(project.id);

  // Pending attachments (optional). Invalid files red-mark in the list and the
  // submit button stays disabled until removed/replaced (see hasInvalid).
  const attachments = useAttachments(TICKET_ATTACHMENT_LIMITS);
  const busy        = isPending || attachments.isUploading;
  const attachBlocked = hasInvalid(attachments.pending);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setTitleError('Title is required'); return; }
    // Min 2 chars — mirrors backend createTicketHandler and the search
    // endpoint's 2-char floor. Catches it client-side so the user sees
    // an inline error instead of a 400 toast.
    if (trimmedTitle.length < 2) { setTitleError('Title must be at least 2 characters'); return; }
    // Only the selected type's fields go in; null values are dropped at create
    // (a fresh ticket has nothing to clear).
    const tf = typeFieldsToPayload(type, typeFields);
    const typeFieldPayload = Object.fromEntries(
      Object.entries(tf).filter(([, v]) => v !== null && v !== ''),
    );
    // Presign + PUT any picked files BEFORE creating the ticket; the returned
    // metadata rides along in the same create request so everything links in
    // one call. Returns null on failure (toast already shown) — abort.
    const uploaded = await attachments.upload('ticket', null);
    if (uploaded === null) return;
    createTicket(
      {
        title: trimmedTitle,
        type,
        priority,
        status,
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        sprintId:  sprintId  || undefined,
        parentKey: parentKey || undefined,
        attachments: uploaded.length > 0 ? uploaded : undefined,
        ...typeFieldPayload,
      },
      { onSuccess: () => { attachments.clear(); onClose(); } }
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Three-zone layout so the action footer stays put while the form
          body scrolls. User can submit (or cancel) without scrolling past
          a long parent picker / member list - common when they just want
          a quick ticket and don't care about every optional field. */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl max-h-[90vh]"
      >

        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-text">Create ticket</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto scrollbar-subtle px-6 py-5">

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">
              Title <span className="text-danger">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={title}
              // Auto-capitalize first letter at create time. Rename flow
              // on the ticket detail page does NOT auto-capitalize.
              onChange={e => { setTitle(capitalizeFirst(e.target.value)); if (titleError) setTitleError(''); }}
              placeholder="What needs to be done?"
              className={`rounded border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary ${titleError ? 'border-danger' : 'border-border'}`}
            />
            {titleError && <p className="text-xs text-danger">{titleError}</p>}
          </div>

          {/* Status - colored row per option + dot, trigger reflects selected accent.
              When opened from a board column, locked to that column's status. */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Status</label>
            {lockStatus ? (
              <div className="flex items-center gap-2 rounded border border-border bg-surface px-3 py-2 text-sm text-text-subtle">
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_META[status].dot}`} />
                <span className={STATUS_META[status].rowCls}>{STATUS_META[status].label}</span>
                <span className="ml-auto text-xs text-text-placeholder">(set by column)</span>
              </div>
            ) : (
              <RichSelect
                value={status}
                options={STATUS_OPTIONS}
                onChange={v => setStatus(v)}
                triggerClassName={STATUS_META[status].selectCls}
              />
            )}
          </div>

          {/* Type + Priority - both with leading icons */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">Type</label>
              <RichSelect
                value={type}
                options={TYPE_OPTIONS}
                onChange={v => setType(v)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">Priority</label>
              <RichSelect
                value={priority}
                options={PRIORITY_OPTIONS}
                onChange={v => setPriority(v)}
              />
            </div>
          </div>

          {/* Type-specific fields (Epic/Story/Bug) — nothing for Task */}
          <TicketTypeFieldsForm type={type} value={typeFields} onChange={patchTypeFields} />

          {/* Sprint - framed Active / Planned pill per row */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Sprint</label>
            <RichSelect
              value={sprintId}
              options={sprintOptions}
              onChange={v => setSprintId(v)}
            />
          </div>

          {/* Parent ticket - leading type chip + key + truncated title */}
          {allTickets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">
                Parent ticket{' '}
                <span className="font-normal text-text-placeholder text-xs">(optional)</span>
              </label>
              <RichSelect
                value={parentKey}
                options={parentOptions}
                onChange={v => setParentKey(v)}
              />
            </div>
          )}

          {/* Assignee - leading initials avatar */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">Assignee</label>
            <RichSelect
              value={assigneeId}
              options={assigneeOptions}
              onChange={v => setAssignee(v)}
            />
          </div>

          {/* Attachments — above the description per the ticket-create prototype
              (ui-prototypes/pages/ticket-create.html). Optional. Invalid files
              red-mark + block submit. */}
          <div className="flex flex-col gap-1.5 border-t border-dashed border-border pt-3">
            <label className="text-sm font-medium text-text">
              Attachments{' '}
              <span className="font-normal text-text-placeholder text-xs">
                (PNG, JPG, PDF, DOCX, XLS, XLSX)
              </span>
            </label>
            <AttachmentList
              pending={attachments.pending}
              limits={TICKET_ATTACHMENT_LIMITS}
              onAdd={attachments.addFiles}
              onRemove={attachments.remove}
              disabled={busy}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">
              Description{' '}
              <span className="font-normal text-text-placeholder text-xs">(optional)</span>
            </label>
            <textarea
              rows={10}
              value={description}
              onChange={e => setDesc(e.target.value)}
              onPaste={attachments.handlePaste}
              placeholder="Add more details..."
              className="resize-none rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary"
            />
            {/* Paste-to-attach hint — a screenshot pasted here (Ctrl+V) is added
                to the Attachments list above, not embedded in the description. */}
            <p className="text-[11px] text-text-placeholder">
              Tip: paste a screenshot (Ctrl+V) into the description to add it as a ticket attachment.
            </p>
          </div>

        </div>

        {/* Sticky footer - always reachable so a quick "title + Create"
            flow doesn't require scrolling the form. */}
        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-border bg-surface-raised px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded border border-border px-4 py-2 text-sm text-text-subtle transition-colors hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || attachBlocked}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60 disabled:blur-[0.5px]"
          >
            {attachments.isUploading ? 'Uploading…' : isPending ? 'Creating…' : 'Create ticket'}
          </button>
        </div>

      </form>
    </div>
  );
}
