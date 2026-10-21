import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface TrialStartedData {
  orgName:     string;
  trialDays:   number;
  trialEndsOn: string;  // human-formatted date
  actionUrl:   string;  // billing page
}

export const trialStartedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as TrialStartedData;
  return {
    inappText:    `Your ${d.trialDays}-day free trial of ${d.orgName} has started — ends ${d.trialEndsOn}`,
    emailSubject: `Welcome to Rai — your free trial of ${d.orgName} has started`,
    emailText:
      `Your ${d.trialDays}-day free trial for ${d.orgName} is now active — no card needed. ` +
      `It runs until ${d.trialEndsOn}. Add a payment method anytime to keep things running after that.\n\n` +
      `Manage billing: ${d.actionUrl}`,
    emailHtml: renderEmail({
      heading: `Your free trial has started`,
      body: [
        `Your **${d.trialDays}-day free trial** for **${d.orgName}** is now active — no card needed.`,
        `It runs until **${d.trialEndsOn}**. Add a payment method anytime to keep your organization active after the trial ends.`,
      ],
      highlight: `Trial ends ${d.trialEndsOn}`,
      cta: { text: 'Manage billing', url: d.actionUrl },
    }),
  };
};
