// RBAC helpers — ported from web lib/role.utils.ts + lib/project.utils.ts perms.
import type { OrgRole } from '@/types/auth.types';
import type { Project, UserRole } from '@/types/api.types';

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  project_manager: 'Project Manager',
  user: 'Member',
};

/** Short labels used in invite role pickers. */
export const INVITE_ROLES: { value: Exclude<OrgRole, 'owner'>; label: string; hint: string }[] = [
  { value: 'user', label: 'Member', hint: 'Project work — tickets, comments' },
  { value: 'project_manager', label: 'Project Manager', hint: 'Project-level admin' },
  { value: 'admin', label: 'Admin', hint: 'Full org control + billing' },
];

export function isManagerPlus(role: OrgRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'project_manager';
}
export function isAdminPlus(role: OrgRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Can the caller create a ticket in this project? (web project.utils.ts)
 *  - owner/admin: always
 *  - PM: public project OR private+member
 *  - user: member only
 */
export function canCreateTicketInProject(
  project: Pick<Project, 'visibility' | 'members'>,
  userId: string,
  role: OrgRole | null | undefined,
): boolean {
  if (role === 'owner' || role === 'admin') return true;
  const isMember = project.members.some(m => m.id === userId);
  if (role === 'project_manager') {
    return project.visibility === 'public' || isMember;
  }
  // user
  return isMember;
}

/** Human-readable reason the create-ticket action is blocked, or '' if allowed. */
export function createTicketBlockedReason(
  project: Pick<Project, 'visibility' | 'members' | 'archived'>,
  userId: string,
  role: OrgRole | null | undefined,
): string {
  if (project.archived) return 'Project is archived';
  if (canCreateTicketInProject(project, userId, role)) return '';
  if (role === 'project_manager') return 'Not a member of this private project';
  return 'Not a member of this project';
}

/** Can the caller edit core ticket fields (title/desc/status/type/priority/assignee)? */
export function canEditTicket(
  reporterId: string,
  assigneeId: string | null,
  userId: string,
  role: OrgRole | null | undefined,
): boolean {
  if (isManagerPlus(role)) return true;
  return reporterId === userId || assigneeId === userId;
}

/** Role chip color (filled identity badge). Returns token keys. */
export type RoleChipStyle = { bgKey: 'warning' | 'primary' | 'success' | 'surfaceSunken'; solid: boolean };
export const ROLE_CHIP_STYLE: Record<UserRole, RoleChipStyle> = {
  owner: { bgKey: 'warning', solid: true },
  admin: { bgKey: 'primary', solid: true },
  project_manager: { bgKey: 'success', solid: true },
  user: { bgKey: 'surfaceSunken', solid: false },
};
