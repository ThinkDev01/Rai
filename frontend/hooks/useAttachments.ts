import { useRef, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import { toast } from 'sonner';
import {
  type AttachmentLimits, type PendingAttachment,
  toPendingAttachment, totalBytes, hasInvalid,
  sha256Hex, contentHashOfUrl,
} from '@/lib/uploads';
import type { AttachmentInput } from '@/types/api.types';

/** A persisted attachment against which new picks are deduped while editing.
 *  Duplicate detection is two-way:
 *    - same NAME           → duplicate (whatever the content);
 *    - same CONTENT (hash) → duplicate (whatever the name).
 *  `url` (the presigned GET) is used best-effort to hash the persisted file
 *  when its size matches a picked file's size. */
export type ExistingAttachmentLike = { id?: string; name: string; size: number; url?: string | null };

// Owns the pending-file list for ONE attachment picker (CreateTicketModal and
// each CommentThread composer gets its own instance). Keeps the add/remove
// cap logic + the presign→PUT→metadata upload flow in one place so the three
// composers don't each re-implement it.
export function useAttachments(
  limits: AttachmentLimits,
  existing: ExistingAttachmentLike[] = [],
) {
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Always-fresh copy of the persisted attachments (ticket/comment being
  // edited) so addFiles blocks re-adding a file whose name OR content already
  // exists on the entity — even when that list changes mid-edit (e.g. a delete
  // refetches it).
  const existingRef = useRef<ExistingAttachmentLike[]>(existing);
  existingRef.current = existing;

  // Cache of content-hashes of the existing attachments that share a size with
  // a picked file. Keyed on the existing list's ids so a refetch (delete, etc.)
  // invalidates it; recomputation is cheap because it only ever hashes the
  // size-colliding files, and presigned GETs for local S3 are fast.
  const existingHashesCache = useRef<{ key: string; hashes: Set<string> }>({ key: '', hashes: new Set() });

  async function existingContentHashes(sizeCandidates: number[]): Promise<Set<string>> {
    const list = existingRef.current;
    const key = list.map(a => a.id ?? `${a.name}:${a.size}`).join('|');
    if (existingHashesCache.current.key !== key) {
      existingHashesCache.current = { key, hashes: new Set() };
      const targets = list.filter(a => a.url && sizeCandidates.includes(a.size));
      const hashes = new Set<string>();
      await Promise.all(
        targets.map(async a => {
          try { hashes.add(await contentHashOfUrl(a.url!)); } catch { /* best-effort — a miss just means "can't tell" */ }
        }),
      );
      existingHashesCache.current.hashes = hashes;
    }
    return existingHashesCache.current.hashes;
  }

  /** Add files from the picker. Invalid files (extension / >10 MB) are KEPT in
   *  the list red-marked so the user sees what's wrong. Files that would break
   *  the count/total caps are rejected with a toast. Duplicate detection is
   *  two-way and runs at pick time:
   *    - already in the pending list (same content hash) → skipped;
   *    - same NAME as an attached file                    → skipped;
   *    - same CONTENT as an attached file (any name)      → skipped.
   *  Each has its own toast so the user knows exactly why a pick was dropped. */
  async function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    // Hash every incoming file (SHA-256 of the bytes) in parallel, then only
    // fetch+hash the existing attachments whose size matches — content can't
    // be equal unless sizes are, so this skips the network for non-colliders.
    const hashed = await Promise.all(
      incoming.map(async f => ({ file: f, hash: await sha256Hex(f) })),
    );
    const sizeCandidates = Array.from(new Set(hashed.map(h => h.file.size)));
    const existingHashes = await existingContentHashes(sizeCandidates);

    setPending(prev => {
      const next = [...prev];
      let dupSkipped = 0;
      let nameSkipped = 0;
      let contentSkipped = 0;
      let rejected = 0;
      for (const { file, hash } of hashed) {
        if (next.some(p => p.hash === hash)) { dupSkipped++; continue; }
        if (existingRef.current.some(a => a.name === file.name)) { nameSkipped++; continue; }
        if (existingHashes.has(hash)) { contentSkipped++; continue; }
        const p = toPendingAttachment(file, limits);
        if (!p.valid) { next.push({ ...p, hash }); continue; }
        const validCount = next.filter(x => x.valid).length;
        if (validCount >= limits.maxFiles) { rejected++; continue; }
        if (totalBytes(next) + file.size > limits.maxTotalBytes) { rejected++; continue; }
        next.push({ ...p, hash });
      }
      if (dupSkipped > 0) {
        toast.info(
          dupSkipped === 1
            ? 'Duplicate file skipped — it\u2019s already in the list'
            : `${dupSkipped} duplicate files skipped — already in the list`,
        );
      }
      if (nameSkipped > 0) {
        toast.info(
          nameSkipped === 1
            ? 'A file with the same name already exists — this file was not added'
            : `${nameSkipped} files skipped — a file with the same name already exists`,
        );
      }
      if (contentSkipped > 0) {
        toast.info(
          contentSkipped === 1
            ? 'A file with the same content already exists — this file was not added'
            : `${contentSkipped} files skipped — a file with the same content already exists`,
        );
      }
      if (rejected > 0) {
        toast.error(
          rejected === 1
            ? 'File not added — attachment limit reached'
            : `${rejected} files not added — attachment limit reached`,
        );
      }
      return next;
    });
  }

  function remove(id: string) {
    setPending(prev => prev.filter(p => p.id !== id));
  }

  /** Paste handler for composer textareas. Extracts file items (a screenshot
   *  copied with Ctrl/Cmd+Shift+S or a file copied in Explorer) out of the
   *  clipboard and feeds them through addFiles — same caps, invalid-marking
   *  and toast behavior as the picker, so a Ctrl+V lands the image in the
   *  pending list exactly as if it were picked. preventDefault stops the raw
   *  binary from being inserted into the textarea as garbage text. Nothing is
   *  uploaded here; the caller's normal submit flow handles that. */
  function handlePaste(e: ReactClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (files.length === 0) return;
    e.preventDefault();
    void addFiles(files);
  }

  function clear() {
    setPending([]);
  }

  /** Presign + PUT every valid file, returning the metadata to send alongside
   *  the entity create/update. Returns null on failure (or if invalid files are
   *  still in the list — the caller's submit gate should prevent that). The
   *  pending list is left intact on failure so the user can retry.
   *
   *  COMING SOON: S3 uploads are disabled until the storage backend is wired
   *  up — no presign call is made and the upload is a no-op returning [].
   *  Re-enable by un-commenting the uploadAttachments branch below. */
  async function upload(
    scope: 'ticket' | 'comment',
    entityId: string | null,
  ): Promise<AttachmentInput[] | null> {
    if (pending.length === 0) return [];
    if (hasInvalid(pending)) {
      toast.error('Remove invalid files before submitting');
      return null;
    }
    // COMING SOON: attachments disabled — skip the presign/upload round trip.
    void scope; void entityId;
    return [];
    // setIsUploading(true);
    // try {
    //   return await uploadAttachments(pending, { scope, entityId });
    // } catch {
    //   toast.error('Upload failed — please try again');
    //   return null;
    // } finally {
    //   setIsUploading(false);
    // }
  }

  return { pending, isUploading, addFiles, remove, clear, upload, handlePaste };
}
