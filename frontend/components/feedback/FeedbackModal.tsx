'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { X } from '@/lib/icons';
import { FEEDBACK } from '@/content/feedback';
import { useSubmitFeedback, feedbackError } from '@/hooks/useFeedback';

// Simple feedback modal: a title input + a big body textarea + submit. No page,
// no extra fields. Stores in DB + emails support (backend). Mirrors the app's
// modal pattern (CreateSprintModal).
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody]   = useState('');
  const { mutate, isPending } = useSubmitFeedback();

  const canSubmit = title.trim().length > 0 && body.trim().length >= FEEDBACK.bodyMin;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    mutate(
      { title: title.trim(), body: body.trim() },
      {
        onSuccess: () => { toast.success(FEEDBACK.modal.success); onClose(); },
        onError:   (err) => toast.error(feedbackError(err, FEEDBACK.modal.error)),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget && !isPending) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-text">{FEEDBACK.modal.title}</h2>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 px-6 py-5">
          <p className="text-sm text-text-subtle">{FEEDBACK.modal.subtitle}</p>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">
              {FEEDBACK.modal.titleLabel} <span className="text-danger">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={title}
              maxLength={FEEDBACK.titleMax}
              onChange={e => setTitle(e.target.value)}
              placeholder={FEEDBACK.modal.titlePlaceholder}
              className="rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text">
              {FEEDBACK.modal.bodyLabel} <span className="text-danger">*</span>
            </label>
            <textarea
              value={body}
              maxLength={FEEDBACK.bodyMax}
              onChange={e => setBody(e.target.value)}
              placeholder={FEEDBACK.modal.bodyPlaceholder}
              rows={6}
              className="resize-y rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary scrollbar-subtle"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded border border-border px-4 py-2 text-sm text-text-subtle transition-colors hover:bg-surface disabled:opacity-50"
            >
              {FEEDBACK.modal.cancel}
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isPending}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? FEEDBACK.modal.sending : FEEDBACK.modal.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
