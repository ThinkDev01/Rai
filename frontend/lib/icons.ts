/**
 * Central icon module - every component imports icons from here, NEVER from
 * `lucide-react` directly. This is the swap point: if we change icon libraries
 * (Heroicons, Phosphor, custom SVGs) later, only this file changes.
 *
 * Pattern stolen from shadcn/ui - keeps the surface tiny and explicit.
 *
 * How to add a new icon:
 *   1. Find it at https://lucide.dev (or the lucide-react package)
 *   2. Add a re-export line below in alphabetical order
 *   3. Import it in your component as `import { IconName } from '@/lib/icons'`
 *
 * How to swap libraries later (when designing themes / brand refresh):
 *   - Replace the right-hand side of each export with the new library's icon
 *   - Component import paths don't change
 *   - Example: `export { HiEye as Eye } from 'react-icons/hi'`
 */

export {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileQuestion,
  RefreshCw,
  // Shell
  LayoutDashboard,
  ClipboardList,
  Users,
  Shield,
  Settings,
  LogOut,
  Menu,
  Moon,
  Sun,
  // Team / invites
  Mail,
  MailOpen,
  UserPlus,
  X,
  Clock,
  Loader2,
  Trash2,
  // Settings sections
  User,
  Lock,
  Building2,
  ArrowRightLeft,
  // Search (Header center + mobile sheet icon)
  Search,
  // Project sidebar (sub-nav + actions)
  Archive,
  Plus,
  FolderOpen,
  Layers,
  List,
  BarChart2,
  LayoutGrid,
  SlidersHorizontal,
  // Settings → Appearance
  Palette,
  // Coming-soon placeholders (billing + notifications)
  CreditCard,
  Bell,
  // Domain-peer banner re-pin (Settings page)
  Pin,
  PinOff,
  // Linked-ticket indicators on board cards (sub-ticket of / has children)
  ArrowUpLeft,
  GitBranch,
  // Board card drag handle (mobile)
  GripVertical,
  // Marketing / landing page
  ArrowRight,
  Zap,
  Sparkles,
  Calendar,
  MessageSquare,
  Target,
  Activity,
  Rocket,
  // Ticket / board / backlog / reports
  AlertCircle,
  ArchiveRestore,
  ArrowUpRight,
  BookOpen,
  Bug,
  CheckCheck,
  CheckCircle2,
  CheckSquare,
  ChevronsDown,
  Copy,
  CornerDownRight,
  Globe,
  Link2,
  Minus,
  Pencil,
  Play,
  Send,
  Ticket,
  UserX,
  // Attachments (pending picker + preview chips)
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
  Upload,
  // Project avatar gallery (preset icons — see lib/projectAvatar.tsx). Custom
  // image upload + org/user avatars are deferred to v3.
  Star,
  Flag,
  Heart,
  Package,
  Compass,
  Briefcase,
  Code2,
  Lightbulb,
  Wrench,
  Cpu,
  Database,
  Cloud,
  Flame,
  Trophy,
  Gem,
  // Devices (API docs — push-device registration)
  Smartphone,
} from 'lucide-react';

// The shared icon component type — re-exported so callers (e.g. the project
// avatar gallery) can type an id→component map without importing lucide-react
// directly, keeping this file the single swap point.
export type { LucideIcon } from 'lucide-react';
