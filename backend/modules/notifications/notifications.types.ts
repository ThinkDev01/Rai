// Shared types for the notifications module. Templates and channels both depend
// on these; the concrete NotificationType union is derived from the template
// registry (templates/index.ts) so it grows automatically as types are added.

export type NotificationChannel = 'inapp' | 'email' | 'push';

/**
 * What a template produces. One template renders for every channel the type
 * supports — in-app (always), email (optional), push (optional). Plain-text-first
 * per dev-notifications.md: `emailText` is the durable fallback; `emailHtml` is optional.
 */
export interface RenderedNotification {
  /** Bell/inbox summary line. Short, no markup. Always required. */
  inappText: string;
  emailSubject?: string;
  emailText?: string;
  emailHtml?: string;
  /**
   * Mobile push copy (FCM display limits: title ≤ ~65, body ≤ ~240 chars). Both
   * optional — the push channel falls back to a generic title + `inappText` as the
   * body, so existing templates push fine without change. Add these to a template
   * only when push deserves bespoke wording.
   */
  pushTitle?: string;
  pushBody?: string;
}

/**
 * A template is a pure function of the caller's `data` (the service injects an
 * `actionUrl` absolute link into `data` before calling, for email CTAs). Data is
 * loosely typed here; each template file casts to its own typed shape.
 */
export type NotificationTemplate = (data: Record<string, unknown>) => RenderedNotification;
