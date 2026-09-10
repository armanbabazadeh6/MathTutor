# Roadmap

The original 8-phase plan has mostly shipped — phases 1–7 are in the tree today. This file
records where each phase landed and what is genuinely still open. Dated history lives in
`docs/STATUS.md`.

## Shipped

1. **Foundation** — Next.js App Router shell, design tokens (`src/app/globals.css`,
   `tailwind.config.js`), skill taxonomy (`src/lib/skills.ts`), docs.
2. **Math engine** — deterministic generators (`src/lib/math/generators.ts`,
   `generators-extra.ts`) with canonical-answer grading (`grading.ts`), answer types and
   mastery updates (`mastery.ts`, `answers.ts`, `composer.ts`). Deterministic by contract: no
   network and no LLM on the grading path. Coverage per skill is asserted by the suites under
   `tests/`.
3. **Student player** — Today (`/`), the one-question flow with hints and Teach Me
   (`ProblemPlayer`, `TeachView`), results (`ResultsView`).
4. **Persistence** — per-kid `localStorage` namespacing with a one-time legacy migration
   (`src/lib/session.ts`, `src/lib/profile/store.ts`). The SQL schema is written but not wired
   (`docs/DATABASE.md`).
5. **Adaptivity** — plan levels and promote/demote rules, spaced-repetition picker and reteach
   queue (`src/lib/plan/`), consumed by `session.ts`.
6. **Parent dashboard** — `/admin` analytics, quest rebuild controls and the reward manager,
   behind `AdminGate`.
7. **Polish** — CSS-only celebration/effect components (reduced-motion aware), haptics, the
   Web Audio sound engine, star goals, badges, the grown-up prize catalog, and the install
   prompt.

## Open

- **Next.js upgrade** — the tree is pinned to `next@14.2.35` (React 18). The remaining
  `npm audit --audit-level=high` advisories are only fixed by `next@16`, which is why the CI
  audit step is non-blocking (`.github/workflows/ci.yml`).
- **Cloud wiring** — replace the `localStorage` stores with `src/lib/db/client.ts` calls, and
  move authorization server-side (retiring `ADMIN_PIN` in `src/components/admin/store.ts` and
  the `src/lib/auth.ts` stub).
- **Seed parity** — `supabase/seed.sql` seeds the 45 grade-4 skills; the 11 grade-5 skills in
  `src/lib/skills.ts` are not seeded yet.
- **Cross-device analytics** — `/admin` analytics read local history only today
  (`src/lib/analytics.ts`), so a second device sees nothing until the DB is wired.
- **Deploy (phase 8)** — Vercel deploy, env vars, and a smoke pass over `/`, `/profiles`,
  `/profile`; the push checklist is in the README.
