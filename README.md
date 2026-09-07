# MathTutor

Local-first 4th-grade math practice (Next.js 14 + TypeScript + Tailwind). Each kid gets an
isolated profile: progress, points wallet, adaptive plan, and prize history all persist
per-profile in `localStorage` (`mt.p.<kid-id>.*`). No account, no backend required to play.

## Run / dev

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (must pass before push)
npm start        # serve the production build
```

Checks (all must be green):

```bash
npx tsc --noEmit   # or: npm run typecheck
npm test           # tsx runner: tests/*.test.ts + admin analytics suite
```

## Supabase (optional, not required to play)

Local-first works with zero env vars. To wire the cloud sync later:

1. Copy `.env.example` to `.env.local` and fill values from the Supabase dashboard.
2. `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are browser-safe (RLS still
   applies). `SUPABASE_SERVICE_ROLE_KEY` is **server-only**: no `NEXT_PUBLIC_` prefix, never
   commit it, never send it to the browser.
3. Schema + seed live in `supabase/migrations/0001_init.sql` and `supabase/seed.sql`
   (planned tables: `profiles`, `skills`, `mastery`, `sessions`, `attempts`, `badges` —
   see `docs/DATABASE.md`; nothing is wired to the app yet).

## AI word problems (optional)

`src/lib/ai/provider.ts` is **server-only** (never import it from `"use client"` components).

- `AI_PROVIDER` unset → deterministic mock/template wording (default; tests use this).
- Live vendor: set `AI_ENDPOINT` + `AI_API_KEY` (and optional `AI_MODEL`) for the HTTP adapter.
- Grading invariant: `src/lib/math/grading.ts` grades against the math engine's canonical
  answer only — the provider supplies narrative wording, validated by
  `isNumericAnswerValid()`, with a template fallback so generation never throws.

## Profiles, migration, backup

- `/profiles` is the kid picker (photo ≤256px / ≤300KB, optional 4-digit PIN gate, grown-up
  math gate on delete). `/` redirects there when no profile is active; switching kids
  remounts Home so all state reloads for that kid.
- One-time migration: pre-profile `mt.*` keys are adopted into the first profile exactly once
  (`migrateLegacyOnce`, flag-guarded); legacy keys are kept as backup.
- Backup: Export downloads one JSON (`profiles` + per-profile payloads + legacy snapshot);
  Import restores it. Lives on `/profiles` (and `/profile`). Photos and progress save **on
  this device only** — export a backup before an iPad wipe.
- Storage map: prize **catalog** is parent-global; each kid's **redemption history** is
  per-profile. (Known gap: the backup JSON does not yet cover `redemptions.v1` — catalog +
  ledgers survive only in device storage until that suffix joins the backup set.)

## Daily quest + grade unlocks

- Today shows one fixed Daily Quest per kid per day (same quest all day, locked at first start).
  Finishing it pays the quest bonus + advances the streak; anything else is extra practice
  (stars still count, streak frozen). Missed days expire — no backlog.
- `/plan` tracks the grade climb: acing a domain's grade-4 skills graduates it (fanfare +
  celebration) and opens its grade-5 games; 3 graduations unlock Fifth Grade.
- Grown-ups: `/admin` shows today's quest, rebuilds it with a noted reason, and can
  force grade-5 areas open/shut per kid (Auto = by mastery).

## Deploy (Vercel)

`next.config.js` is intentionally empty — Vercel's defaults build this repo with no extra
config. Set the env vars above in the Vercel dashboard (preview + production), push to the
connected branch, and Vercel auto-deploys. No database or AI keys are needed for the
local-first build to pass `next build`.

## Push checklist

1. `npx tsc --noEmit` — exit 0.
2. `npm test` — all green.
3. `npm run build` — passes.
4. Commit, push, let Vercel deploy; smoke-test `/`, `/profiles`, `/profile` (all 200).
