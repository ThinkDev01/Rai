import type { UserRole } from '@/types/api.types';

// Visual treatment for role-type chips. Distinct from the subscription-status
// chip on TWO axes - both hue AND visual weight:
//
//   ROLE chips         = SOLID FILLED badges (bg-X + white text).
//                        Reads as "identity badge" - what you ARE.
//   SUBSCRIPTION chips = OUTLINE+TINTED pills (border + bg/10 + colored text).
//                        Reads as "current state" - what your org is in.
//
// Color overlaps with subscription chips are inevitable (only ~4 semantic
// colors in the palette) but the filled-vs-outline contrast makes them
// visually distinct even when the hue matches. Without this two-axis split
// the admin role chip (blue tint) and the trial subscription chip (blue
// tint) looked indistinguishable.
//
// Owner = amber/warning. The elevated, "gold" GitHub-style owner badge.
// Admin = primary blue. Default elevated tier.
// PM    = success green. The "project-level captain" color.
// User  = neutral gray. Baseline membership.

export const ROLE_CHIP_CLASSES: Record<UserRole, string> = {
  owner:           'border-transparent bg-warning           text-white shadow-sm',
  admin:           'border-transparent bg-primary           text-white shadow-sm',
  project_manager: 'border-transparent bg-success           text-white shadow-sm',
  user:            'border-border      bg-surface-sunken    text-text-subtle',
};

/**
 * Shared base classes for the role-type chip. Combine with the per-role
 * color classes from ROLE_CHIP_CLASSES.
 *
 * Two sizes - default for body lists (Settings, Admin), small for tight
 * chrome (org switcher row beside org name).
 */
export const ROLE_CHIP_BASE      = 'inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium uppercase leading-none';
export const ROLE_CHIP_BASE_SM   = 'inline-flex items-center rounded border px-1 py-px text-[9px] font-medium uppercase leading-none';

/** Convenience: full class string for a chip given a role + size. */
export function roleChipClass(role: UserRole, size: 'sm' | 'md' = 'md'): string {
  const base = size === 'sm' ? ROLE_CHIP_BASE_SM : ROLE_CHIP_BASE;
  return `${base} ${ROLE_CHIP_CLASSES[role]}`;
}
