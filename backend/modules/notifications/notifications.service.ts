import logger from '../../config/logger';
import { REGISTRY, type NotificationType } from './templates';
import { deliverInApp } from './channels/inapp.channel';
import { deliverEmail } from './channels/email.channel';
import { deliverPush } from './channels/push.channel';
import { isPushEnabled } from '../../config/firebase';
import { getUserContact, getOrgSlug, isEmailEnabled } from './notifications.model';

// Absolute base for email CTA links (in-app uses the relative link + joined slug).
const FRONTEND = (process.env['FRONTEND_BASE_URL'] ?? '').replace(/\/+$/, '');

export interface NotifyParams {
  /** Recipient (our internal user UUID). Caller is responsible for not notifying the actor. */
  userId: string;
  type:   NotificationType;
  /** Template payload. The service injects `actionUrl` before rendering. */
  data:   Record<string, unknown>;
  orgId?:   string | null;
  /** Pass the slug if you already have it to skip a lookup; otherwise resolved from orgId. */
  orgSlug?: string | null;
  /** Relative path within the org (e.g. /projects/1/tickets/2) for the bell deep-link. */
  link?:    string | null;
}

/**
 * Single entry point for all notifications (per dev-notifications.md). Called from
 * the SERVICE layer of the triggering module — never the controller or model.
 *
 * Flow: render template → always write the in-app history row → email if the type
 * wants it AND the user hasn't opted out (system-critical types force email) →
 * push (v2 no-op). Every channel failure is contained so a notification can never
 * break the action that triggered it.
 */
export async function notify(p: NotifyParams): Promise<void> {
  // Bulletproof by contract: notify() NEVER throws. It's called from many trigger
  // sites after the real action has already committed, so a notification problem
  // must never bubble up and fail (or roll back) that action. Everything is wrapped.
  try {
    const reg = REGISTRY[p.type];
    if (!reg) {
      logger.error({ route: 'notifications.service', type: p.type, userId: p.userId }, 'No template registered for type - skipping');
      return;
    }

    const orgId = p.orgId ?? null;
    const link = p.link ?? null;
    const wantsEmail = reg.defaultChannels.includes('email');

    // Resolve the org slug once — used by the email CTA (absolute URL) AND the push
    // deep-link. Only looked up when a channel actually needs it (email wants a URL,
    // or push is configured), so in-app-only notifications stay a single write.
    const needsSlug = (wantsEmail && Boolean(FRONTEND)) || isPushEnabled();
    const slug = needsSlug ? (p.orgSlug ?? (orgId ? await getOrgSlug(orgId) : null)) : null;

    // Build an absolute URL for email CTAs only when we'll actually send email.
    let actionUrl = '';
    if (wantsEmail && FRONTEND && slug) actionUrl = `${FRONTEND}/orgs/${slug}${link ?? ''}`;

    const rendered = reg.template({ ...p.data, actionUrl });

    // 1) In-app history row — always written (this IS the inbox/bell record).
    try {
      await deliverInApp({ userId: p.userId, orgId, type: p.type, text: rendered.inappText, link });
    } catch (err) {
      logger.error({ route: 'notifications.service', type: p.type, userId: p.userId, error: (err as Error).message }, 'Failed to write in-app notification');
    }

    // 2) Email — gated by user prefs unless the type forces it (system-critical).
    let emailed = false;
    if (wantsEmail && rendered.emailSubject) {
      const allowed = reg.alwaysEmail || (await isEmailEnabled(p.userId, p.type));
      if (allowed) {
        const contact = await getUserContact(p.userId);
        if (contact?.email) {
          await deliverEmail({
            to: contact.email,
            subject: rendered.emailSubject,
            text: rendered.emailText ?? rendered.inappText,
            ...(rendered.emailHtml ? { html: rendered.emailHtml } : {}),
            userId: p.userId,
            type: p.type,
          });
          emailed = true;
        }
      }
    }

    // 3) Push — mobile FCM. No-op when FCM isn't configured or the user has no
    // registered devices. Mirrors the in-app row; carries type + deep-link in data.
    await deliverPush({
      userId:  p.userId,
      type:    p.type,
      title:   rendered.pushTitle ?? 'Rai',
      body:    rendered.pushBody ?? rendered.inappText,
      link,
      orgSlug: slug,
    });

    logger.info({ route: 'notifications.service', type: p.type, userId: p.userId, orgId, emailed }, 'Notification dispatched');
  } catch (err) {
    logger.error({ route: 'notifications.service', type: p.type, userId: p.userId, error: (err as Error).message }, 'notify() failed - swallowed so it cannot break the triggering action');
  }
}

/**
 * Fan a single notification out to many recipients (e.g. all project members on a
 * sprint completion). De-dupes and isolates failures — one recipient erroring out
 * never blocks the rest.
 */
export async function notifyMany(userIds: string[], p: Omit<NotifyParams, 'userId'>): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  await Promise.all(
    unique.map((userId) =>
      notify({ ...p, userId }).catch((err) => {
        logger.error({ route: 'notifications.service', type: p.type, userId, error: (err as Error).message }, 'notifyMany - per-user dispatch failed');
      }),
    ),
  );
}
