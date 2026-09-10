# MathTutor

Local-first math practice (Next.js 14 + TypeScript + Tailwind). The curriculum is grade-4 with
grade-5 areas that unlock as a kid graduates each domain. Each kid gets an isolated profile:
progress, points wallet, adaptive plan, daily quest and prize history all persist per-profile in
`localStorage` (`mt.p.<kid-id>.*`). No account and no backend are needed to play.

## Run / dev

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (must pass before push)
npm start        # serve the production build
```

Checks (all must be green):

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint (config: .eslintrc.json)
npm test            # tsx --test over tests/**/*.test.ts and src/**/__tests__/**/*.test.ts
npm run verify      # typecheck + lint + test + build, in that order
```

Extras: `npm run lint:fix`, `npm run format` / `npm run format:check` (Prettier), `npm run
test:watch`, `npm run clean`. Node `>= 20.9` is required (`engines`).

## Supabase (optional, not required to play)

Local-first works with zero env vars. The schema exists but is **not wired to any screen**
(`src/lib/db/client.ts` exports the clients; nothing calls them):

1. Copy `.env.example` to `.env.local` and fill values from the Supabase dashboard.
2. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are browser-safe (RLS still
   applies). `SUPABASE_SERVICE_ROLE_KEY` is **server-only**: no `NEXT_PUBLIC_` prefix, never
   commit it, never send it to the browser.
3. Schema, triggers and RLS policies live in `supabase/migrations/0001_init.sql` — 12 tables
   (`users`, `student_profiles`, `skills`, `student_skill_mastery`, `assignments`,
   `assignment_items`, `problems`, `attempts`, `daily_topics`, `achievements`,
   `student_achievements`, `admin_notes`). Seed data is in `supabase/seed.sql` (the 45 grade-4
   skills, one demo student, 3 achievements). Row types mirror the migration in
   `src/lib/db/types.ts`; details in `docs/DATABASE.md`.

## AI word problems (optional)

`src/lib/ai/provider.ts` is **server-only** — it imports `server-only`, so importing it from a
`"use client"` component fails the build instead of leaking keys.

- `AI_PROVIDER` unset → deterministic mock/template wording (default; tests use this).
- Live vendor: set `AI_PROVIDER=http` plus `AI_ENDPOINT` + `AI_API_KEY` (and optional
  `AI_MODEL`) for the generic HTTP adapter. All four vars are documented in `.env.example`.
- Grading invariant: `src/lib/math/grading.ts` grades against the math engine's canonical
  answer only — the provider supplies narrative wording, validated by
  `isNumericAnswerValid()`, with a template fallback so generation never throws.

## Profiles, migration, backup

- `/profiles` is the kid picker (photo ≤256px / ≤300KB, optional 4-digit PIN gate, grown-up
  math gate on delete). `/` redirects there when no profile is active; switching kids remounts
  Home so all state reloads for that kid.
- One-time migration: pre-profile `mt.*` keys are adopted into the first profile exactly once
  (`migrateLegacyOnce`, flag-guarded); legacy keys are kept as backup.
- Backup: Export downloads one JSON (`profiles` + per-profile payloads + legacy snapshot);
  Import restores it. Lives on `/profiles` (and `/profile`). Photos and progress save **on this
  device only** — export a backup before an iPad wipe.
- Storage map: the prize **catalog** is parent-global; each kid's **redemption history** is
  per-profile.
- **Known backup gap:** `BACKUP_SUFFIXES` in `src/lib/profile/store.ts` covers
  `assignment.v1`, `lastResult.v1`, `progress.v1`, `newBadges.v1`, `points.v1` and
  `planSession.v2`. Four per-kid suffixes are **not** in the JSON backup yet — `quest.v1`,
  `gradeOverrides.v1`, `celebratedGraduations.v1` and `redemptions.v1` — so that state survives
  only in device storage until they join the backup set.

## Daily quest + grade unlocks

- Today shows one fixed Daily Quest per kid per day (same quest all day, locked at first start).
  Finishing it pays the quest bonus + advances the streak; anything else is extra practice
  (stars still count, streak frozen). Missed days expire — no backlog.
- `/plan` tracks the grade climb: acing a domain's grade-4 skills graduates it (fanfare +
  celebration) and opens its grade-5 games; 3 graduations unlock Fifth Grade.
- Grown-ups: `/admin` shows today's quest, rebuilds it with a noted reason, and can force
  grade-5 areas open/shut per kid (Auto = by mastery). The gate is a PIN **speed bump, not a
  security boundary** — the PIN ships in the client bundle and the data behind it is in this
  device's `localStorage`. Set `NEXT_PUBLIC_ADMIN_PIN` to override the `2468` fallback.

## Deploy (Vercel)

`next.config.js` sets `poweredByHeader: false` and a security-header block
(`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, and a
CSP); everything else is Vercel's defaults, so the repo builds with no extra config. Set the env
vars from `.env.example` in the Vercel dashboard (preview + production) — including
`NEXT_PUBLIC_SITE_URL` if you want `metadataBase`, `robots.txt` and `sitemap.xml` to point at
your domain (otherwise `VERCEL_URL` is used). Push to the connected branch and Vercel
auto-deploys. No database or AI keys are needed for the local-first build to pass `next build`.

## Push checklist

1. `npm run verify` — typecheck + lint + tests + build in one command.

## Dependency security note (deliberate, not an oversight)

`npm audit --audit-level=high` reports 5 advisories (4 high, 1 critical). `next` is pinned to
`14.2.35`, which already fixes the App Router RSC DoS (advisory 2025-12-11) that `14.2.5`
shipped with; the **remaining** advisories are only fixed by `next@16`, which requires React 19.

They are kept, deliberately:

- Every one of them needs a feature this app does not use — `middleware.ts`, Server Actions,
  route handlers, `next/image`, or a Windows host. There is no custom server and every route is
  a static client page.
- The upgrade is a major framework version plus a React major, and this app is a local-first
  client that stores a kid's progress in `localStorage`; breaking it would lose their data.

So the CI step stays **visible but non-blocking** (`continue-on-error: true`) with the reason
inline in `.github/workflows/ci.yml`. `npm audit` is pinned to Next 14 and will not be made
blocking until the Next 16 / React 19 migration happens as its own change. Re-check after any
dependency bump: `npm audit --audit-level=high`.

## Docs

`docs/ARCHITECTURE.md` (routes, libraries, persistence contract, security posture),
`docs/DATABASE.md` (schema, triggers, RLS, seed, client), `docs/ROADMAP.md` (shipped + open),
`docs/PRODUCT_SPEC.md` (audience, core loop, non-goals), `docs/STATUS.md` (dated history).
