'use client';

import type { ReactNode } from 'react';
import { FileImage, FileSpreadsheet, FileText, Paperclip } from '@/lib/icons';

// Extension -> icon/colour map for attachment tiles. Mirrors the ticket-create
// prototype's colour-coded tiles, mapped onto the app's semantic tokens so
// light + dark themes both resolve. Fallback covers the rest of the allowlist
// (archives, code, media, ...) with a neutral paperclip. Shared by the pending
// picker (AttachmentList) and the persisted list (PersistedAttachmentList).
export function fileKind(name: string, type: string, size = 16): { icon: ReactNode; cls: string } {
  const lower = name.toLowerCase();
  if (type.startsWith('image/')) {
    return { icon: <FileImage size={size} />, cls: 'bg-info-subtle text-info' };
  }
  if (lower.endsWith('.pdf')) {
    return { icon: <FileText size={size} />, cls: 'bg-warning-subtle text-warning' };
  }
  if (/\.(doc|docx)$/.test(lower)) {
    return { icon: <FileText size={size} />, cls: 'bg-primary-subtle text-primary' };
  }
  if (/\.(xls|xlsx)$/.test(lower)) {
    return { icon: <FileSpreadsheet size={size} />, cls: 'bg-success-subtle text-success' };
  }
  return { icon: <Paperclip size={size} />, cls: 'bg-surface-sunken text-text-placeholder' };
}
