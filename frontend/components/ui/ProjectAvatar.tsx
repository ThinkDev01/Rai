/**
 * ProjectAvatar — the single render site for a project's tile across the app
 * (sidebar, projects index, project sidebar identity, settings). Replaces the
 * ad-hoc "colour square + key letter" spans that were duplicated in each place.
 *
 * Tile colour:
 *   - 'initials' (default) → key's first letter on the key-derived colour
 *                            (projectColor), v1 look, unchanged
 *   - 'icon'               → a preset lucide icon on that icon's OWN gradient
 *                            (Jira/Google style — each preset has its own hue)
 *
 * v2 = preset icons only. Custom uploads / org + user avatars are v3, at which
 * point a new mode renders an <img> from a URL — callers won't change.
 */

import { projectColor } from '@/lib/project.utils';
import { PROJECT_ICON_MAP } from '@/lib/projectAvatar';

type Size = 'xs' | 'sm' | 'md' | 'lg';

// Box dims + glyph sizing per slot. Mirrors the dimensions the old inline
// squares used so the swap is visually 1:1 (xs = sidebar 5×5, sm = list 7×7,
// md = grid/identity 9×9, lg = settings header 12×12).
const DIMS: Record<Size, { box: string; icon: number; text: string }> = {
  xs: { box: 'h-5 w-5 rounded',     icon: 12, text: 'text-[10px]' },
  sm: { box: 'h-7 w-7 rounded-md',  icon: 15, text: 'text-xs' },
  md: { box: 'h-9 w-9 rounded-md',  icon: 18, text: 'text-sm' },
  lg: { box: 'h-12 w-12 rounded-lg', icon: 24, text: 'text-lg' },
};

export function ProjectAvatar({
  projectKey,
  avatarType,
  avatarValue,
  archived = false,
  size = 'sm',
  className = '',
}: {
  projectKey: string;
  avatarType?: 'initials' | 'icon' | null;
  avatarValue?: string | null;
  archived?: boolean;
  size?: Size;
  className?: string;
}) {
  const dim = DIMS[size];
  // Resolve the icon only when type is 'icon' AND the id is still in the
  // gallery — a removed/unknown id falls back to the key letter, never a blank.
  const def = avatarType === 'icon' && avatarValue ? PROJECT_ICON_MAP[avatarValue] : undefined;
  const Icon = def?.Icon;
  // Icon tiles wear the icon's own gradient; the initials tile keeps the
  // deterministic key colour so the two modes stay visually distinct.
  const background = def
    ? `linear-gradient(135deg, ${def.gradient[0]}, ${def.gradient[1]})`
    : projectColor(projectKey);

  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center font-bold text-white ${dim.box} ${dim.text} ${archived ? 'opacity-60' : ''} ${className}`}
      style={{ background }}
      aria-hidden
    >
      {Icon ? <Icon size={dim.icon} strokeWidth={2.25} /> : (projectKey[0] ?? '?')}
    </span>
  );
}
