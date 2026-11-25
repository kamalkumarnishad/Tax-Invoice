# TaxPilot AI

Tax estimates, income and expense tracking, and invoicing for freelancers, remote workers and agencies.

> TaxPilot AI is not a licensed tax advisor. All calculations are estimates and should be verified by a qualified professional.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Drizzle ORM, PostgreSQL, Better Auth.

## Development

Needs Node.js 24.

```bash
npm install
npm run dev
```

No accounts or keys are needed. Without `DATABASE_URL` the app uses an embedded Postgres in `.pglite/` and
applies migrations itself. Without `RESEND_API_KEY` emails, such as verification links, are printed in the
terminal. Both are refused in production: see `.env.example` for what it requires.

| Command | Does |
| --- | --- |
| `npm test` | Unit and integration tests, on an in-memory Postgres |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run db:generate` | Create a migration from schema changes |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |

## Deployment

See `docs/deployment.md`. Pushing to GitHub runs the tests and deploys nothing.

## Daily jobs

`vercel.json` schedules `/api/cron/compliance-reminders` and `/api/cron/exchange-rates` once a day. They need
`CRON_SECRET`, sent as `Authorization: Bearer <secret>`, which Vercel does by itself when the variable is set.

## Tax rules

The rules, their sources and how sure each one is are in `docs/tax-rules-fy-2026-27.md`. In production the calculator
is hidden until a chartered accountant has checked them and the rule set in
`src/server/services/tax-engine/jurisdictions` is marked `approved`, or the owner sets `SHOW_UNREVIEWED_RULES=true`.

## Data access

User data is read and written through `withUser` (`src/lib/db.ts`). It runs each transaction as a restricted
database role, so row level security keeps users apart even if a query forgets its filter. Give every new
user-owned table a policy and a test in `tests/integration/row-level-security.test.ts`.
