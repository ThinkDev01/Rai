# Rai — Backend

Multi-tenant REST API for Rai (Jira-style project / sprint / ticket management). Express 5 + TypeScript on PostgreSQL, with AWS Cognito auth.

## Stack
- **Runtime:** Node + `tsx` — runs TypeScript directly, no build step in prod
- **Framework:** Express 5
- **Database:** PostgreSQL via `pg` (`$1`-style params)
- **Auth:** AWS Cognito (`aws-jwt-verify` + `@aws-sdk/client-cognito-identity-provider`)
- **Email:** AWS SES v2
- **Logging:** pino / pino-http
- **IDs:** UUIDv7
- **Tests:** vitest + supertest

## Quick start
```bash
npm install
cp .env.example .env      # fill RDS + Cognito + SES values; set ENVIRONMENT=dev
npm run migrate           # apply DB migrations
npm run dev               # tsx watch on server.ts
```
Health check: `curl http://localhost:<PORT>/api/health`

## Scripts
| Command | Does |
|---|---|
| `npm run dev` | watch-mode dev server (`tsx watch`) |
| `npm start` | run server (tsx, no build) |
| `npm run build` | `tsc` typecheck/compile |
| `npm run migrate` | apply DB migrations |
| `npm test` | run vitest suite |

## Deploy
Dockerized (`Dockerfile` + `docker-compose.prod.yml`). `.env` is mounted into the container — edit it and `restart` to apply, no rebuild. Full runbook lives in the docs repo: `docs/dev-deployment.md`.
