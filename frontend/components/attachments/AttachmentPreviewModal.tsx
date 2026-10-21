'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Download, FileQuestion } from '@/lib/icons';
import { formatBytes } from '@/lib/uploads';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

interface AttachmentPreviewModalProps {
  name: string;
  size: number;
  mimeType: string;
  /** Object URL (pending local file) or presigned GET URL (persisted). */
  url: string | null;
  /** Alternative URL for the Download button — for pending files this is the
   *  object URL of the local File; for persisted files the presigned URL. */
  downloadUrl?: string | null;
  onClose: () => void;
}

interface MammothApi {
  convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}

// Loads mammoth (docx -> html renderer) from CDN on demand — only when a .docx
// is actually previewed, mirroring the ticket-create prototype's script tag.
// Never used for images/pdfs/other types.
let mammothPromise: Promise<MammothApi> | null = null;
function loadMammoth(): Promise<MammothApi> {
  if (!mammothPromise) {
    mammothPromise = new Promise<MammothApi>((resolve, reject) => {
      const win = window as unknown as { mammoth?: MammothApi };
      if (win.mammoth) { resolve(win.mammoth); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      // TODO(security): add `s.integrity = 'sha512-…'` (SRI) or bundle mammoth
      // via npm, so a compromised CDN can't run code in our origin.
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = () => (win.mammoth ? resolve(win.mammoth) : reject(new Error('mammoth unavailable')));
      s.onerror = () => reject(new Error('mammoth failed to load'));
      document.head.appendChild(s);
    });
  }
  return mammothPromise;
}

// Image / PDF / DOCX / file-info preview overlay, matching the ticket-create
// prototype's preview card. Renders in an overlay on the SAME screen — images
// inline, PDFs in an iframe, DOCX converted to HTML via mammoth, everything
// else as a file-info card with a download affordance. Used by the pending
// attachment list (local object URLs) and the read-only persisted lists
// (presigned GET URLs).
export function AttachmentPreviewModal({ name, size, mimeType, url, downloadUrl, onClose }: AttachmentPreviewModalProps) {
  const lowerName  = name.toLowerCase();
  const isImage    = mimeType.startsWith('image/') && !!url;
  const isPdf      = (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) && !!url;
  const isDocx     = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx');

  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [docxError, setDocxError] = useState(false);

  // PDF rendering state. Instead of pointing the iframe straight at the
  // presigned URL (some "PDFs" fail in the browser's built-in viewer — e.g. a
  // file whose bytes are actually HTML mislabelled as application/pdf, which
  // shows a "Failed to load / Reload" error page and traps the user), we fetch
  // the bytes, sniff for the %PDF- magic signature, and only then re-wrap them
  // in a same-origin blob URL with type application/pdf. Files that fail the
  // sniff (real-world case: saved web pages named .pdf) fall back to a
  // download card instead of a broken viewer. The blob is still created for
  // those so Download saves the raw bytes without reopening a viewer. If the
  // fetch itself is blocked (CORS/network), we fall back to the original URL
  // so working PDFs keep working.
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const [pdfBad, setPdfBad] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const pdfBlobRef = useRef<string | null>(null);

  // %PDF-  →  25 50 44 46 2D. A valid PDF must start with these five bytes.
  function isPdfMagic(buf: ArrayBuffer): boolean {
    if (buf.byteLength < 5) return false;
    const sig = new Uint8Array(buf, 0, 5);
    return sig[0] === 0x25 && sig[1] === 0x50 && sig[2] === 0x44 && sig[3] === 0x46 && sig[4] === 0x2d;
  }

  useEffect(() => {
    if (!isPdf || !url) return;
    let cancelled = false;
    setPdfSrc(null);
    setPdfBad(false);
    setPdfLoading(true);
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error('bad status');
        return r.arrayBuffer();
      })
      .then(buf => {
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        pdfBlobRef.current = blobUrl;
        setPdfBlobUrl(blobUrl);
        if (isPdfMagic(buf)) {
          setPdfSrc(blobUrl);
        } else {
          // Bytes aren't a real PDF — don't feed the viewer garbage.
          setPdfBad(true);
        }
      })
      .catch(() => {
        // fetch blocked (CORS/network) — fall back to the direct URL.
        if (cancelled) return;
        setPdfSrc(url);
      })
      .finally(() => { if (!cancelled) setPdfLoading(false); });
    return () => {
      cancelled = true;
      if (pdfBlobRef.current) {
        URL.revokeObjectURL(pdfBlobRef.current);
        pdfBlobRef.current = null;
      }
    };
  }, [isPdf, url]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isDocx || !url) return;
    let cancelled = false;
    setDocxHtml(null);
    setDocxError(false);
    loadMammoth()
      .then(mammoth =>
        fetch(url)
          .then(r => r.arrayBuffer())
          .then(buf => mammoth.convertToHtml({ arrayBuffer: buf })),
      )
      // mammoth does NOT sanitize (a crafted .docx can carry javascript: links),
      // so clean its output before it ever reaches dangerouslySetInnerHTML.
      .then(r => { if (!cancelled) setDocxHtml(sanitizeHtml(r.value)); })
      .catch(() => { if (!cancelled) setDocxError(true); });
    return () => { cancelled = true; };
  }, [isDocx, url]);

  // For PDFs with a successful fetch the blob URL (same-origin) forces a real
  // download instead of opening a browser viewer tab — breaking the
  // "Failed to load → Reload" loop, even for files whose bytes aren't really a
  // PDF (we still create the blob so the raw bytes download cleanly). Anything
  // else keeps the presigned URL.
  const effectiveDownload = isPdf && pdfBlobUrl ? pdfBlobUrl : downloadUrl;

  // Download directly instead of navigating. The download target is either a
  // blob: URL (pending local file / PDF re-wrap) or a presigned URL served with
  // Content-Disposition: attachment (persisted files via `downloadUrl`) — both
  // make the browser SAVE the file. So a plain anchor click with `download` is
  // enough: no fetch, no CORS, and crucially NO `target`, so it never opens a
  // viewer or a new tab.
  function downloadFile(fileName: string, source: string) {
    const a = document.createElement('a');
    a.href = source;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const downloadLink = effectiveDownload ? (
    <button
      type="button"
      onClick={() => downloadFile(name, effectiveDownload)}
      className="flex items-center gap-1 rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text"
      title="Download"
    >
      <Download size={14} />
    </button>
  ) : null;

  function noPreview(kind: string) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <FileQuestion size={40} className="text-text-placeholder" />
        <p className="text-sm font-medium text-text">{name}</p>
        <p className="text-xs text-text-placeholder">{kind}</p>
        {effectiveDownload && (
          <button
            type="button"
            onClick={() => downloadFile(name, effectiveDownload)}
            className="mt-1 flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
          >
            <Download size={12} />
            Download
          </button>
        )}
      </div>
    );
  }

  let body: React.ReactNode;
  if (isImage) {
    body = (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/30 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url!} alt={name} className="max-h-full max-w-full rounded object-contain" />
      </div>
    );
  } else if (isPdf) {
    if (pdfLoading) {
      body = (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <FileQuestion size={40} className="animate-pulse text-text-placeholder" />
          <p className="text-sm text-text-subtle">Loading PDF…</p>
        </div>
      );
    } else if (pdfSrc) {
      body = (
        <div className="flex min-h-0 flex-1 flex-col bg-black/30">
          <iframe src={pdfSrc} title={name} className="h-[70vh] w-full border-none" />
        </div>
      );
    } else if (pdfBad) {
      body = noPreview('This file is not a valid PDF. Use Download to save it.');
    } else {
      body = noPreview('Could not load this PDF. Use Download to save it.');
    }
  } else if (isDocx) {
    if (docxHtml) {
      body = (
        <div
          className="flex-1 overflow-auto px-6 py-4 text-sm leading-relaxed text-text"
          // Safe: docxHtml is already passed through sanitizeHtml (allowlist).
          dangerouslySetInnerHTML={{ __html: docxHtml }}
        />
      );
    } else if (docxError) {
      body = noPreview('Could not render this DOCX file.');
    } else {
      body = (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <FileQuestion size={40} className="animate-pulse text-text-placeholder" />
          <p className="text-sm text-text-subtle">Rendering document…</p>
          {downloadUrl && (
            <button
              type="button"
              onClick={() => downloadFile(name, downloadUrl)}
              className="mt-1 flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
            >
              <Download size={12} />
              Download
            </button>
          )}
        </div>
      );
    }
  } else {
    body = noPreview(`Preview isn't available for ${mimeType || 'this file type'} yet.`);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <FileQuestion size={14} className="text-text-placeholder" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{name}</span>
          <span className="flex-shrink-0 text-xs text-text-placeholder">{formatBytes(size)}</span>
          {downloadLink}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text"
            title="Close preview"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        {body}

        {/* Footer — file + size, matches the prototype's preview-info row */}
        <div className="flex flex-shrink-0 items-center justify-between gap-4 border-t border-border bg-surface-raised px-4 py-2.5 text-xs">
          <span className="min-w-0 truncate text-text-placeholder">
            File: <strong className="text-text">{name}</strong>
          </span>
          <span className="flex-shrink-0 text-text-placeholder">
            Size: <strong className="text-text">{formatBytes(size)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
