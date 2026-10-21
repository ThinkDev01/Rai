// ── Shared enums ──────────────────────────────────────────────────────────────

export type TicketType   = 'task' | 'bug' | 'story' | 'epic';
export type Priority     = 'critical' | 'high' | 'medium' | 'low' | 'lowest';
export type TicketStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type SprintStatus = 'active' | 'completed' | 'planned';
// 'owner' is v2-only — the new top-tier org role from docs/rbac.md. v1 didn't
// have it, but the type is shared with org RBAC display so it lands here.
export type UserRole     = 'owner' | 'admin' | 'project_manager' | 'user';

// ── Core entities ─────────────────────────────────────────────────────────────

export interface Member {
  id: string;
  name: string;
  email: string;
  role_type: UserRole;
  role_name: string;
  initials: string;
  /** ISO timestamp from `user_orgs.joined_at`. Populated when the Member
   *  is built via the team-members adapter (`useTeam`); legacy callers
   *  that synthesize Member from project rows leave it undefined. The
   *  team page sorts by it. */
  joinedAt?: string | null;
}

/** A file linked to a ticket or comment. The UI never uploads bytes here —
 *  it presigns an S3 PUT, uploads directly to the bucket, then sends this
 *  metadata in the create/update request so the backend can link a row. */
export interface Attachment {
  id: string;
  /** Original filename — kept for display + download-as. */
  name: string;
  /** Content type sent to S3 at upload time. */
  mimeType: string;
  /** Bytes. Per-file cap is 10 MB (see lib/uploads.ts); size drives the
   *  attachment list counters + totals. */
  size: number;
  /** S3 object key (scheme D — stable from presign, no entity in the path:
   *  orgs/{orgId}/attachments/{uuidv7}.{ext}. The backend DB row is the only
   *  linkage; the key never changes, no copy/move ever happens). */
  key: string;
  /** Presigned GET URL for preview, valid for the presign TTL (15 min
   *  default) — it can expire while a page sits open. Refreshed on demand via
   *  `GET /attachments/:id/url` right before the preview modal opens. Null
   *  until the backend serves a detail payload that populates it. */
  url: string | null;
  /** Presigned GET URL served with `Content-Disposition: attachment` — the
   *  Download button uses this so the browser saves the file directly instead
   *  of opening a viewer/new tab. Same TTL as `url`; refreshed together. Null
   *  for pending files (which use a local object URL). */
  downloadUrl: string | null;
  uploaderId: string;
  createdAt: string;
  /** Last time the file's linkage/metadata was touched (re-confirm/update).
   *  Null until first attach; equal to createdAt for untouched files. */
  updatedAt: string | null;
}

/** Client→backend payload for a file already PUT to S3. Sent alongside the
 *  ticket/comment create/update so one request links all metadata. */
