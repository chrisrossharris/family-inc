# Family Operating Dashboard

Feltron-inspired operating dashboard for a family-run holding company:
- `chris` (sole proprietor)
- `kate` (sole proprietor)
- `big_picture` (joint venture)

Built with Astro + TypeScript + Tailwind + SQLite/libSQL for deterministic, local-first bookkeeping workflows.

## 1) Architecture Overview

- App framework: Astro SSR (Netlify functions adapter)
- Data layer: libSQL client (`@libsql/client`) with two runtime modes:
  - Local mode: `DATABASE_URL=file:./data/family-ledger.sqlite`
  - Production mode: `TURSO_DATABASE_URL=libsql://...` + `TURSO_AUTH_TOKEN=...`
- Import pipeline: CSV upload -> PapaParse normalization -> row hashing for idempotency -> deterministic rule engine -> transaction inserts
- Categorization: `vendor_rules` table (`exact` | `contains` | `regex`) with retroactive re-application
- Validation: Zod schemas for API/form payloads
- Reporting: SQL aggregation queries for KPIs, burn rate, category/vendor distributions, audit queues
- Exports: CSV endpoints for CPA-ready entity exports + required summaries

Netlify note:
- This project is now Turso-ready. Set Turso env vars in Netlify for durable production persistence.
- If Turso vars are unset, the app uses the local file database.

## 2) File Tree

```txt
.
├─ src/
│  ├─ components/
│  │  └─ BarSpark.astro
│  ├─ layouts/
│  │  └─ BaseLayout.astro
│  ├─ lib/
│  │  ├─ constants.ts
│  │  ├─ types.ts
│  │  ├─ db/
│  │  │  ├─ connection.ts
│  │  │  ├─ schema.ts
│  │  │  └─ seed.ts
│  │  ├─ services/
│  │  │  ├─ categorizer.ts
│  │  │  ├─ deductions.ts
│  │  │  ├─ imports.ts
│  │  │  └─ reports.ts
│  │  └─ utils/
│  │     ├─ csv.ts
│  │     ├─ format.ts
│  │     └─ hashing.ts
│  ├─ pages/
│  │  ├─ index.astro
│  │  ├─ needs-review.astro
│  │  ├─ deductions.astro
│  │  ├─ entity/[entity].astro
│  │  └─ api/
│  │     ├─ import.ts
│  │     ├─ rules.ts
│  │     ├─ deductions.ts
│  │     ├─ transactions-bulk-update.ts
│  │     └─ exports/
│  │        ├─ [entity].csv.ts
│  │        ├─ meals-summary.csv.ts
│  │        ├─ contract-labor-600.csv.ts
│  │        └─ category-breakdown.csv.ts
│  └─ styles/global.css
├─ data/.gitkeep
├─ astro.config.mjs
├─ tailwind.config.mjs
├─ netlify.toml
└─ package.json
```

## 3) Key Workflows

### Import CSV (idempotent)
- Endpoint: `POST /api/import`
- Logic:
  - hashes file (`imports.file_hash`) to prevent duplicate file imports
  - hashes normalized row (`transactions.import_hash`) to prevent duplicate rows
  - flags likely duplicates by vendor+amount within 3 days (`[POTENTIAL DUPLICATE]`, low confidence)

### Deterministic Categorization
- Applies rules in priority order:
  1. `exact`
  2. `contains`
  3. `regex`
- Default fallback:
  - `Other Business Expense (Needs Review)`
  - `confidence = low`
- Inline rule creation:
  - Endpoint: `POST /api/rules`
  - Retroactive apply: enabled by default (`apply_retroactively=1`)

### Deductions
- Endpoint: `POST /api/deductions`
- Types:
  - `home_office`
  - `mileage`
  - `phone`
  - `equipment`
- YTD estimated totals shown per entity on `/deductions`

### Exports
- Entity ledger export:
  - `GET /api/exports/chris.csv`
  - `GET /api/exports/kate.csv`
  - `GET /api/exports/big_picture.csv`
- Additional CPA summaries:
  - `GET /api/exports/meals-summary.csv`
  - `GET /api/exports/contract-labor-600.csv`
  - `GET /api/exports/category-breakdown.csv`

## 4) Styling Notes (Feltron-Inspired)

- Modular grid with visible line system (`.report-grid`)
- Monochrome palette + single accent (`accent` blue)
- Sans UI + mono metrics (`IBM Plex Sans` + `IBM Plex Mono`)
- Strict numeric alignment via `tabular-nums` + right-aligned amount cells
- Dense, table-forward information hierarchy
- Report language embedded in interface:
  - "Period: YTD ..."
  - "Meals deductible at 50%"
  - "Refunds excluded from burn rate"

## 5) Setup Instructions

### Local development

```bash
npm install
cp .env.example .env
npm run db:seed
npm run dev
```

Open `http://localhost:4321` and import your CSV from the Operating Report page.

### Netlify + Turso production

Set these environment variables in Netlify:
- `TURSO_DATABASE_URL=libsql://your-db-name-your-org.turso.io`
- `TURSO_AUTH_TOKEN=your_turso_auth_token`
- `REPORT_YEAR=2025` (or current filing year)

Build + preview:

```bash
npm run build
npm run preview
```

## 6) Future Extensions

1. Bank sync adapters (Plaid/Teller) with deterministic reconciliation layer
2. Auth + role controls (family/admin/CPA views)
3. AI-assisted rule suggestions (kept secondary to deterministic rules)
4. Quarterly and annual snapshot generation (Feltron-style printable reports)
5. Optional read replica/report warehouse for long-range analytics
