/**
 * Project preset-avatar gallery — the single source of truth for the icon
 * picker (project settings) and the renderer (ProjectAvatar component).
 *
 * v2 scope: PRESET ICONS ONLY for projects. No file upload, no S3 — we store an
 * icon *id* string in the DB (projects.avatar_value) and resolve it to a lucide
 * component here. Org + user avatars (and custom uploads) are deferred to v3.
 *
 * Colour: each icon carries its OWN gradient (Jira/Google style) — a distinct,
 * recognisable colour per preset rather than the key-derived initials colour.
 * The renderer paints `gradient` when an icon is chosen; the default
 * (initials) tile still uses the key colour. Curated to ~14 icons so the
 * picker stays a tight, scannable grid with no two presets sharing a hue.
 *
 * Adding an icon:
 *   1. Re-export it from `@/lib/icons` (alphabetical, in the gallery block).
 *   2. Add a `{ id, label, Icon, gradient }` row below. `id` is what lands in
 *      the DB, so it must stay stable — never rename an existing id (it would
 *      orphan every project using it). Use lowercase slug form (a-z, 0-9, -),
 *      matching the backend's avatarValue validation. Pick a `gradient` whose
 *      hue isn't already taken so tiles stay visually distinct.
 */

import {
  Rocket, Target, Zap, Bug, BarChart2, Calendar, BookOpen, Layers,
  Globe, Shield, Code2, Flame, Sparkles, Trophy,
  type LucideIcon,
} from '@/lib/icons';

export interface ProjectIconDef {
  /** Stable DB id (projects.avatar_value). Never rename. */
  id: string;
  /** Tooltip / aria label in the picker. */
  label: string;
  Icon: LucideIcon;
  /** [from, to] stops for the 135° tile gradient — the icon's own colour. */
  gradient: [string, string];
}

/**
 * The full gallery, in display order. ~14 icons spread across the hue wheel so
 * every preset reads as a different colour at a glance.
 */
export const PROJECT_ICONS: ProjectIconDef[] = [
  { id: 'rocket',   label: 'Rocket',   Icon: Rocket,    gradient: ['#8B5CF6', '#6D28D9'] }, // violet
  { id: 'target',   label: 'Target',   Icon: Target,    gradient: ['#F87171', '#DC2626'] }, // red
  { id: 'zap',      label: 'Bolt',     Icon: Zap,       gradient: ['#FBBF24', '#F59E0B'] }, // amber
  { id: 'bug',      label: 'Bug',      Icon: Bug,       gradient: ['#4ADE80', '#16A34A'] }, // green
  { id: 'chart',    label: 'Chart',    Icon: BarChart2, gradient: ['#60A5FA', '#2563EB'] }, // blue
  { id: 'calendar', label: 'Calendar', Icon: Calendar,  gradient: ['#2DD4BF', '#0D9488'] }, // teal
  { id: 'book',     label: 'Book',     Icon: BookOpen,  gradient: ['#FB923C', '#EA580C'] }, // orange
  { id: 'layers',   label: 'Layers',   Icon: Layers,    gradient: ['#F472B6', '#DB2777'] }, // pink
  { id: 'globe',    label: 'Globe',    Icon: Globe,     gradient: ['#22D3EE', '#0891B2'] }, // cyan
  { id: 'shield',   label: 'Shield',   Icon: Shield,    gradient: ['#5B8DEF', '#3457D5'] }, // royal blue
  { id: 'code',     label: 'Code',     Icon: Code2,     gradient: ['#818CF8', '#4F46E5'] }, // indigo
  { id: 'flame',    label: 'Flame',    Icon: Flame,     gradient: ['#FB7185', '#E11D48'] }, // rose
  { id: 'sparkles', label: 'Sparkles', Icon: Sparkles,  gradient: ['#E879F9', '#C026D3'] }, // fuchsia
  { id: 'trophy',   label: 'Trophy',   Icon: Trophy,    gradient: ['#FACC15', '#CA8A04'] }, // gold
];

/** id → full def, for O(1) lookup of icon + gradient in the renderer. */
export const PROJECT_ICON_MAP: Record<string, ProjectIconDef> = Object.fromEntries(
  PROJECT_ICONS.map(def => [def.id, def]),
);
