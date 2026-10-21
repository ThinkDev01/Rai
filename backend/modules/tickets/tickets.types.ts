import type { OrgRole } from '../../types/common.types';
import type { MemberResponse } from '../projects/projects.types';
import type { AttachmentInput, AttachmentResponse } from '../attachments/attachments.types';

// ── Enum source-of-truth ──────────────────────────────────────────────────────
//
// Locked in v2 - see docs/v2-decisions.md Q13 / v1 migration 011_fix_tickets.
// No customization in v2; new values are a v3+ product call.

export const VALID_TYPES      = ['task', 'bug', 'story', 'epic'] as const;
export const VALID_STATUSES   = ['todo', 'in_progress', 'in_review', 'done'] as const;
export const VALID_PRIORITIES = ['lowest', 'low', 'medium', 'high', 'critical'] as const;

export type TicketType     = typeof VALID_TYPES[number];
export type TicketStatus   = typeof VALID_STATUSES[number];
export type TicketPriority = typeof VALID_PRIORITIES[number];

// ── Type-specific fields (Jira parity, migration 013) ──────────────────────────
//
// Epic color palette - stored as a name key, the frontend maps it to a hex.
// Names (not hexes) keep the stored value portable if the palette is re-toned.
export const EPIC_COLORS = ['slate', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'purple', 'indigo'] as const;
export type EpicColor = typeof EPIC_COLORS[number];

// Field length / range caps (mirrored on the frontend). Story points are a
// non-negative integer; the UI offers a Fibonacci picker but the column accepts
// any 0..STORY_POINTS_MAX so custom scales aren't blocked.
export const EPIC_NAME_MAX        = 60;
export const ENVIRONMENT_MAX      = 255;
export const LONG_TEXT_MAX        = 5000;   // acceptance_criteria + steps_to_reproduce
export const STORY_POINTS_MAX     = 999;

// ── DB Row Types ──────────────────────────────────────────────────────────────

/**
 * Full ticket row including:
 *  - assignee + reporter user fields (LEFT/INNER JOIN users)
 *  - assignee + reporter org-role (JOIN user_orgs for the *current org context*)
 *  - parent ticket key (LEFT JOIN tickets self)
 *
 * Every row carries `org_id` and `project_id` for downstream defensive checks.
 */
export interface TicketRowFull {
  id: number;
  org_id: string;
  project_id: number;
  sprint_id: number | null;
  parent_id: number | null;
  key: string;
  title: string;
  description: string | null;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  // type-specific fields (migration 013) - all nullable
  epic_name: string | null;
  epic_color: string | null;
  story_points: number | null;
  acceptance_criteria: string | null;
  steps_to_reproduce: string | null;
  environment: string | null;
  created_at: Date;
  updated_at: Date;
  // assignee (nullable LEFT JOIN)
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  assignee_role: OrgRole | null;
  assignee_role_label: string | null;
  // reporter (always present - NOT NULL FK)
  reporter_id: string;
  reporter_name: string | null;
  reporter_email: string;
  reporter_role: OrgRole;
  reporter_role_label: string | null;
  // parent ticket key (self-LEFT-JOIN)
  parent_key: string | null;
}

export interface CommentRow {
  id: number;
  org_id: string;
  ticket_id: number;
  user_id: string;
  content: string;
  /** Nullable — NULL = root comment, non-null = reply to that comment.
   *  Single-level threading enforced at the API layer (a reply's parent
   *  must itself be a root). See migration 010 + addCommentHandler. */
  parent_comment_id: number | null;
  created_at: Date;
  updated_at: Date;
  /** NULL = never edited; non-null = the last edit time. Drives the
   *  "edited <time>" label in the UI. See migration 011. */
  edited_at: Date | null;
  /** NULL = live comment; non-null = soft-deleted (content blanked, but the
   *  row is kept so its replies stay threaded beneath it). See migration 027. */
  deleted_at: Date | null;
}

export interface CommentRowWithAuthor extends CommentRow {
  author_name: string | null;
  author_email: string;
  author_role: OrgRole;
  author_role_label: string | null;
}

// ── Request body types ────────────────────────────────────────────────────────

/**
 * Type-specific fields shared by create + update bodies. All optional; the
 * frontend sends only the ones relevant to the ticket's type. On update, `null`
 * clears a field and `undefined` leaves it untouched.
 */
export interface TicketTypeFieldsBody {
  epicName?: string | null;
  epicColor?: string | null;
  storyPoints?: number | null;
  acceptanceCriteria?: string | null;
  stepsToReproduce?: string | null;
  environment?: string | null;
}

/** Snake-cased, DB-facing shape of the type-specific fields - what the
 *  controller hands the model after validation. */
export interface TicketTypeFields {
  epic_name?: string | null;
  epic_color?: string | null;
  story_points?: number | null;
  acceptance_criteria?: string | null;
  steps_to_reproduce?: string | null;
  environment?: string | null;
}

export interface CreateTicketBody extends TicketTypeFieldsBody {
  title: string;
  type: TicketType;
  priority: TicketPriority;
  status?: TicketStatus;
  description?: string;
  assigneeId?: string;
  sprintId?: string;
  parentKey?: string;
  /** Files already PUT to S3 via /attachments/presign. The backend confirms +
   *  links the pending rows to the new ticket. */
  attachments?: AttachmentInput[];
}

