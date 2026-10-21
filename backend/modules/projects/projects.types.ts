import type { OrgRole } from '../../types/common.types';
import type { SprintResponse } from '../sprints/sprints.service';
import type { TicketResponse } from '../tickets/tickets.service';

// ── DB Row Types ──────────────────────────────────────────────────────────────

/** Raw `projects` row. `id` is BIGSERIAL → JS number via pg type parser. */
export interface ProjectRow {
  id: number;
  org_id: string;
  name: string;
  key: string;
  description: string | null;
  visibility: 'public' | 'private';
  archived: boolean;
  /** Avatar style: 'initials' (key letter on colour tile) or 'icon' (preset
   *  gallery icon named by avatar_value). v2 = preset only; uploads are v3. */
  avatar_type: 'initials' | 'icon';
  /** Lucide icon id (e.g. 'rocket') when avatar_type='icon'; NULL otherwise. */
  avatar_value: string | null;
  /** When the project was last archived. NULL when archived = FALSE.
   *  Display deferred to v3; v2 just persists it. */
  archived_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectSummaryRow extends ProjectRow {
  ticket_count: number;
  member_count: number;
  active_sprint_name: string | null;
  last_active: Date;
  /** Whether the requesting user has pinned this project (My Work quick-access). */
  is_pinned: boolean;
}

/**
 * User row joined with their `user_orgs` row for the *current org context*.
 * `role` is the caller-org's role for this user - never the user's role in
 * some other org. Models always pass `org_id` so the JOIN picks the right
 * membership.
 */
export interface OrgMemberRow {
  id: string;
  name: string | null;
  email: string;
  role: OrgRole;
  role_label: string | null;
}

// ── Request body shapes ───────────────────────────────────────────────────────

export interface CreateProjectBody {
  name: string;
  key: string;
  description?: string;
  visibility: 'public' | 'private';
  /** Preset avatar at create time. Defaults to 'initials' (key letter) when
   *  omitted; 'icon' requires avatarValue. Same shape as UpdateProjectBody. */
  avatarType?: 'initials' | 'icon';
  avatarValue?: string | null;
}

export interface UpdateProjectBody {
  name?: string;
  description?: string | null;
  visibility?: 'public' | 'private';
  archived?: boolean;
  /** Preset avatar. 'initials' clears the icon; 'icon' requires avatarValue. */
  avatarType?: 'initials' | 'icon';
  avatarValue?: string | null;
}

// ── Response shapes (match frontend v1 contract exactly) ──────────────────────
//
// MemberResponse keeps the v1 field names `role_type` + `role_name` so the
// frontend Header/Avatar/MemberList code keeps rendering without churn. In v2
// these now source from `user_orgs.role` (role_type) and `user_orgs.role_label`
// (role_name, with a sensible fallback when label is null).

export interface MemberResponse {
  id: string;
  name: string;
  email: string;
  role_type: OrgRole;
  role_name: string;
  initials: string;
}

export interface ProjectResponse {
  id: string;
  name: string;
  key: string;
  description: string | null;
  archived: boolean;
  visibility: string;
  avatarType: 'initials' | 'icon';
  avatarValue: string | null;
  members: MemberResponse[];
  /** Sprints with tickets nested. Matches v1 frontend contract. */
  sprints: SprintResponse[];
  /** Tickets with `sprintId === null`. Matches v1 frontend contract. */
  backlog: TicketResponse[];
  ticketCount: number;
  memberCount: number;
  activeSprintName: string | null;
  lastActive: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummaryResponse {
  id: string;
  name: string;
  key: string;
  description: string | null;
  archived: boolean;
  visibility: string;
  avatarType: 'initials' | 'icon';
  avatarValue: string | null;
  ticketCount: number;
  memberCount: number;
  activeSprintName: string | null;
  lastActive: string;
  /** Creation timestamp — surfaced so list pages can sort "newest first".
   *  Sidebar uses this for its default sort order; the dedicated
   *  /orgs/<slug>/projects page exposes it as a user-pickable sort key. */
  createdAt: string;
  /** Caller's personal pin (My Work quick-access). The projects page floats
   *  pinned projects to the top; only present on the list endpoint. */
  isPinned: boolean;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const ROLE_DISPLAY: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  project_manager: 'Project Manager',
  user: 'Member',
};

function computeInitials(name: string | null, email: string): string {
  const source = (name && name.trim()) ? name.trim() : email;
  const parts = source.split(/\s+/);
  return parts.length === 1
    ? parts[0]![0]!.toUpperCase()
    : (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function orgMemberRowToMember(row: OrgMemberRow): MemberResponse {
  return {
    id: row.id,
    name: row.name ?? row.email,
    email: row.email,
    role_type: row.role,
    role_name: row.role_label ?? ROLE_DISPLAY[row.role],
    initials: computeInitials(row.name, row.email),
  };
}

export function toProjectSummary(row: ProjectSummaryRow): ProjectSummaryResponse {
  return {
    id: String(row.id),
    name: row.name,
    key: row.key,
    description: row.description,
    archived: row.archived,
    visibility: row.visibility,
    avatarType: row.avatar_type,
    avatarValue: row.avatar_value,
    ticketCount: row.ticket_count,
    memberCount: row.member_count,
    activeSprintName: row.active_sprint_name,
    lastActive: row.last_active.toISOString(),
    createdAt: row.created_at.toISOString(),
    isPinned: row.is_pinned,
  };
}

export function buildProjectResponse(
  project: ProjectRow,
  members: OrgMemberRow[],
  sprints: SprintResponse[],
  backlog: TicketResponse[],
  ticketCount: number,
  activeSprintName: string | null,
  lastActive: Date,
): ProjectResponse {
  return {
    id: String(project.id),
    name: project.name,
    key: project.key,
    description: project.description,
    archived: project.archived,
    visibility: project.visibility,
    avatarType: project.avatar_type,
    avatarValue: project.avatar_value,
    members: members.map(orgMemberRowToMember),
    sprints,
    backlog,
    ticketCount,
    memberCount: members.length,
    activeSprintName,
    lastActive: lastActive.toISOString(),
    createdAt: project.created_at.toISOString(),
    updatedAt: project.updated_at.toISOString(),
  };
}
