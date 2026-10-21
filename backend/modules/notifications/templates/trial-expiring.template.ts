import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface TrialExpiringData {
  orgName:     string;
  daysLeft:    number;      // 7 or 1
  trialEndsOn: string;      // human-formatted date
  actionUrl:   string;      // billing page
}

export const trialExpiringTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as TrialExpiringData;
  const when = d.daysLeft === 1 ? 'tomorrow' : `in ${d.daysLeft} days`;
  return {
    inappText:    `Your free trial of ${d.orgName} ends ${when} (${d.trialEndsOn}) — add billing to stay active`,
    emailSubject: `Your Rai trial for ${d.orgName} ends ${when}`,
    emailText:
      `Your free trial for ${d.orgName} ends ${when}, on ${d.trialEndsOn}. ` +
      `Add a payment method to keep your organization active — otherwise it switches to read-only.\n\n` +
      `Set up billing: ${d.actionUrl}`,
    emailHtml: renderEmail({
      heading: `Your trial ends ${when}`,
      body: [
        `Your free trial for ${d.orgName} ends ${when} (${d.trialEndsOn}).`,
        `Add a payment method now to keep things running — otherwise the organization switches to read-only when the trial ends. Your data is always kept.`,
      ],
      highlight: `Trial ends ${d.trialEndsOn}`,
      cta: { text: 'Set up billing', url: d.actionUrl },
    }),
  };
};
