/**
 * Small text-transform helpers shared across the create-form modals.
 *
 * Keep this module dependency-free — it's pulled into client components on
 * every keystroke; a heavier helper (i18n libs, full unicode case maps)
 * would be wasted weight.
 */

/**
 * Capitalize ONLY the first character of a string. Leaves the rest untouched
 * so the user can keep typing in their preferred case (acronyms, mixed-case
 * project names like "iOS Launch", etc.).
 *
 * Used in create modals so a brand-new project / sprint / ticket title
 * always starts with a capital letter without the user having to hit Shift.
 * After creation the rename inputs do NOT auto-capitalize — the user has
 * explicitly chosen the current value and shouldn't be second-guessed.
 *
 *   capitalizeFirst("")       → ""
 *   capitalizeFirst("hello")  → "Hello"
 *   capitalizeFirst("Hello")  → "Hello"
 *   capitalizeFirst("iOS")    → "IOS"  — caller should avoid using it
 *                                         for inputs where Hungarian / camel
 *                                         starts are common.
 *
 * Note: `slice(0, 1)` instead of `[0]` so a leading surrogate pair doesn't
 * split mid-character.
 */
export function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}
