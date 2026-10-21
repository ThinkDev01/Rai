import type { NotificationTemplate } from '../notifications.types';
import { renderEmail } from './layout';

interface OrgMemberRemovedData {
  orgName: string;
}

// System-critical: always email (alwaysEmail in the registry). No link — the
// user no longer has access to the org.
export const orgMemberRemovedTemplate: NotificationTemplate = (raw) => {
  const d = raw as unknown as OrgMemberRemovedData;
  return {
    inappText:    `You were removed from ${d.orgName}`,
    emailSubject: `You've been removed from ${d.orgName}`,
    emailText:    `You've been removed from ${d.orgName}. You no longer have access to its projects.`,
    emailHtml:    renderEmail({
      heading: `You've been removed from ${d.orgName}`,
      body:    [`You've been removed from ${d.orgName}. You no longer have access to its projects.`],
    }),
  };
};
