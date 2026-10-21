'use client';

import { useRef, useState } from 'react';
import { Eye, FileQuestion, Plus, X } from '@/lib/icons';
import {
  type AttachmentLimits, type PendingAttachment,
  invalidMessages, formatBytes,
} from '@/lib/uploads';
import { AttachmentPreviewModal } from '@/components/attachments/AttachmentPreviewModal';
import { fileKind } from '@/components/attachments/attachmentKind';
import { confirmModal } from '@/lib/confirmModal';

interface AttachmentListProps {
  pending: PendingAttachment[];
  limits: AttachmentLimits;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  /** Disable the picker while a mutation is in flight. */
  disabled?: boolean;
  /** Compact row layout — used inside comment composers. */
  compact?: boolean;
  /** Hide the picker (dropzone / "Attach files" button) entirely. Pasted
   *  files still appear as rows with preview/remove — used where paste-to-
   *  attach is the only entry point (ticket description). */
  noPicker?: boolean;
  /** Extra classes for the root container — used to style the compact list
   *  as a bottom bar inside a composer box. */
  className?: string;
}

// Pending-file picker + list shared by the CreateTicketModal and the
// CommentThread composers. Fully presentational — the caller owns the
// PendingAttachment state (via useAttachments) and passes it down. Behavior is
// locked to the attachment spec:
//  - Picking files is optional; nothing renders when the list is empty.
//  - Invalid files (bad extension / >10 MB) stay in the list, red-marked, with
//    a message line ABOVE the list ("'<name>' is exceeding 10 MB"). NO
//    alert() — the caller disables its submit button while hasInvalid() is
//    true.
//  - Removing a file asks for confirmation (Yes/No) first — matches the
//    ticket-create prototype's confirm overlay.
//  - Count / total caps are enforced by the caller's addFiles (rejects with a
//    toast), so the totals bar never sits past the cap.
//
// Two visual modes:
//  - Modal (ticket create) — a full-width dropzone + totals bar, matching the
//    ui-prototypes/pages/ticket-create.html design (attachments above the
//    description).
//  - compact (comment composers) — a small "Attach files" button + thin bar.
export function AttachmentList({ pending, limits, onAdd, onRemove, disabled = false, compact = false, noPicker = false, className = '' }: AttachmentListProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ attachment: PendingAttachment; url: string } | null>(null);

  const errors = invalidMessages(pending);

  function openPreview(p: PendingAttachment) {
    if (disabled) return;
    setPreview({ attachment: p, url: URL.createObjectURL(p.file) });
  }

  function closePreview() {
    const url = preview?.url;
    setPreview(null);
    if (url) URL.revokeObjectURL(url);
  }

  // Delete is destructive — ask first (Yes/No), matching the prototype's
  // confirm overlay. The pending row is only removed on explicit confirmation.
  async function handleRemove(p: PendingAttachment) {
    if (disabled) return;
    const confirmed = await confirmModal({
      title: 'Remove file',
      description: `Are you sure you want to remove "${p.file.name}"?`,
      confirmLabel: 'Yes, remove',
      cancelLabel:  'No',
      variant:      'danger',
    });
    if (confirmed) onRemove(p.id);
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      className="hidden"
      onChange={e => { onAdd(Array.from(e.target.files ?? [])); e.target.value = ''; }}
      disabled={disabled}
    />
  );

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* COMING SOON: S3 attachments disabled. The picker is a disabled tag so
          the user gets clear feedback instead of a dead button. Re-enable the
          original picker (input ref + dropzone + addFiles) when storage lands. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          disabled
          title="Attachments are coming soon"
          className="flex cursor-not-allowed items-center gap-1 rounded border border-dashed border-border px-2.5 py-0.5 text-[11px] font-medium text-text-placeholder opacity-60"
        >
          <Plus size={11} />
          Attachments coming soon
        </button>
      </div>

      {/* Picker — disabled with attachments. Original implementation below. */}
      {/* {!noPicker && (compact ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="flex items-center gap-1 rounded border border-dashed border-border px-2.5 py-0.5 text-[11px] font-medium text-text-subtle transition-colors hover:border-primary/50 hover:bg-primary-subtle hover:text-primary disabled:opacity-50"
          >
            <Plus size={11} />
            Attach files
          </button>
          {pending.length > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-text-placeholder">
              <span>
                {pending.length} / {limits.maxFiles} {pending.length === 1 ? 'file' : 'files'}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onClick={disabled ? undefined : () => inputRef.current?.click()}
          onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={e => { if (!disabled) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            if (disabled) return;
            e.preventDefault();
            setDragOver(false);
            onAdd(Array.from(e.dataTransfer.files ?? []));
          }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            dragOver ? 'border-primary bg-primary-subtle' : 'border-border hover:border-primary hover:bg-primary-subtle'
          }`}
        >
          <Upload size={18} className="text-text-subtle" />
          <span className="text-xs text-text-subtle">Drop files here or click to browse</span>
        </div>
      ))} */}

      {/* Hidden input — shared by both picker modes; must be mounted or the
          dropzone's click handler has nothing to trigger. */}
      {input}

      {/* Invalid-file message block — red-marked ABOVE the list so the user
          sees what's wrong before scanning the rows. */}
      {errors.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {errors.map((msg, i) => (
            <p key={i} className="text-[11px] font-medium text-danger">{msg}</p>
          ))}
        </div>
      )}

      {/* Pending file rows */}
      {pending.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {pending.map(p => {
            const kind = fileKind(p.file.name, p.file.type);
            const chipSize = compact ? 'h-7 w-7 rounded' : 'h-8 w-8 rounded-md';
            const chipCls = p.valid
              ? `${chipSize} flex flex-shrink-0 items-center justify-center ${kind.cls}`
              : `${chipSize} flex flex-shrink-0 items-center justify-center bg-danger-subtle text-danger`;
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 transition-colors ${
                  compact
                    ? `rounded border px-2.5 py-1.5 text-xs ${p.valid ? 'border-border bg-surface-raised' : 'border-danger/40 bg-danger/5'}`
                    : `rounded-md px-3 py-2 ${p.valid ? 'bg-surface-sunken' : 'bg-danger/5 ring-1 ring-inset ring-danger/40'}`
                }`}
              >
                <span className={chipCls}>
                  {p.valid ? kind.icon : <FileQuestion size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13px] font-medium ${p.valid ? 'text-text' : 'text-danger'}`}>
                    {p.file.name}
                  </div>
                  <div className={`text-[11px] ${p.valid ? 'text-text-placeholder' : 'text-danger'}`}>
                    {formatBytes(p.file.size)}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => openPreview(p)}
                    disabled={disabled}
                    className="flex h-7 w-7 items-center justify-center rounded text-text-placeholder transition-colors hover:bg-primary-subtle hover:text-primary disabled:opacity-40"
                    title="Preview"
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(p)}
                    disabled={disabled}
                    className="flex h-7 w-7 items-center justify-center rounded text-text-placeholder transition-colors hover:bg-danger-subtle hover:text-danger disabled:opacity-40"
                    title="Remove file"
                  >
                    <X size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Preview overlay — same screen, matches the prototype's preview card */}
      {preview && (
        <AttachmentPreviewModal
          name={preview.attachment.file.name}
          size={preview.attachment.file.size}
          mimeType={preview.attachment.file.type || 'application/octet-stream'}
          url={preview.url}
          downloadUrl={preview.url}
          onClose={closePreview}
        />
      )}
    </div>
  );
}
