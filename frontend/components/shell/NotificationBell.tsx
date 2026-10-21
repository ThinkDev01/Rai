'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bell, CheckCheck, Mail, MailOpen, Settings } from '@/lib/icons';
import {
  useUnreadCount,
  useNotificationList,
  useMarkNotificationRead,
  useMarkNotificationUnread,
  useMarkAllNotificationsRead,
  type NotificationItem,
} from '@/hooks/useNotifications';
import { useAuthStore } from '@/store/auth.store';
import { orgRoute } from '@/lib/routes';
import { timeAgo } from '@/lib/time';
import { notificationsCopy } from '@/content/notifications';

// Notification bell + unread badge + dropdown inbox. Mirrors the OrgSwitcher
// dropdown pattern (outside-click + Escape to close). The feed is one per-user
// inbox across all orgs; each row deep-links via its own org slug.

export function NotificationBell({ onOpenChange }: { onOpenChange?: () => void }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const currentSlug = useAuthStore(
    (s) => s.memberships.find((m) => m.org_id === s.user?.currentOrgId)?.org_slug ?? null,
  );
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // True when the feed overflows AND we're not yet scrolled to the bottom — drives
  // the bottom fade hint. Starts false (no hint until we measure overflow).
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const router = useRouter();

  const { data: unread = 0 } = useUnreadCount();
  const { data: list, isLoading, isError } = useNotificationList(open);
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markUnread } = useMarkNotificationUnread();
  const { mutate: markAllRead, isPending: markingAll } = useMarkAllNotificationsRead();

  // Close on outside click + Escape (same as the org switcher).
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Re-measure the bottom-fade hint when the panel opens or the feed changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, [open, list]);

  // Don't render until signed in (no user = no feed).
  if (!userId) return null;

  const items = list?.items ?? [];
  const badge = unread > 9 ? '9+' : String(unread);

  function handleRowClick(n: NotificationItem) {
    if (!n.read_at) markRead(n.id);
    setOpen(false);
    if (n.link && n.org_slug) {
      router.push(orgRoute(n.org_slug, n.link));
    }
  }

  // Hide the bottom fade once the user reaches the end of the feed.
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }

  // Per-row read/unread toggle — stays inside the panel (no navigation, no close).
  function toggleRead(e: ReactMouseEvent, n: NotificationItem) {
    e.stopPropagation();
    if (n.read_at) markUnread(n.id);
    else markRead(n.id);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => { onOpenChange?.(); setOpen((o) => !o); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={notificationsCopy.bell.ariaLabel(unread)}
        title={notificationsCopy.bell.title}
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-text-placeholder transition-colors hover:bg-surface hover:text-text"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl"
        >
          {/* Header row: title + mark-all-read */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold text-text">{notificationsCopy.bell.title}</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                disabled={markingAll}
                className="flex cursor-pointer items-center gap-1 text-xs text-text-subtle transition-colors hover:text-primary disabled:opacity-50"
              >
                <CheckCheck size={13} />
                {notificationsCopy.bell.markAll}
              </button>
            )}
          </div>

          {/* Body — fixed-height scroll area with a bottom fade hint when more rows
              sit below the fold (the fade fades out once scrolled to the end). */}
          <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-96 overflow-y-auto overflow-x-hidden scrollbar-subtle"
          >
            {isLoading ? (
              <p className="px-4 py-6 text-center text-xs text-text-placeholder">Loading…</p>
            ) : isError ? (
              <p className="px-4 py-6 text-center text-xs text-danger">{notificationsCopy.bell.loadError}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-text-placeholder">{notificationsCopy.bell.empty}</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const unreadRow = !n.read_at;
                  return (
                    <li key={n.id} className={`group relative ${unreadRow ? 'bg-primary-subtle/20' : ''}`}>
                      <button
                        type="button"
                        onClick={() => handleRowClick(n)}
                        className="flex w-full cursor-pointer items-start gap-2.5 py-3 pl-4 pr-10 text-left transition-colors hover:bg-surface"
                      >
                        {/* Unread dot — keeps space when read so rows align. */}
                        <span
                          className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${unreadRow ? 'bg-primary' : 'bg-transparent'}`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className={`block break-words text-xs ${unreadRow ? 'font-medium text-text' : 'text-text-subtle'}`}>
                            {n.title}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-text-placeholder">
                            <span>{timeAgo(n.created_at)}</span>
                            {n.org_name && (
                              <>
                                <span aria-hidden>·</span>
                                <span className="truncate">{n.org_name}</span>
                              </>
                            )}
                          </span>
                        </span>
                      </button>

                      {/* Read/unread toggle — Outlook-style envelope. Open envelope =
                          "mark as read" (row is unread); closed = "mark as unread"
                          (row is read). Always visible so it reads as a button. */}
                      <button
                        type="button"
                        onClick={(e) => toggleRead(e, n)}
                        title={unreadRow ? notificationsCopy.bell.markRead : notificationsCopy.bell.markUnread}
                        aria-label={unreadRow ? notificationsCopy.bell.markRead : notificationsCopy.bell.markUnread}
                        className={`absolute right-2 top-2.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-surface hover:text-primary ${unreadRow ? 'text-primary/70' : 'text-text-placeholder'}`}
                      >
                        {unreadRow ? <MailOpen size={14} /> : <Mail size={14} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
            {/* Bottom fade — purely a scroll hint; never blocks clicks. */}
            {hasMoreBelow && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-raised to-transparent"
              />
            )}
          </div>

          {/* Footer: link to the notification settings page (only when an org is
              active — the [slug] is just the active-org context for the route). */}
          {currentSlug && (
            <Link
              href={orgRoute(currentSlug, '/settings/notifications')}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-text-subtle transition-colors hover:bg-surface hover:text-text"
            >
              <Settings size={13} className="text-text-placeholder" aria-hidden />
              <span>{notificationsCopy.bell.settings}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
