// Text helpers — ported from web lib/text.utils.ts

/** Capitalize only the first character; leave the rest untouched. */
export function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Strict email regex — used by the invite-member form (matches web). */
export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}
/** Web login/register email check: contains '@' and '@' is not the last char. */
export function isLooseEmail(s: string): boolean {
  return s.includes('@') && s.indexOf('@') !== s.length - 1;
}
/** Web verify/forgot/reset email check: non-empty and contains '@'. */
export function emailHasAt(s: string): boolean {
  return s.trim().length > 0 && s.includes('@');
}

/** Project key from a name: initials of first words, uppercase, max len. */
export function generateProjectKey(name: string): string {
  const cleaned = name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  const words = cleaned.split(/\s+/).filter(Boolean);
  let key = '';
  if (words.length >= 2) {
    key = words
      .slice(0, 4)
      .map(w => w[0])
      .join('');
  } else {
    key = (words[0] ?? '').slice(0, 4);
  }
  return key.replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'PROJ';
}

/** Org slug from a name: lowercase, diacritic-free, hyphenated. */
export function generateOrgSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
export const ORG_SLUG_RE = /^[a-z][a-z0-9-]{1,49}$/;
