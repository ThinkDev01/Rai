// Deterministic entity colors — ported from web lib/project.utils.ts.

const PROJECT_PALETTE = ['#6554C0', '#00875A', '#FF5630', '#FF991F', '#00B8D9', '#E91E8C'];
const ORG_PALETTE = ['#403294', '#006644', '#BF2600', '#FF8B00', '#008DA6', '#A5168E'];
const MEMBER_PALETTE = ['#0052CC', '#6554C0', '#00875A', '#FF5630', '#FF991F'];

function sumCharCodes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i);
  return n;
}

export function projectColor(key: string): string {
  if (!key) return PROJECT_PALETTE[0];
  return PROJECT_PALETTE[key.charCodeAt(0) % PROJECT_PALETTE.length];
}

export function orgColor(slug: string): string {
  if (!slug) return ORG_PALETTE[0];
  return ORG_PALETTE[sumCharCodes(slug) % ORG_PALETTE.length];
}

export function memberColor(id: string): string {
  if (!id) return MEMBER_PALETTE[0];
  return MEMBER_PALETTE[sumCharCodes(id) % MEMBER_PALETTE.length];
}

/** Initials from a display name (max 2 chars). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
