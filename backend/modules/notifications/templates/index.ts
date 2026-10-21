// Template registry — the single source of truth for which notification types
// exist, what channels each defaults to, and the human label/category shown in
// Settings → Notifications. The NotificationType union is DERIVED from these
// keys, so adding a type = add a template file + one entry here (per
// dev-notifications.md "Adding a new notification type").

import type { NotificationChannel, NotificationTemplate } from '../notifications.types';
import { ticketAssignedTemplate } from './ticket-assigned.template';
import { ticketCommentNewTemplate } from './ticket-comment-new.template';
import { ticketCommentMentionTemplate } from './ticket-comment-mention.template';
import { ticketStatusChangedTemplate } from './ticket-status-changed.template';
import { ticketDeletedTemplate } from './ticket-deleted.template';
import { ticketCommentEditedTemplate } from './ticket-comment-edited.template';
import { sprintStartedTemplate } from './sprint-started.template';
import { sprintCompletedTemplate } from './sprint-completed.template';
import { sprintArchivedTemplate } from './sprint-archived.template';
import { projectArchivedTemplate } from './project-archived.template';
import { projectUnarchivedTemplate } from './project-unarchived.template';
import { projectDeletedTemplate } from './project-deleted.template';
import { projectMemberAddedTemplate } from './project-member-added.template';
import { projectMemberRemovedTemplate } from './project-member-removed.template';
import { orgRoleChangedTemplate } from './org-role-changed.template';
import { orgMemberRemovedTemplate } from './org-member-removed.template';
import { inviteAcceptedTemplate } from './invite-accepted.template';
import { trialStartedTemplate } from './trial-started.template';
import { trialExpiringTemplate } from './trial-expiring.template';
import { subscriptionExpiredTemplate } from './subscription-expired.template';
import { subscriptionReactivatedTemplate } from './subscription-reactivated.template';
import { subscriptionActivatedTemplate } from './subscription-activated.template';

export interface RegistryEntry {
  template: NotificationTemplate;
  /** Channels attempted by default. In-app is always written regardless; this drives email/push. */
  defaultChannels: NotificationChannel[];
  /** System-critical types email even if the user opted out (e.g. removed-from-org, security). */
  alwaysEmail?: boolean;
  /** Shown as the row label in Settings → Notifications. */
  label: string;
  /** Groups rows in Settings → Notifications. */
  category: string;
}

// `_REGISTRY_DEF` keeps the literal keys (so NotificationType is the exact union);
// `REGISTRY` re-exports it widened to RegistryEntry so the mixed channel arrays
// (['inapp'] vs ['inapp','email']) don't narrow the element type to just 'inapp'.
const _REGISTRY_DEF = {
  ticket_assigned:        { template: ticketAssignedTemplate,      defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'Assigned to a ticket',                category: 'Tickets' },
  ticket_comment_new:     { template: ticketCommentNewTemplate,    defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'New comment on your ticket',          category: 'Tickets' },
  ticket_comment_mention: { template: ticketCommentMentionTemplate, defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'Mentioned in a comment',                category: 'Tickets' },
  ticket_status_changed:  { template: ticketStatusChangedTemplate, defaultChannels: ['inapp'],          alwaysEmail: false, label: 'Status changed on your ticket',       category: 'Tickets' },
  ticket_deleted:         { template: ticketDeletedTemplate,       defaultChannels: ['inapp'],          alwaysEmail: false, label: 'Your ticket was deleted',            category: 'Tickets' },
  ticket_comment_edited:  { template: ticketCommentEditedTemplate, defaultChannels: ['inapp'],          alwaysEmail: false, label: 'A comment on your ticket was edited', category: 'Tickets' },
  sprint_started:         { template: sprintStartedTemplate,       defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'A sprint auto-started',               category: 'Sprints' },
  sprint_completed:       { template: sprintCompletedTemplate,     defaultChannels: ['inapp'],          alwaysEmail: false, label: 'A sprint was completed',             category: 'Sprints' },
  sprint_archived:        { template: sprintArchivedTemplate,      defaultChannels: ['inapp'],          alwaysEmail: false, label: 'A sprint was archived',              category: 'Sprints' },
  project_archived:       { template: projectArchivedTemplate,     defaultChannels: ['inapp'],          alwaysEmail: false, label: 'A project was archived',             category: 'Projects' },
  project_unarchived:     { template: projectUnarchivedTemplate,   defaultChannels: ['inapp'],          alwaysEmail: false, label: 'A project was unarchived',           category: 'Projects' },
  project_deleted:        { template: projectDeletedTemplate,      defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'A project was deleted',              category: 'Projects' },
  project_member_added:   { template: projectMemberAddedTemplate,  defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'Added to a project',                 category: 'Projects' },
  project_member_removed: { template: projectMemberRemovedTemplate, defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'Removed from a project',            category: 'Projects' },
  org_role_changed:       { template: orgRoleChangedTemplate,      defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'Your role in an org changed',        category: 'Membership' },
  org_member_removed:     { template: orgMemberRemovedTemplate,    defaultChannels: ['email'],          alwaysEmail: true,  label: 'Removed from an organization',      category: 'Membership' },
  invite_accepted:        { template: inviteAcceptedTemplate,      defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'Your invite was accepted',           category: 'Membership' },
  trial_started:          { template: trialStartedTemplate,        defaultChannels: ['inapp', 'email'], alwaysEmail: false, label: 'Free trial started',                 category: 'Billing' },
  trial_expiring:         { template: trialExpiringTemplate,       defaultChannels: ['inapp', 'email'], alwaysEmail: true,  label: 'Trial ending soon',                 category: 'Billing' },
  subscription_expired:   { template: subscriptionExpiredTemplate, defaultChannels: ['inapp', 'email'], alwaysEmail: true,  label: 'Subscription ended (read-only)',     category: 'Billing' },
  subscription_reactivated: { template: subscriptionReactivatedTemplate, defaultChannels: ['inapp', 'email'],        alwaysEmail: false, label: 'Subscription reactivated',  category: 'Billing' },
  subscription_activated:   { template: subscriptionActivatedTemplate,   defaultChannels: ['inapp', 'email', 'push'], alwaysEmail: false, label: 'Subscription activated',    category: 'Billing' },
} satisfies Record<string, RegistryEntry>;

/** Union of all registered notification types. Grows automatically with the registry. */
export type NotificationType = keyof typeof _REGISTRY_DEF;

export const REGISTRY: Record<NotificationType, RegistryEntry> = _REGISTRY_DEF;
