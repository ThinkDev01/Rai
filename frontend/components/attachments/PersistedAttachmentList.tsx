'use client';

import { useState } from 'react';
import { Eye, X } from '@/lib/icons';
import { formatBytes } from '@/lib/uploads';
import { fileKind } from '@/components/attachments/attachmentKind';
import type { Attachment } from '@/types/api.types';

interface PersistedAttachmentListProps {
  attachments: Attachment[];
  /** grid = thumbnail tiles (ticket detail page), matching the ticket-detail
   *  prototype's 80x64 tile grid. inline = compact name/size pills (comment
   *  cards, per the comment-thread prototype). */
  variant?: 'grid' | 'inline';
  /** Enables the delete (X) affordance per row/tile — used by the ticket
   *  detail page's attachment edit mode. */
  onDelete?: (a: Attachment) => void;
  /** Id of the attachment currently being deleted (disables its action). */
  deletingId?: string | null;
}

// One thumbnail tile — 80x64 by default, image thumbnails with object-cover,
// colour-coded file-icon tiles for non-images, dark hover overlay with the
// preview action (matching ui-prototypes/pages/ticket-detail.html
// .attach-thumb-box). Broken / expired presigned URLs fall back to the
// file-icon tile. The root is a div acting as a button so the optional delete
// button inside stays valid HTML.
function AttachmentTile({ a, onPreview, onDelete, deleting, tileCls = 'h-16 w-20' }: {
  a: Attachment;
  onPreview: (a: Attachment) => void;
  onDelete?: (a: Attachment) => void;
  deleting?: boolean;
  /** Size classes — the ticket page uses 80x64 (h-16 w-20); comment tiles
   *  are smaller squares (h-14 w-14). */
  tileCls?: string;
}) {
  const [broken, setBroken] = useState(false);
  const isImage = a.mimeType.startsWith('image/') && Boolean(a.url) && !broken;
  const kind = fileKind(a.name, a.mimeType, 20);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPreview(a)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview(a); } }}
      title={`${a.name} · ${formatBytes(a.size)}`}
      className={`group relative ${tileCls} flex-shrink-0 cursor-pointer overflow-hidden rounded-md border border-border bg-surface-sunken transition-colors hover:border-primary/50`}
    >
      {isImage ? (
        <img src={a.url ?? undefined} alt={a.name} onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <span className={`flex h-full w-full items-center justify-center ${kind.cls}`}>{kind.icon}</span>
      )}
      <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-white/20 text-white backdrop-blur-sm">
          <Eye size={12} />
        </span>
      </span>
      {onDelete && (
        <button
          type="button"
          disabled={deleting}
          onClick={e => { e.stopPropagation(); onDelete(a); }}
          title={deleting ? 'Deleting…' : 'Delete'}
          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white transition-colors hover:bg-danger disabled:cursor-wait disabled:opacity-50"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

// Read-only display of already-uploaded attachments (ticket detail page +
// comment cards). Each row/tile opens the shared preview modal (image inline,
// PDF iframe, DOCX via mammoth, fallback card) using a presigned GET URL the
// backend serves in `url`. Preview + download are REFRESHED on open: the URL
// baked into the read payload is only valid for the 15-min presign TTL, so a
// page left open longer would hit an expired link (S3 XML "request has
// expired"). Every click re-mints a fresh URL via
// `GET /attachments/:id/url` just before the modal renders.
export function PersistedAttachmentList({ attachments, variant = 'grid', onDelete, deletingId = null }: PersistedAttachmentListProps) {
  // COMING SOON: S3 attachments disabled. Show a tag instead of tiles — no
  // preview/download calls are made. Re-enable the original render (openPreview
  // + tile grid/inline lists below) when storage lands.
  if (attachments.length > 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] text-text-placeholder">
          {attachments.length} attachment{attachments.length === 1 ? '' : 's'} — coming soon
        </p>
      </div>
    );
  }
  return null;

  // ── Original render (kept for re-enable) ─────────────────────────────────
  // const [preview, setPreview] = useState<{ a: Attachment; url: string | null; downloadUrl: string | null } | null>(null);
  // const previewSeq = useRef(0);
  //
  // async function openPreview(a: Attachment) {
  //   const seq = ++previewSeq.current;
  //   try {
  //     const { data } = await api.get<ApiResponse<{ url: string; downloadUrl: string | null }>>(`/attachments/${a.id}/url`);
  //     if (seq === previewSeq.current) {
  //       setPreview({ a, url: data.data.url, downloadUrl: data.data.downloadUrl });
  //     }
  //   } catch {
  //     if (seq === previewSeq.current) {
  //       setPreview({ a, url: a.url, downloadUrl: a.downloadUrl });
  //     }
  //   }
  // }
  //
  // if (variant === 'inline') { … } // tile lists — see git history
}
