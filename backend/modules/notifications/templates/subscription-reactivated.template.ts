import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface SubscriptionReactivatedData {
  orgName:   string;
  actionUrl: string;  // billing page
}

export const subscriptionReactivatedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as SubscriptionReactivatedData;
  return {
    inappText:    `${d.orgName} is active again — full access restored.`,
    emailSubject: `${d.orgName} — subscription reactivated`,
    emailText:
      `Good news — your subscription for ${d.orgName} is active again and full access is restored. ` +
      `Thanks for coming back!\n\nManage billing: ${d.actionUrl}`,
    emailHtml: renderEmail({
      heading: `${d.orgName} is active again`,
      body: [
        `Your subscription for ${d.orgName} has been reactivated — full access is restored.`,
        `Thanks for coming back!`,
      ],
      cta: { text: 'Open billing', url: d.actionUrl },
    }),
  };
};
