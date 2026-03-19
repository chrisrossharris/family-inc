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
- Stripe:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_FAMILY_PLUS` (or `STRIPE_PRICE_ID_FAMILY_PLUS`)
  - `STRIPE_PRICE_FAMILY_PRO` (or `STRIPE_PRICE_ID_FAMILY_PRO`)
  - Optional strict flag: `REQUIRE_STRIPE_BILLING=1`
- Invite email (Resend):
  - `RESEND_API_KEY`
  - `INVITE_FROM_EMAIL` (example: `Family Inc <onboarding@yourdomain.com>`)
  - `APP_BASE_URL` (example local: `http://localhost:4321`)

## Run

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

## Runtime Health + Deploy Smoke Checks

- Public runtime health endpoint:
  - `/api/system/health` (core checks)
  - `/api/system/health?strict=1` (core + billing checks)

Run before deploy:

```bash
npm run env:check
npm run smoke:deploy -- https://your-netlify-site.netlify.app
```

## Deploy to Netlify

1. Connect repo in Netlify.
2. Build command: `npm run db:migrate && npm run build`.
3. Publish directory: `dist`.
4. Add env vars above (Clerk + DB).
5. Run smoke checks:
   - `npm run env:check`
   - `npm run smoke:deploy -- https://<your-site>.netlify.app`
6. Deploy.

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
- `/pricing`

## Member Invite Flow

- Sending an invite creates a `pending` invitation record and attempts Resend delivery.
- When invitee signs in/up using that invited email, pending invites are auto-accepted and workspace membership is created.
- If `RESEND_API_KEY` is missing, invite is still saved in DB but email delivery is skipped.

## Background Imports

- The import form now queues background imports by default (`mode=background`).
- Queue status endpoint:
  - `/api/import-jobs/status?id=<jobId>`
- Worker execution endpoint (internal):
  - `/api/import-jobs/run` (protected by `IMPORT_JOB_SECRET` when set)
- Netlify background function:
  - `/.netlify/functions/import-run-background`

## Stripe Payments (Invoices)

- Internal invoice page can open Stripe Checkout for outstanding balances.
- Webhook endpoint:
  - `/api/stripe/webhook`
- Configure this webhook in Stripe for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
