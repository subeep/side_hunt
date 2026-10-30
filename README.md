# azentio.ai — Website & Intelligent Collaboration Portal

Public discovery, employee innovation, client collaboration and **governed collective learning**, with access enforced on the server (pages, server actions, APIs and media).

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 (off-white + brown theme) · Drizzle ORM · Postgres (Neon on Vercel; embedded PGlite locally) · email-code sign-in with DB sessions · Vitest.

## Run locally (zero config)
```bash
npm install
npm run dev          # http://localhost:3000, embedded DB in .data/ is created and seeded automatically
npm test             # access-control + workflow acceptance tests (in-memory DB)
npm run db:reset     # wipe the local DB; it re-seeds on next start
```
Open `/demo` and sign in as a seeded persona (DEMO_MODE=1). Real email-code sign-in works too: with no email provider configured, only seeded demo personas get their code shown on screen.

## Deploy to Vercel
1. Push the repo and import it in Vercel.
2. Add a Postgres database from the Vercel Marketplace (Neon). It injects `DATABASE_URL`.
3. Set environment variables (see `.env.example`): `AUTH_SECRET` (long random string), `DEMO_MODE=1` for a judging environment (shows `/demo` persona sign-in; set `0` for production), optionally `RESEND_API_KEY` + `EMAIL_FROM` for real email, `ANTHROPIC_API_KEY` for model-assisted AIRA, `MIN_COHORT_ORGS`.
4. Create the schema and seed once, from your machine:
   ```bash
   vercel env pull .env.local        # or export DATABASE_URL=...
   npm run db:push && npm run db:seed
   ```
5. Deploy. Nothing else is required: no cron, no object storage (synthetic media is stored in the database and served through an authorising route).

## Where things live
See `CLAUDE.md` (architecture, security rules, ownership) and `docs/REQUIREMENTS.md` (the brief's requirements digest).