export interface AttachmentInput {
  key: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface Comment {
  id: string;
  content: string;
  author: Member;
  /** Single-level threading — root comments have null; replies carry the
   *  id of the root comment they're answering. Replies-of-replies are
   *  rejected by the backend (depth ≤ 1). */
  parentCommentId: string | null;
  createdAt: string;
  /** ISO edit time, or null if never edited. UI shows an "edited <time>"
   *  label when non-null. */
  editedAt: string | null;
  /** ISO delete time, or null if live. When set, content is blanked and the
   *  UI renders a "comment deleted" placeholder (replies stay threaded). */
  deletedAt: string | null;
  /** Files attached to this comment (v2 attachments). */
  attachments: Attachment[];
}

// Epic color palette (matches backend EPIC_COLORS). Stored as a name key;
// EPIC_COLOR_HEX maps it to a swatch. See lib/ticket.meta.tsx for usage.
export const EPIC_COLORS = ['slate', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'purple', 'indigo'] as const;
export type EpicColor = typeof EPIC_COLORS[number];

// Field caps mirrored from backend (tickets.types.ts) so the UI can validate
// before the round-trip.
export const EPIC_NAME_MAX    = 60;
export const ENVIRONMENT_MAX  = 255;
export const LONG_TEXT_MAX    = 5000;
export const STORY_POINTS_MAX = 999;

/** Type-specific ticket fields (Jira parity). Null = unset / not applicable. */
export interface TicketTypeFields {
  epicName: string | null;
  epicColor: string | null;
  storyPoints: number | null;
  acceptanceCriteria: string | null;
  stepsToReproduce: string | null;
  environment: string | null;
}

export interface Ticket extends TicketTypeFields {
  id: string;
  key: string;
  title: string;
  description: string | null;
  type: TicketType;
  status: TicketStatus;
  priority: Priority;
  assignee: Member | null;
  reporter: Member;
  parentKey: string | null;
  subTicketKeys: string[];
  comments: Comment[];
  /** Files attached to this ticket (v2 attachments). */
  attachments: Attachment[];
  sprintId: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: string;
  name: string;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  goal: string | null;
  notes: string | null;
  projectId: string;
  tickets: Ticket[];
  /** ISO string when archived, null when not. Display deferred to v3;
   *  v2 uses presence to filter sprint lists into active vs Archive page. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Full project — used on detail/board/backlog/reports pages
export interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  archived: boolean;
  visibility: 'public' | 'private';
  /** Preset avatar: 'initials' (key letter on colour tile) or 'icon' (gallery
   *  icon named by avatarValue). v2 = preset only; uploads are v3. */
  avatarType: 'initials' | 'icon';
  avatarValue: string | null;
  members: Member[];
  sprints: Sprint[];
  backlog: Ticket[];
  ticketCount: number;
  memberCount: number;
  activeSprintName: string | null;
  lastActive: string;
  createdAt: string;
  updatedAt: string;
}

// Lightweight summary — used in sidebar + dashboard list
export interface ProjectSummary {
  id: string;
  name: string;
  key: string;
  description: string | null;
  archived: boolean;
  visibility: 'public' | 'private';
  avatarType: 'initials' | 'icon';
  avatarValue: string | null;
  ticketCount: number;
  memberCount: number;
  activeSprintName: string | null;
  lastActive: string;
  /** Creation timestamp — drives "newest first" sort on the sidebar and
   *  the dedicated /orgs/<slug>/projects page. */
  createdAt: string;
  /** Caller's personal pin (My Work quick-access). Present on the `/projects`
   *  list endpoint, which floats pinned projects to the top. Optional because
   *  the MyWorkItem.project sub-object doesn't carry it. */
  isPinned?: boolean;
}

/**
 * MyWorkItem — lightweight projection used by `/me/tickets` and
 * `/users/:id/tickets`. The backend returns the ticket with `assignee` and
 * `reporter` stripped (the My-Work page renders names from sibling fields
 * instead, and full assignee/reporter Member objects are only built on the
 * ticket detail page). Caller-visible name strings are surfaced as
 * `assigneeName` / `reporterName` so the row UI doesn't have to fall back
 * through additional fetches.
 */
export type MyWorkTicket = Pick<
  Ticket,
  'id' | 'key' | 'title' | 'description' | 'type' | 'status' | 'priority'
       | 'parentKey' | 'subTicketKeys' | 'comments' | 'sprintId' | 'projectId'
       | 'createdAt' | 'updatedAt'
> & {
  assignee: null;
  reporter: null;
  assigneeName: string | null;
  reporterName: string | null;
  /** Caller's personal pin — My Work floats pinned tickets to the top. */
  isPinned: boolean;
};

export interface MyWorkItem {
  ticket: MyWorkTicket;
  project: ProjectSummary;
  sprint: Pick<Sprint, 'id' | 'name' | 'status' | 'startDate' | 'endDate'>;
}

// Ticket search result — includes enough project context to build the link
export interface SearchResult {
  id: string;
  key: string;
  title: string;
  type: TicketType;
  status: TicketStatus;
  priority: Priority;
  assignee: Member | null;
  projectId: string;
  projectName: string;
  projectKey: string;
}

// ── Report types ─────────────────────────────────────────────────────────────

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export interface BurndownData {
  points: BurndownPoint[];
  startDate: string;
  endDate: string;
  totalTickets: number;
}

export interface SprintReportTicket {
  id: number;
  key: string;
  title: string;
  type: TicketType;
  status: TicketStatus;
  priority: Priority;
  assignee_name: string | null;
}

export interface SprintReportData {
  sprintName: string;
  sprintStatus: SprintStatus;
  startDate: string;
  endDate: string;
  completed: SprintReportTicket[];
  incomplete: SprintReportTicket[];
  removed: SprintReportTicket[];
}

export interface VelocityPoint {
  sprintId: number;
  sprintName: string;
  committed: number;
  completed: number;
  status: string;
}

// ── API response wrapper ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ── Mutation payloads ─────────────────────────────────────────────────────────

export interface CreateProjectPayload {
  name: string;
  key: string;
  description?: string;
  visibility: 'public' | 'private';
  /** Preset avatar chosen at create time. Omit (or 'initials') to keep the
   *  default key-letter tile; 'icon' requires avatarValue (a gallery id). */
  avatarType?: 'initials' | 'icon';
  avatarValue?: string | null;
}

export interface CreateSprintPayload {
  name: string;
  startDate: string;
  endDate: string;
}

/** Type-specific fields on create/update payloads. All optional; send only the
 *  ones the ticket's type owns. `null` clears, `undefined` leaves untouched. */
export interface TicketTypeFieldsPayload {
  epicName?: string | null;
  epicColor?: string | null;
  storyPoints?: number | null;
  acceptanceCriteria?: string | null;
  stepsToReproduce?: string | null;
  environment?: string | null;
}

export interface CreateTicketPayload extends TicketTypeFieldsPayload {
  title: string;
  type: TicketType;
  priority: Priority;
  status?: TicketStatus;
  description?: string;
  assigneeId?: string;
  sprintId?: string;    // omit or undefined = goes to backlog
  parentKey?: string;   // omit or undefined = no parent (top-level ticket)
  /** Files the caller already PUT to S3; linked to the new ticket in the
   *  same create request. Optional — omitted when no files were picked. */
  attachments?: AttachmentInput[];
}

export interface UpdateTicketPayload extends TicketTypeFieldsPayload {
  title?: string;
  description?: string;
  type?: TicketType;
  priority?: Priority;
  status?: TicketStatus;
  assigneeId?: string | null;
  sprintId?: string | null;  // null = move to backlog
  /** Reassign parent post-creation. Pass the parent's human key (e.g.
   *  "PROJ-12") or null to clear. Backend resolves to FK + validates. */
  parentKey?: string | null;
  /** Files the caller already PUT to S3, confirmed + linked to the ticket on
   *  this update. Omitted when no new files were picked while editing. */
  attachments?: AttachmentInput[];
}

export interface UpdateSprintPayload {
  name?: string;
  goal?: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  status?: SprintStatus;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  visibility?: 'public' | 'private';
  /** Preset avatar. Sent as a pair: 'initials' clears the icon, 'icon' needs a
   *  valid gallery id in avatarValue. */
  avatarType?: 'initials' | 'icon';
  avatarValue?: string | null;
}

/** Sensitive actions that require an email-OTP before they execute. Mirrors the
 *  backend allowlist (backend modules/otp/otp.types.ts). */
export type OtpAction = 'delete_org' | 'transfer_ownership' | 'delete_project' | 'cancel_subscription';

export interface RequestActionOtpPayload {
  action: OtpAction;
  /** The entity the action targets — org id or project id, as a string. */
  targetId: string;
}