export interface UpdateTicketBody extends TicketTypeFieldsBody {
  title?: string;
  description?: string | null;
  type?: TicketType;
  priority?: TicketPriority;
  status?: TicketStatus;
  assigneeId?: string | null;
  sprintId?: string | null;
  /** Reassign parent post-creation. Pass the parent's human key (e.g.
   *  "PROJ-12") or null to clear. Parent must live in the same project;
   *  self-reference rejected. Cycle detection deferred to v3. */
  parentKey?: string | null;
  /** Files already PUT to S3 via /attachments/presign (entityId = this
   *  ticket) that should be confirmed + linked. Optional — sent when the
   *  user adds attachments while editing an existing ticket. */
  attachments?: AttachmentInput[];
}

export interface AddCommentBody {
  content: string;
  /** Optional — when provided, the new comment becomes a reply to this
   *  comment ID. The target must be a root comment in the same ticket
   *  (no replies of replies; controller enforces depth=1). */
  parentCommentId?: string;
  /** User ids the author EXPLICITLY selected from the @-mention dropdown.
   *  Notifications route on these ids only (id-bound, so duplicate display
   *  names route correctly) — a typed-but-unselected `@name` stays inert
   *  text. Validated against project membership at the handler. */
  mentions?: string[];
  /** Files already PUT to S3 via /attachments/presign. Confirmed + linked to
   *  the new comment. */
  attachments?: AttachmentInput[];
}

export interface UpdateCommentBody {
  /** New body text. Threading (parent) and authorship are immutable;
   *  attachments are changeable via the `attachments` field. Author-only at
   *  the handler. */
  content: string;
  /** Same contract as AddCommentBody.mentions. On edit, a selected id whose
   *  name wasn't already in the pre-edit body is treated as newly-mentioned. */
  mentions?: string[];
  /** Files already PUT to S3 via /attachments/presign (entityId = this
   *  comment). Confirmed + linked to the comment. Optional — sent when the
   *  author adds attachments while editing. Removal of existing attachments
   *  is handled by DELETE /attachments/:id, not this payload. */
  attachments?: AttachmentInput[];
}

// ── Response shapes (match v1 frontend contract) ──────────────────────────────

export interface CommentResponse {
  id: string;
  content: string;
  author: MemberResponse;
  /** Stringified parent comment ID, or null for root comments. Frontend
   *  builds the reply tree client-side from the flat list using this. */
  parentCommentId: string | null;
  createdAt: string;
  /** ISO edit time, or null if never edited. Frontend shows an
   *  "edited <time>" label when non-null. */
  editedAt: string | null;
  /** ISO delete time, or null if live. When set, content is blanked and the
   *  UI renders a "comment deleted" placeholder (replies stay threaded). */
  deletedAt: string | null;
  attachments: AttachmentResponse[];
}

export interface TicketResponse {
  id: string;
  key: string;
  title: string;
  description: string | null;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  // type-specific fields (null when not set / not applicable to the type)
  epicName: string | null;
  epicColor: string | null;
  storyPoints: number | null;
  acceptanceCriteria: string | null;
  stepsToReproduce: string | null;
  environment: string | null;
  assignee: MemberResponse | null;
  reporter: MemberResponse;
  parentKey: string | null;
  subTicketKeys: string[];
  comments: CommentResponse[];
  attachments: AttachmentResponse[];
  sprintId: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
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

function buildMember(
  id: string,
  name: string | null,
  email: string,
  role: OrgRole,
  roleLabel: string | null,
): MemberResponse {
  return {
    id,
    name: name ?? email,
    email,
    role_type: role,
    role_name: roleLabel ?? ROLE_DISPLAY[role],
    initials: computeInitials(name, email),
  };
}

export function toCommentResponse(
  row: CommentRowWithAuthor,
  attachments: AttachmentResponse[] = [],
): CommentResponse {
  const deleted = row.deleted_at !== null;
  return {
    id: String(row.id),
    content: deleted ? '' : row.content,
    author: buildMember(row.user_id, row.author_name, row.author_email, row.author_role, row.author_role_label),
    parentCommentId: row.parent_comment_id !== null ? String(row.parent_comment_id) : null,
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at !== null ? row.edited_at.toISOString() : null,
    deletedAt: deleted ? (row.deleted_at as Date).toISOString() : null,
    attachments,
  };
}

export function toTicketResponse(
  row: TicketRowFull,
  subTicketKeys: string[],
  comments: CommentRowWithAuthor[],
  attachments: AttachmentResponse[] = [],
  commentAttachmentsByCommentId: Map<number, AttachmentResponse[]> = new Map(),
): TicketResponse {
  const assignee = row.assignee_id !== null && row.assignee_role !== null
    ? buildMember(row.assignee_id, row.assignee_name, row.assignee_email!, row.assignee_role, row.assignee_role_label)
    : null;
  const reporter = buildMember(row.reporter_id, row.reporter_name, row.reporter_email, row.reporter_role, row.reporter_role_label);

  return {
    id: String(row.id),
    key: row.key,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    priority: row.priority,
    epicName: row.epic_name,
    epicColor: row.epic_color,
    storyPoints: row.story_points,
    acceptanceCriteria: row.acceptance_criteria,
    stepsToReproduce: row.steps_to_reproduce,
    environment: row.environment,
    assignee,
    reporter,
    parentKey: row.parent_key ?? null,
    subTicketKeys,
    comments: comments.map(c => toCommentResponse(c, commentAttachmentsByCommentId.get(c.id) ?? [])),
    attachments,
    sprintId: row.sprint_id !== null ? String(row.sprint_id) : null,
    projectId: String(row.project_id),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
