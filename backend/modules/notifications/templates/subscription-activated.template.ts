import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface SubscriptionActivatedData {
  orgName:   string;
  actionUrl: string;
}

export const subscriptionActivatedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as SubscriptionActivatedData;
  return {
    inappText:    `${d.orgName} subscription is active — payment received.`,
    emailSubject: `${d.orgName} — subscription activated`,
    emailText:
      `Your subscription for ${d.orgName} is now active and payment has been received. ` +
      `You have full access for the billing period.\n\nManage billing: ${d.actionUrl}`,
    emailHtml: renderEmail({
      heading: `${d.orgName} is now active`,
      body: [
        `Payment received — your subscription for ${d.orgName} is active.`,
        `You have full access for the current billing period.`,
      ],
      cta: { text: 'Open billing', url: d.actionUrl },
    }),
    pushTitle: `Subscription active`,
    pushBody:  `${d.orgName} payment received. Full access is now enabled.`,
  };
};
