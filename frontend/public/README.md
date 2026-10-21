# Rai — Asset Inventory

Single source of truth for "where does X live?" so we never have colors in one place and logos in another.

| Asset type          | Location                                | Notes |
|---------------------|-----------------------------------------|-------|
| **Brand assets**    | `frontend/public/brand/`                | Logos, wordmarks, favicon, og-image. Served at `/brand/*`. |
| **Illustrations**   | `frontend/public/illustrations/`        | Real raster/SVG images we add to marketing or product pages. Served at `/illustrations/*`. |
| **Theme tokens**    | `frontend/app/globals.css` → `@theme {}` block + `.dark {}` override | Colors, surfaces, borders, status, ticket types, priorities. Single source — change here to retheme. |
| **Fonts**           | `frontend/app/layout.tsx` (next/font) + `--font-sans` var in `globals.css` | Inter loaded via next/font, exposed as a CSS var. |
| **Icons**           | `frontend/lib/icons.ts` (re-exports lucide) | Components import ONLY from this module. Swap point if we ever change icon libraries. |
| **Animations**      | `frontend/app/globals.css` → keyframes + `.anim-*` utility classes | All landing-page motion. GPU-only (transform/opacity), gated behind `prefers-reduced-motion`. |
| **Logo (inline)**   | `frontend/components/Logo.tsx`          | Stays inline-SVG so it inherits dark-mode color and avoids an HTTP request. |
| **User-facing copy**| `frontend/content/`                     | Marketing/pricing/nav strings, placeholders, empty-state copy, branded email HTML. See `frontend/content/README.md` for conventions. |

## How to add an image
1. Drop the file into `frontend/public/brand/` or `frontend/public/illustrations/`.
2. Reference via root-relative path: `<img src="/brand/wordmark.svg" alt="Rai" />` or `<Image src="/illustrations/empty-state.png" />`.
3. SVGs preferred for logos and decorative graphics (scale + theme-aware via `currentColor`); WebP/AVIF for photos.

## How to add an icon
1. Find it at [lucide.dev](https://lucide.dev).
2. Add an alphabetical export line in `frontend/lib/icons.ts`.
3. Import with `import { IconName } from '@/lib/icons'` — never from `lucide-react` directly.

## How to change the theme
1. Edit a CSS variable in the `@theme {}` block in `frontend/app/globals.css`.
2. If the value differs in dark mode, edit the matching variable in the `.dark {}` override below.
3. No component changes needed — every component reads through CSS vars.
