# Family Operating Dashboard

Family Inc finance module built with Astro + TypeScript + Tailwind + Neon Postgres (with optional SQLite/libSQL fallback).

## Stack

- Astro SSR + Netlify adapter
- Dual database adapter:
  - Neon Postgres via `pg` (recommended)
  - libSQL/SQLite via `@libsql/client` (optional fallback)
- Clerk auth (`@clerk/astro`)
- Multi-tenant schema (`tenants`, `users`, `memberships`, `invitations`)

## Auth + Multi-Tenant Flow

- Clerk middleware enforces sign-in for app routes
- Signed-in Clerk user is synced into local `users`
- Workspace tenant is resolved by:
  - Clerk org (if active) -> `org_<clerkOrgId>`
  - otherwise membership/default workspace
- All finance queries are scoped by `tenant_id`

## Environment

Set these in `.env` (local) and Netlify (production):

- `PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `REPORT_YEAR`
- `DATABASE_URL` (Neon Postgres recommended, e.g. `postgresql://...`)
- Optional migration/admin URL:
  - `NETLIFY_DATABASE_URL_UNPOOLED`
  - or `MIGRATIONS_DATABASE_URL`
- Optional Turso:
  - `TURSO_DATABASE_URL`
  - `TURSO_AUTH_TOKEN`
- Background import security:
  - `IMPORT_JOB_SECRET`

## Run

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

## Deploy to Netlify

1. Connect repo in Netlify.
2. Build command: `npm run db:migrate && npm run build`.
3. Publish directory: `dist`.
4. Add env vars above (Clerk + DB).
5. Deploy.

## Routes

- `/sign-in`, `/sign-up`
- `/` Operating report
- `/entity/[entity]`
- `/needs-review`
- `/deductions`
- `/members` (members + invites)
- `/settings`
- `/settings/tenant-health`
- `/annual-report`

## Background Imports

- The import form now queues background imports by default (`mode=background`).
- Queue status endpoint:
  - `/api/import-jobs/status?id=<jobId>`
- Worker execution endpoint (internal):
  - `/api/import-jobs/run` (protected by `IMPORT_JOB_SECRET` when set)
- Netlify background function:
  - `/.netlify/functions/import-run-background`
