// Attachments module — types + input caps (mirrored on the frontend
// lib/uploads.ts; keep the two in sync).

export const MAX_FILE_BYTES     = 10 * 1024 * 1024; // 10 MB per file
export const TICKET_MAX_FILES   = 10;
export const COMMENT_MAX_FILES  = 5;
export const TICKET_MAX_TOTAL   = 100 * 1024 * 1024; // 100 MB across files
export const COMMENT_MAX_TOTAL  = 50 * 1024 * 1024;  // 50 MB across files

// Extension allowlist mirrors the frontend. Lowercase, dot-less. Anything else
// is rejected at presign with a 400 so the client's red-marked list matches.
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

export type AttachmentScope = 'ticket' | 'comment';

/** One file the client wants to upload, as sent in the presign body. */
export interface PresignFileInput {
  name: string;
  mimeType: string;
  size: number;
}

export interface PresignRequest {
  scope: AttachmentScope;
  /** Ticket/comment id when it already exists; null for the create flow. */
  entityId: string | null;
  files: PresignFileInput[];
}

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
}

/** One attachment as returned in ticket/comment payloads (read path). */
export interface AttachmentResponse {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Presigned GET URL (serves preview + download), valid for the presign TTL
   *  (15 min default). Refresh before use via `GET /attachments/:id/url`.
   *  Mirrors the frontend `Attachment.url` field. */
  url: string;
  /** Presigned GET URL with `Content-Disposition: attachment` — the Download
   *  button uses this (via a plain anchor, no CORS/new-tab needed). Null only
   *  if presigning for download failed. */
  downloadUrl: string | null;
  uploaderId: string;
  createdAt: string;
  /** Last time the file's linkage/metadata was touched (re-confirm/update).
   *  Null until first attach; equal to createdAt for untouched files. */
  updatedAt: string | null;
}

/** Mirrors the frontend AttachmentInput — echoed back on the create request. */
export interface AttachmentInput {
  key: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface AttachmentRow {
  id: string;
  org_id: string;
  ticket_id: number | null;
  comment_id: number | null;
  uploader_id: string;
  name: string;
  mime_type: string;
  size: number;
  key: string;
  status: 'pending' | 'confirmed';
  created_at: string;
  confirmed_at: string | null;
  updated_at: string | null;
}

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return '';
  return name.slice(idx + 1).toLowerCase();
}

/** Stable S3 key (scheme D) — orgs/{orgId}/attachments/{uuidv7}.{ext} */
export function buildKey(orgId: string, id: string, ext: string): string {
  const safeExt = /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
  return `orgs/${orgId}/attachments/${id}.${safeExt}`;
}
