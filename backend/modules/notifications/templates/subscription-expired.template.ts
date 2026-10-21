import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface SubscriptionExpiredData {
  orgName:   string;
  actionUrl: string;  // billing page
}

export const subscriptionExpiredTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as SubscriptionExpiredData;
  return {
    inappText:    `${d.orgName} is now read-only — your subscription has ended. Reactivate to continue.`,
    emailSubject: `${d.orgName} is now read-only — subscription ended`,
    emailText:
      `Your subscription for ${d.orgName} has ended, so the organization is now in read-only mode. ` +
      `Your data is safe. Reactivate anytime to restore full access.\n\n` +
      `Reactivate: ${d.actionUrl}`,
    emailHtml: renderEmail({
      heading: `${d.orgName} is now read-only`,
      body: [
        `Your subscription for ${d.orgName} has ended, so the organization is now in read-only mode.`,
        `Your data is safe — viewing and export still work. Reactivate anytime to restore full access.`,
      ],
      cta: { text: 'Reactivate subscription', url: d.actionUrl },
    }),
  };
};
