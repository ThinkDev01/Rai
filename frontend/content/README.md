# Rai — Content Folder

Single source of truth for **user-facing copy**. Anything a user reads — marketing headlines, button labels, toast messages, email body text, input placeholders, empty-state lines — lives in this folder, not inline in component JSX.

## Why

Hunting inline strings across 60+ files when marketing wants to tweak a headline is a maintenance trap. Centralizing copy means:
- One place to edit copy without touching component logic
- Easier to scan for tone consistency
- Sets us up for i18n later without a rewrite (the keys already exist)
- Eng changes don't pull in marketing review; copy changes don't pull in eng review

## Convention

TypeScript files (not JSON):
- TS allows comments explaining *when* / *where* a string appears
- IDE auto-complete on keys catches typos at the call site
- Type-safe — `featureGrid.items[0].title` errors if you rename the key
- We can move to locale-keyed JSON later (`en.json`, `es.json`) when i18n becomes a thing — the TS layer becomes the loader

## Files

| File                          | Contains                                                    |
|-------------------------------|-------------------------------------------------------------|
| `marketing.ts`                | Landing page + Pricing page strings (hero, features, workflow, showcase, CTA, nav, footer) |
| `placeholders.ts`             | Input placeholders + empty-state copy across the app        |
| `emails/cognito-verify.html`  | HTML body for Cognito's "Confirm sign-up" message template  |
| `emails/cognito-forgot-password.html` | HTML body for Cognito's "Forgot password" message template |
| `emails/cognito-mfa.html`     | HTML body for Cognito's "MFA code" message template         |
| `emails/README.md`            | AWS Console + SES setup walk-through for branded emails     |

## How to add a new string

1. Pick the right file (or create one if a new domain — `dashboard.ts`, `errors.ts`, etc.).
2. Add the key under the section it belongs to.
3. Import + reference at the call site:
   ```ts
   import { MARKETING } from '@/content/marketing';
   <h1>{MARKETING.hero.headline}</h1>
   ```
4. Don't reach for `t()` or any i18n helper yet — direct property access keeps the code obvious. When i18n lands, we wrap the export in a loader and the call sites don't change.

## What does NOT go here

- Dummy / mockup data used to *illustrate* a product (e.g. the sample kanban cards in `KanbanMockup.tsx`) — those are product simulation, not marketing copy
- Server-side logs / error codes — those live in code, not content
- Validation messages used inside Zod schemas — keep next to the schema for now (move here later if they sprawl)
