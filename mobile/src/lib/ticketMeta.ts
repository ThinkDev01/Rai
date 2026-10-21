// Ticket property metadata — RN adaptation of web lib/ticket.meta.tsx.
// Returns the lucide icon component + label + a theme color-token KEY (so the
// renderer pulls the actual hex from the active theme — light/dark aware).
import {
  Bug,
  BookOpen,
  CheckSquare,
  Zap,
  AlertCircle,
  ChevronUp,
  Minus,
  ChevronDown,
  ChevronsDown,
  type LucideIcon,
} from 'lucide-react-native';
import type { ThemeColors } from '@/theme/tokens';
import type { TicketType, Priority, TicketStatus } from '@/types/api.types';

type ColorKey = keyof ThemeColors;

export const TYPE_META: Record<TicketType, { icon: LucideIcon; label: string; colorKey: ColorKey }> = {
  bug: { icon: Bug, label: 'Bug', colorKey: 'bug' },
  story: { icon: BookOpen, label: 'Story', colorKey: 'story' },
  task: { icon: CheckSquare, label: 'Task', colorKey: 'task' },
  epic: { icon: Zap, label: 'Epic', colorKey: 'epic' },
};

export const PRIORITY_META: Record<Priority, { icon: LucideIcon; label: string; colorKey: ColorKey }> = {
  critical: { icon: AlertCircle, label: 'Critical', colorKey: 'priorityCritical' },
  high: { icon: ChevronUp, label: 'High', colorKey: 'priorityHigh' },
  medium: { icon: Minus, label: 'Medium', colorKey: 'priorityMedium' },
  low: { icon: ChevronDown, label: 'Low', colorKey: 'priorityLow' },
  lowest: { icon: ChevronsDown, label: 'Lowest', colorKey: 'priorityLowest' },
};

export const STATUS_META: Record<
  TicketStatus,
  { label: string; colorKey: ColorKey; subtleKey: ColorKey; dotKey: ColorKey }
> = {
  todo: { label: 'To Do', colorKey: 'textSubtle', subtleKey: 'surfaceSunken', dotKey: 'textPlaceholder' },
  in_progress: { label: 'In Progress', colorKey: 'warning', subtleKey: 'warningSubtle', dotKey: 'warning' },
  in_review: { label: 'In Review', colorKey: 'info', subtleKey: 'infoSubtle', dotKey: 'info' },
  done: { label: 'Done', colorKey: 'success', subtleKey: 'successSubtle', dotKey: 'success' },
};

export const TICKET_TYPES: TicketType[] = ['task', 'bug', 'story', 'epic'];
export const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low', 'lowest'];
export const STATUSES: TicketStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

export const SUBSCRIPTION_META: Record<
  'trial' | 'active' | 'suspended' | 'cancelled',
  { label: string; colorKey: ColorKey }
> = {
  trial: { label: 'Trial', colorKey: 'info' },
  active: { label: 'Active', colorKey: 'success' },
  suspended: { label: 'Suspended', colorKey: 'warning' },
  cancelled: { label: 'Cancelled', colorKey: 'textSubtle' },
};
