import api from '@/lib/api';
import type { AttachmentInput } from '@/types/api.types';

// S3 presigned-upload helpers shared by the CreateTicketModal and
// CommentThread attachment pickers (both surfaces use AttachmentList).
//
// Flow (locked with the Rai-Backend team, attachments module Phase 1):
//   1. Batch presign — POST /attachments/presign with { scope, entityId,
//      files: [{ name, mimeType, size }] }. The backend validates the whole
//      batch (counts, per-file ≤10 MB, extension allowlist, total) and
//      returns one { key, uploadUrl } per file. Keys are scheme D — STABLE
//      from presign, no entity in the path:
//      orgs/{orgId}/attachments/{uuidv7}.{ext}. The backend DB row is the
//      only linkage; the key never changes (no S3 copy/move). entityId is
//      null for a not-yet-created ticket/comment.
//   2. Upload — each file is PUT straight to its presigned uploadUrl with a
//      RAW fetch (NOT the api axios instance: the presigned URL carries its
//      own auth + headers, and the axios interceptor would stamp a Cognito
//      Authorization header onto an S3 host, corrupting the request).
//   3. Link — the returned { key, name, mimeType, size } array is sent as
//      `attachments` alongside the ticket/comment create/update request, so
//      metadata + entity persist in one call.

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file (locked cap)

// Extension allowlist mirrors the backend attachments validator. Lowercase,
// dot-less. Files with any other extension are rejected client-side with a
// red-mark (kept in the list) so the user can drop them before submit.
export const ALLOWED_EXTENSIONS = [
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico',
  // Documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf',
  'csv', 'json', 'xml', 'yaml', 'yml', 'log',
  // Archives
  'zip', 'rar', '7z', 'tar', 'gz',
  // Media
  'mp4', 'mov', 'webm', 'mp3', 'wav', 'ogg',
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export interface AttachmentLimits {
  /** Max files per entity (ticket 10, comment 5). */
  maxFiles: number;
  /** Per-file cap in bytes (10 MB for both). */
  maxBytesPerFile: number;
  /** Total bytes across all files (ticket 100 MB, comment 50 MB). */
  maxTotalBytes: number;
}

export const TICKET_ATTACHMENT_LIMITS: AttachmentLimits = {
  maxFiles:        10,
  maxBytesPerFile: MAX_FILE_BYTES,
  maxTotalBytes:   100 * 1024 * 1024,
};

export const COMMENT_ATTACHMENT_LIMITS: AttachmentLimits = {
  maxFiles:        5,
  maxBytesPerFile: MAX_FILE_BYTES,
  maxTotalBytes:   50 * 1024 * 1024,
};

/** A file picked but not yet uploaded. Lives in the list while the user is
 *  composing so they can preview/remove before submit. Invalid files (bad
 *  extension or >10 MB) are KEPT in the list with `valid: false` — they get a
 *  red mark + a message under the list, and the submit button stays disabled
 *  until removed or replaced. No alert(). */
export interface PendingAttachment {
  /** Local-only id for React keys while unpersisted. */
  id: string;
  file: File;
  valid: boolean;
  /** Human message shown as the red mark / under-list line when invalid. */
  error?: string;
  /** SHA-256 hex of the file content, computed at pick time. Used for
   *  content-based duplicate detection (two different names, same bytes). */
  hash?: string;
  /** Set once presign + PUT succeed (never null at submit time). */
  uploaded?: AttachmentInput;
}

export type FileValidation =
  | { ok: true }
  | { ok: false; error: string };

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return '';
  return name.slice(idx + 1).toLowerCase();
}

/** Mirror of the backend per-file validation. Size over cap and unknown
 *  extension are the two rejectable cases; everything else passes. */
export function validateFile(file: File, limits: AttachmentLimits): FileValidation {
  const ext = extensionOf(file.name);
  if (!ext || !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, error: `'${file.name}' has an unsupported file type` };
  }
  if (file.size > limits.maxBytesPerFile) {
    return { ok: false, error: `'${file.name}' is exceeding 10 MB` };
  }
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const value = bytes / 2 ** (10 * i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** SHA-256 hex digest of a Blob/File's content. The strong "same content"
 *  signal for duplicate detection — two files with different names but
 *  identical bytes hash identically, regardless of size claim/type. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Content hash of an already-uploaded attachment, fetched via its presigned
 *  GET URL. Used (best-effort, size-filtered + cached by the caller) to detect
 *  a picked file that duplicates an existing attachment's CONTENT under a
 *  different name. Throws on network/fetch failure — callers treat a miss as
 *  "can't tell", never a hard error. */
export async function contentHashOfUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return sha256Hex(await res.blob());
}

let pendingCounter = 0;
export function toPendingAttachment(file: File, limits: AttachmentLimits): PendingAttachment {
  const v = validateFile(file, limits);
  return {
    id: `pending-${++pendingCounter}-${Date.now()}`,
    file,
    valid: v.ok,
    ...(v.ok ? {} : { error: v.error }),
  };
}

export function totalBytes(pending: PendingAttachment[]): number {
  return pending.reduce((sum, p) => sum + p.file.size, 0);
}

export function hasInvalid(pending: PendingAttachment[]): boolean {
  return pending.some(p => !p.valid);
}

/** Per-file validation errors in list order, for the message block above the
 *  attachment list ("'<name>' is exceeding 10 MB" etc.). */
export function invalidMessages(pending: PendingAttachment[]): string[] {
  return pending.filter(p => !p.valid).map(p => p.error ?? `'${p.file.name}' is invalid`);
}

export interface PresignFile {
  name: string;
  mimeType: string;
  size: number;
}

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
}

interface PresignResponse {
  files: PresignedUpload[];
}

/** Step 1 + 2 of the flow — batch-presign the given files, then PUT each one
 *  to its S3 URL with a raw fetch. Returns the metadata to send alongside the
 *  entity create/update. Only valid files are uploaded; callers gate submit on
 *  `hasInvalid()` so in practice everything here is valid. Throws on failure
 *  (caller shows a toast + keeps the pending list for retry). */
export async function uploadAttachments(
  pending: PendingAttachment[],
  opts: { scope: 'ticket' | 'comment'; entityId: string | null },
): Promise<AttachmentInput[]> {
  const valid = pending.filter(p => p.valid && !p.uploaded);
  if (valid.length === 0) return pending.filter(p => p.uploaded).map(p => p.uploaded!);

  const files: PresignFile[] = valid.map(p => ({
    name: p.file.name,
    mimeType: p.file.type || 'application/octet-stream',
    size: p.file.size,
  }));

  const { data } = await api.post<{ data: PresignResponse }>('/attachments/presign', {
    scope: opts.scope,
    entityId: opts.entityId,
    files,
  });

  if (!data?.data?.files || data.data.files.length !== valid.length) {
    throw new Error('Upload presign failed — unexpected response from server');
  }

  const uploaded: AttachmentInput[] = [];
  for (let i = 0; i < valid.length; i++) {
    const item = data.data.files[i]!;
    // Raw fetch on purpose — the presigned URL is self-authenticating and any
    // Authorization/X-Org-Id headers from the api interceptor would corrupt it.
    const res = await fetch(item.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': valid[i]!.file.type || 'application/octet-stream' },
      body: valid[i]!.file,
    });
    if (!res.ok) {
      throw new Error(`Upload of '${valid[i]!.file.name}' failed (${res.status})`);
    }
    uploaded.push({
      key: item.key,
      name: valid[i]!.file.name,
      mimeType: valid[i]!.file.type || 'application/octet-stream',
      size: valid[i]!.file.size,
    });
  }
  return uploaded;
}
