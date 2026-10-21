// Ported verbatim from web Rai-Frontend/types/api.types.ts — keep in sync.

// ── Shared enums ──────────────────────────────────────────────────────────────
export type TicketType = 'task' | 'bug' | 'story' | 'epic';
export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'lowest';
export type TicketStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type SprintStatus = 'active' | 'completed' | 'planned';
export type UserRole = 'owner' | 'admin' | 'project_manager' | 'user';

// ── Core entities ─────────────────────────────────────────────────────────────
export interface Member {
  id: string;
  name: string;
  email: string;
  role_type: UserRole;
  role_name: string;
  initials: string;
  joinedAt?: string | null;
}

export interface Comment {
  id: string;
  content: string;
  author: Member;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Ticket {
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
  sprintId: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  // type-specific fields (null when not applicable to this type)
  story_points?: number | null;
  acceptance_criteria?: string | null;
  steps_to_reproduce?: string | null;
  environment?: string | null;
  epic_name?: string | null;
  epic_color?: string | null;
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
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  archived: boolean;
  visibility: 'public' | 'private';
  avatarType?: 'initials' | 'icon';
  avatarValue?: string | null;
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

export interface ProjectSummary {
  id: string;
  name: string;
  key: string;
  description: string | null;
  archived: boolean;
  visibility: 'public' | 'private';
  avatarType?: 'initials' | 'icon';
  avatarValue?: string | null;
  ticketCount: number;
  memberCount: number;
  activeSprintName: string | null;
  lastActive: string;
  createdAt: string;
  isPinned?: boolean;
}

export type MyWorkTicket = Pick<
  Ticket,
  | 'id'
  | 'key'
  | 'title'
  | 'description'
  | 'type'
  | 'status'
  | 'priority'
  | 'parentKey'
  | 'subTicketKeys'
  | 'comments'
  | 'sprintId'
  | 'projectId'
  | 'createdAt'
  | 'updatedAt'
> & {
  assignee: null;
  reporter: null;
  assigneeName: string | null;
  reporterName: string | null;
  isPinned?: boolean;
};

export interface MyWorkItem {
  ticket: MyWorkTicket;
  project: ProjectSummary;
  sprint: Pick<Sprint, 'id' | 'name' | 'status' | 'startDate' | 'endDate'>;
}

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
  avatarType?: 'initials' | 'icon';
  avatarValue?: string | null;
}
export interface CreateSprintPayload {
  name: string;
  startDate?: string;
  endDate?: string;
}
export interface CreateTicketPayload {
  title: string;
  type: TicketType;
  priority: Priority;
  status?: TicketStatus;
  description?: string;
  assigneeId?: string;
  sprintId?: string;
  parentKey?: string;
  story_points?: number;
  acceptance_criteria?: string;
  steps_to_reproduce?: string;
  environment?: string;
  epic_name?: string;
  epic_color?: string;
}
export interface UpdateTicketPayload {
  title?: string;
  description?: string;
  type?: TicketType;
  priority?: Priority;
  status?: TicketStatus;
  assigneeId?: string | null;
  sprintId?: string | null;
  parentKey?: string | null;
  story_points?: number | null;
  acceptance_criteria?: string | null;
  steps_to_reproduce?: string | null;
  environment?: string | null;
  epic_name?: string | null;
  epic_color?: string | null;
}
export interface UpdateSprintPayload {
  name?: string;
  goal?: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  status?: SprintStatus;
  archived?: boolean;
}
export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  visibility?: 'public' | 'private';
  archived?: boolean;
}

export interface AddCommentPayload {
  content: string;
  parentCommentId?: string;
  mentions?: string[];
}

export interface UpdateCommentPayload {
  content: string;
  mentions?: string[];
}
