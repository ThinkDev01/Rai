'use client';

import { useState, useCallback } from 'react';

// Per-user dismissal list for the dashboard's "another org in your domain"
// banner. Stored in localStorage so dismissal persists across refresh/sessions
// on the same browser. New peer org IDs (not in the dismissed list) re-trigger
// the banner - dismissing one set of peers doesn't suppress future ones.
//
// Per-browser, not per-account: when the user switches devices or clears
// browser data, the banner reappears. That's the right level of stickiness
// for an informational nudge - if you really need cross-device persistence,
// move this to a backend `user_preferences` table later.
//
// Settings page renders the same peer list WITHOUT dismissal handling, so
// users can always look it up there.

function storageKey(userId: string): string {
  return `rai.dismissedDomainPeers.${userId}`;
}

function read(userId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function write(userId: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch { /* quota / disabled - dismissal degrades to ephemeral */ }
}

export function useDismissedDomainPeers(userId: string) {
  const [dismissed, setDismissed] = useState<string[]>(() => read(userId));

  // Merge the supplied IDs into the dismissed set (de-duped via Set).
  const dismiss = useCallback((ids: string[]) => {
    setDismissed(prev => {
      const next = Array.from(new Set([...prev, ...ids]));
      write(userId, next);
      return next;
    });
  }, [userId]);

  // Remove a single ID from the dismissed set. Used by the Pin icon in the
  // Settings peer list - admin pins an org back so the dashboard banner
  // re-fires for THEIR session. Idempotent (no-op if not dismissed).
  const undismiss = useCallback((id: string) => {
    setDismissed(prev => {
      if (!prev.includes(id)) return prev;
      const next = prev.filter(x => x !== id);
      write(userId, next);
      return next;
    });
  }, [userId]);

  // Manually clear all dismissals - exposed in case we add a "show peer
  // banner again" toggle later. Not wired up to UI today.
  const reset = useCallback(() => {
    write(userId, []);
    setDismissed([]);
  }, [userId]);

  return { dismissed, dismiss, undismiss, reset };
}
