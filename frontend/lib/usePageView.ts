'use client';

import { useEffect, useRef } from 'react';
import { logger } from './logger';

/**
 * Logs a single "page opened" line when a page component mounts, in the standard
 * frontend shape:  `<PageName> — <message>  ▸ {details}`.
 *
 * Drop it at the top of each page so every page announces itself in the console
 * (instead of only the OrgLayout auth-gate effect firing). Call it
 * unconditionally, before any early return, like any other hook.
 *
 *   usePageView('BoardPage', 'Board page opened', { projectId: id });
 */
export function usePageView(page: string, message: string, details?: Record<string, unknown>): void {
  const logged = useRef(false);
  useEffect(() => {
    // React StrictMode double-invokes mount effects in dev (mount → cleanup →
    // mount on the SAME fiber), which would print this line twice. The ref
    // survives the simulated remount, so we log exactly once per real mount —
    // without disabling StrictMode (it still catches real effect-cleanup bugs).
    if (logged.current) return;
    logged.current = true;
    logger.info(page, message, details);
    // Mount-only: a page is "opened" once. `details` is a snapshot of the route
    // params at mount (always available immediately), so we don't re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
