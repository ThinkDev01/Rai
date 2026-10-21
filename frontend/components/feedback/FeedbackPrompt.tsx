'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, X } from '@/lib/icons';
import { FEEDBACK } from '@/content/feedback';
import { FeedbackModal } from './FeedbackModal';
import { getTokens } from '@/lib/cognito-client';
import { logger } from '@/lib/logger';

// In-app feedback nudge. Shows a small bottom-right popup card ("Enjoying Rai?
// Give feedback") to users who've used the app for 20+ days, at most once every
// 20 days. Clicking "Give feedback" opens the modal; "Dismiss" hides the card.
// Cadence is tracked in localStorage (per browser) — no backend state:
//   rai.firstSeen          → first time we ever rendered for this browser
//   rai.feedbackLastPrompt → last time we showed the nudge
// Mounted on the dashboard (the main app page).
//
// Rendered as a self-contained fixed card (not a sonner toast) so it always
// shows reliably regardless of toast stacking/timing, and so the layout
// (title + Dismiss + Give feedback buttons) is exactly what we want.

const TWENTY_DAYS = 20 * 24 * 60 * 60 * 1000;
const FIRST_SEEN_KEY = 'rai.firstSeen';
const LAST_PROMPT_KEY = 'rai.feedbackLastPrompt';

function readTs(key: string): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function FeedbackPrompt() {
  // `nudge` = the small card is visible. `modal` = the full feedback form is open.
  const [nudge, setNudge] = useState(false);
  const [modal, setModal] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current || typeof window === 'undefined') return;
    checked.current = true;

    // Only signed-in users get the nudge — feedback submission needs auth, and
    // we never want it on the public marketing / auth pages. (Mounted at the
    // root layout, so this guard is what keeps it app-only.)
    if (!getTokens()) return;

    const now = Date.now();

    // Stamp first-seen once. Until 20 days pass from here, we never nudge.
    let firstSeen = readTs(FIRST_SEEN_KEY);
    if (firstSeen === null) {
      firstSeen = now;
      window.localStorage.setItem(FIRST_SEEN_KEY, String(now));
    }

    const lastPrompt = readTs(LAST_PROMPT_KEY) ?? 0;
    const usedLongEnough = now - firstSeen >= TWENTY_DAYS;
    const dueAgain = now - lastPrompt >= TWENTY_DAYS;
    if (!usedLongEnough || !dueAgain) return;

    // Small delay so it doesn't fire the instant the page loads.
    const t = setTimeout(() => {
      // Stamp now so we don't nag again for another 20 days.
      window.localStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
      logger.info('FeedbackPrompt', 'Showing the 20-day feedback nudge');
      setNudge(true);
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  function openModal() {
    setNudge(false);
    setModal(true);
  }

  return (
    <>
      {nudge && (
        <div
          role="dialog"
          aria-label="Feedback"
          // Fixed bottom-right, above the footer. z above the shell so it
          // floats over page content. Narrow card, design-token styling.
          // `anim-nudge` gives it a springy pop-in (motion-safe; reduced-motion
          // users just get the static card).
          className="anim-nudge fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface-raised p-4 shadow-lg transition-shadow hover:shadow-xl"
        >
          <button
            type="button"
            onClick={() => setNudge(false)}
            aria-label="Dismiss"
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-text-placeholder transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X size={13} />
          </button>

          <div className="flex items-start gap-2.5 pr-5">
            <span className="anim-nudge-icon mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <MessageSquare size={14} />
            </span>
            <p className="text-sm text-text">{FEEDBACK.prompt.text}</p>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setNudge(false)}
              className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover active:scale-95"
            >
              {FEEDBACK.prompt.dismiss}
            </button>
            <button
              type="button"
              onClick={openModal}
              className="rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover hover:scale-105 active:scale-95"
            >
              {FEEDBACK.prompt.action}
            </button>
          </div>
        </div>
      )}

      {modal && <FeedbackModal onClose={() => setModal(false)} />}
    </>
  );
}
