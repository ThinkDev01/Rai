# Rai — Frontend

Next.js (App Router) UI for Rai. Talks to the Rai backend API; multi-tenant, AWS Cognito auth via direct fetch.

## Stack
- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS v4
- **State:** Zustand + TanStack React Query
- **HTTP:** axios
- **Auth:** AWS Cognito via direct fetch (`lib/cognito-client.ts`) — no Amplify SDK
- **DnD:** dnd-kit · **Toasts:** sonner · **Icons:** lucide-react

## Quick start
```bash
npm install
cp .env.example .env       # set NEXT_PUBLIC_* (Cognito public values + API URL)
npm run dev                # http://localhost:3000
```

## Scripts
| Command | Does |
|---|---|
| `npm run dev` | dev server (HMR) |
| `npm run build` | production build |
| `npm start` | serve production build |
| `npm run typecheck` | `tsc --noEmit` |

## Env note
`NEXT_PUBLIC_*` vars are **baked into the bundle at build time** — changing any value needs a rebuild (`up -d --build`), not just a restart.

## Deploy
Dockerized (`Dockerfile` + `docker-compose.prod.yml`) or Vercel. Full runbook lives in the docs repo: `docs/dev-deployment.md`.
