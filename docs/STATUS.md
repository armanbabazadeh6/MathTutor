# Status

> The dated sections below are a historical log and are kept verbatim. Where an early entry
> contradicts the code today, current state is summarized here and in `docs/ARCHITECTURE.md`,
> `docs/DATABASE.md` and `docs/ROADMAP.md`.

## State

All eight planned phases have landed (see `docs/ROADMAP.md`): the app boots to the Today view
with a per-kid Daily Quest, adaptive practice, plan/progress/rewards screens, local kid profiles,
and the `/admin` parent dashboard behind a PIN speed bump. There is no backend at runtime; the
Supabase schema is written but unwired.

## Scaffold notes (historical)

- Next.js 14 (App Router) + TypeScript + Tailwind scaffold (Vercel-ready).
- Design tokens + Button, Card, Badge, ProgressBar.
- Skill taxonomy: the scaffold shipped 45 grade-4 skills across 5 domains. `src/lib/skills.ts`
  now exports 56 `SKILLS` (45 grade-4 + 11 grade-5, unlocked per domain).
- Docs: ARCHITECTURE, PRODUCT_SPEC, DATABASE, ROADMAP, STATUS.

## Next

- Close the open items in `docs/ROADMAP.md` (Next.js 15/16 upgrade, backup suffix gap, cloud wiring).

## Decisions

- Single `SKILLS` export, no helper functions (project rule).
- Design tokens as CSS vars + Tailwind extension, no gradients.

## Blockers

- None.

## Gamification / AI / Effects slice (2026-09-07)

### State

Gamification rules, server-only AI provider, and CSS-only polish effects landed and verified.

### Completed

- Installed `@supabase/supabase-js` (+ `tsx` dev runner, `npm test` script); `db/client.ts` module error cleared.
- `src/lib/gamification.ts`: XP (10 solved / 5 first-try / 20 perfect), levels (100 XP bands), streaks (same-day hold, +1 consecutive, reset on gap), 8 badge ids mirroring `session.BADGES`, once-per-day reward (15 XP). Pure functions, no I/O.
- `tests/gamification.test.ts`: 10 tests, all green.
- `src/lib/ai/provider.ts`: server-only `AIProvider` interface, env-keyed factory (mock default, http with `AI_ENDPOINT`+`AI_API_KEY`), `MockProvider`/`FailingProvider`, deterministic template fallback, `isNumericAnswerValid` gate. No client imports it; grading path (`math/grading.ts`) untouched and AI-free.
- `src/components/effects/`: `Celebration`, `Shake`, `Streak` + `effects.css` (pop, confetti, gentle shake, streak pulse, fade-slide, transitions; `prefers-reduced-motion` disables all).

### Verify outputs

- `npx tsc --noEmit`: exit 0.
- `npm test`: 49 pass / 0 fail (math 39 + gamification 10; analytics suite not present in repo yet).
- `npm run build`: passes, 7 static routes.
- Smoke (dev :3100): `/` 200 (Today picker + Start button), `/admin` 200 (PIN gate), `/practice` 200 (empty-state path). Session start path is local (`generateAssignment` -> `/practice` `ProblemPlayer`).
- Secrets: browser bundle holds only `NEXT_PUBLIC_*` publishable keys; `SUPABASE_SERVICE_ROLE_KEY` / `AI_API_KEY` server-only.

### Remaining gaps

- Analytics test suite (18) not in repo — owned by another slice; rerun `npm test` after it lands.
- `generateWordProblem` has no live vendor wired (`AI_PROVIDER` unset -> mock/template); HTTP adapter awaits endpoint + key.
- Effects components not yet mounted in student screens (opt-in; layout untouched per slice boundary).
- Gamification rules duplicate session XP/badge numbers by design (this module is canonical on drift).

## Effects mount + test widen fix (2026-09-07)

- `package.json` test script now runs `tsx --test tests/*.test.ts src/app/admin/__tests__/analytics.test.ts` (keeps tsx runner; plain node breaks on extensionless imports).
- Mounted existing effects: `ProblemPlayer` renders `Celebration` on correct answers and wraps hint/reveal feedback in `Shake` keyed by `${problem.id}-${attemptsUsed}`; `ResultsView` renders `Streak` with the session streak count in the score card. CSS-only, no new deps.
- Verify: `npm test` 67/67 pass, `npx tsc --noEmit` exit 0, `npm run build` passes (9 static routes).

## Adaptive plan slice (2026-09-07)

- `src/lib/session.ts`: new versioned `mt.planSession.v2` (levels + mastery + chronological history + per-skill consecutive correct/incorrect streaks + reteach queue; version mismatch migrates to cold start, legacy keys untouched). `recordGradedAttempt` / `recordReteachOutcome` / `currentPlan` wrap the plan rules; `generateAssignment` now consumes `buildPlan` queue (skill + level + difficulty per item, `MAX_PER_SKILL_PER_PLAN` cap) with Today-picker domain scoping via weakest-skill substitution. Legacy `GEN_BY_DOMAIN` table deleted. Queue scoped to generator-supported skills (`ALL_SKILLS`); geometry has no deterministic generator yet and falls back to supported skills.
- `ProblemPlayer`: every graded attempt reports to the plan engine; exhausted attempts show Teach Me 🙋 -> imported `TeachView` lesson built from the failed problem -> reteach outcome recorded (hinted, never a false promotion) -> correct reteach swaps in a follow-up check at the lowered plan level.
- `src/app/plan/page.tsx` (new `/plan`): stars + word labels per domain (no numbers-heavy), next-unlock line, `Let's practice` reteach list (no shaming language), Up-next queue preview. Nav is now Today/Plan/Progress/Rewards.
- Verify: throwaway loop script (deleted after run) — 3 first-try wins promote L2->L3 (easy->medium), 2 exhaustions demote + flag reteach, reteach win clears queue without promoting. `npm test` 119/119 pass, `npx tsc --noEmit` exit 0, `npm run build` passes (10 static routes incl. `/plan`).

## Points wallet + redemption wiring (2026-09-07)

- `src/lib/session.ts`: new versioned `mt.points.v1` wallet (`POINTS_VERSION`, `loadPointsState`/`savePointsState`/`awardPoints` via canonical `rewards/earning.recordActivity`). Hooks: `recordGradedAttempt` awards first-try + level-up-on-promote, `recordReteachOutcome` awards level-up-on-promote (never first-try), `recordResult` awards completion; every hook advances `streakDays` by active date with once-per-day bonus. `GradedOutcome` and `recordResult` returns now include `points`.
- `src/components/admin/rewardStore.ts`: kid `requestRedemption` now holds the cost through canonical `requestRedemption` (balance/streak/example/duplicate checks; balance deducted at request), rejects example rewards and second requests while one is requested/approved; `denyRedemption` refunds via canonical `denyRedemption`. Approve/fulfill unchanged (no balance change — holds stay spent).
- `src/components/student/RewardsView.tsx` + `src/app/rewards/page.tsx`: kept star-goal/badges UI; added "Grown-up prizes" catalog (`listRedeemable`, active non-examples) with ⭐ balance header, canonical chips (Asked/Approved/Ready/Locked), locked reasons (points shortfall, streak rule), disabled ask while requested/approved (no double request), `role=alert` request errors. Page wires `onRequest` -> store request + wallet refresh.
- Field reconciliation: no renames needed — `RewardManager`/`rewardStore` already match canonical `lib/rewards/types.ts` (`pointCost`, `minStreakDays`, `example`, `requestedAt/decidedAt/fulfilledAt`). The breakage was semantic (requests/denies bypassed holds), now routed through the canonical functions.
- Verify: `npx tsc --noEmit` exit 0; `npm test` 143/143 pass; `npm run build` passes (8 static routes incl. `/rewards`); dev :3199 `/rewards` 200, `/admin` 200.
- Throwaway `tsx` sim (deleted): earn 110 (8 first-tries + daily + completion) -> request 100-pt Roblox-tier holds to 10 -> second spend throws -> approve keeps 10 held -> fulfill leaves 10 spent / lifetime 110 -> deny on a fresh request refunds to 110. SIM OK.

## Per-profile namespacing + entry redirect (2026-09-07)

- `src/lib/session.ts`: every persisted store now resolves through `profileKey()` for the
  active kid (`currentProfileId()` reads `mt.profiles.v1`; `mt.p.<kid-id>.<suffix>`), with
  legacy-key read fallback until `migrateLegacyOnce()` adopts old progress once. All
  loaders/writers/record hooks take an optional trailing `profileId?` (`undefined` ->
  active, `null` -> legacy); existing callers pass nothing and follow the active kid.
  Covered: assignment, lastResult, progress, newBadges, points wallet, planSession.
- `src/components/admin/rewardStore.ts`: prize catalog stays parent-global
  (`mathtutor.rewards.v1`); redemption history is per-profile (`mt.p.<kid>.redemptions.v1`,
  adopted from the shared ledger on first run). `syncProfileLedger()` re-checks the active
  profile on every read/action (module singleton would otherwise show the previous kid's
  ledger after a client-side switch); `persist()` mirrors the ledger to both keys.
- `src/app/page.tsx` (entry lines only): `migrateLegacyOnce()` + active-profile check;
  no profiles / no active -> `router.replace("/profiles")` behind a friendly
  "Pick who's playing" gate. Switching kids pushes back to `/`, remounting Home so
  progress/plan/points reload.
- `README.md` (new): run/dev/supabase/AI/push notes + Vercel deploy note (`next.config.js`
  empty by design). No root config changes needed.
- Decision log: catalog global + redemption history per-profile; backup JSON covers the six
  profile payloads (assignment/lastResult/progress/newBadges/points/planSession) but NOT
  `redemptions.v1` yet — follow-up is adding that suffix to `BACKUP_SUFFIXES`
  (profile-store owned, untouched here).
- Verify: `npx tsc --noEmit` exit 0; `npm test` 163/163 pass; `npm run build` passes;
  dev curl `/` `/profiles` `/profile` 200; throwaway tsx sim (deleted): two profiles with
  isolated progress/points/plan ledgers, photo guard + backup export/import round-trip. SIM OK.

## Daily quest loop + grade-5 unlocks (2026-09-07)

- `src/lib/session.ts` (quest state, extended — imports quest/plan/sound-adjacent libs, never duplicates):
  per-profile `mt.quest.v1` doc (`getDailyQuest` stable intraday via `resolveDailyQuest`, locked at first
  `startDailyQuest`, `questToAssignment` mints 1:1 deterministic problems with weakest-supported fallback for
  generator-less skills, `regenerateDailyQuest` needs a non-empty parent reason and clears stale quest work).
  `recordResult(result, pid, { quest })` on a full solve pays the canonical quest bonus + streak
  (`awardQuestCompletion`) and marks the quest done; partial quests and free-pick extra practice use
  `{ countStreak: false }` (progress + standard completion points save, streak frozen via `awardPointsNoStreak`).
  `recordGradedAttempt` / `recordReteachOutcome` take the same opt so effort stars never move the streak alone.
  Grade locks: per-profile `mt.gradeOverrides.v1` (`get/setGradeOverride`) applied in `gradeViews()` /
  `globalGradeView()`; `mt.celebratedGraduations.v1` tracks fanned graduations so each fires once.
- Today (`src/app/page.tsx`): Daily Quest card (title, N problems, bonus, Start/Resume/play-again, cheer on
  done) + free-pick relabeled "Extra practice (optional)" with `QUEST_ASSIGNMENT_NOTE`. `/practice` routes
  completion: full quest solve -> bonus + streak, else streak-free save. `ProblemPlayer` threads the same flag.
- `/plan`: "Grade climb" card (per-domain qualifying/total, avg level/mastery, graduation + grade-5 count,
  grown-up-pick marker; global Fifth Grade X/3 line) + first-sight celebration overlay (`ConfettiBurst` +
  cheering `Character` + `sound().playFanfare()`, replayable via the Hooray button).
- `/admin`: new `QuestControls` (quest viewer with item reasons/levels, rebuild-with-reason, per-domain
  Lock/Open/Auto grade locks) mounted below `Dashboard`; `Dashboard.tsx` untouched.
- Decision log: per-problem first-try/level-up stars always count (effort); only the day streak + quest bonus
  gate on full quest completion. First activity of the day still takes the auto daily bonus through
  `awardPoints`, so the quest bonus can stack +5 on days with prior extra practice (generous, deterministic).
- Verify: `npx tsc --noEmit` exit 0; `npm test` 244/244 pass; `npm run build` passes;
  dev curl `/` `/plan` `/practice` `/admin` 200; throwaway tsx sim (deleted): intraday quest stability +
  lock, ace-a-domain -> grade-5 items + celebration keys, quest bonus + streak math, two-profile isolation. SIM OK.

## Fixes audit: 4 P0s + 4 P1s (2026-09-07)

- P0-1 InstallPrompt always rendered: `visible` was computed but never read in JSX, so the
  dialog covered the bottom on all devices. Now returns null until visible; the show rule lives
  in exported `shouldShowInstallPrompt({ standalone, dismissed, isIPad })` (iPad + browser +
  not-dismissed). Dismiss persistence unchanged.
- P0-2 divergent grading unified: `ProblemPlayer` graded via typeless float `parseAnswer`
  (1e-9 tolerance) while teach-check used canonical `isCorrectAnswer` — right answers marked
  wrong (`2.501` vs `2.50`, `6R2` vs `6 R 2`, `1000` vs `1,000`, `2/4`/`0.5` vs `1/2`). Session
  `checkAnswer` now delegates to `isCorrectAnswer`; `GeneratedProblem` carries `answerType`
  (threaded through `generateAssignment`, `questToAssignment`, follow-up converter); legacy
  stored problems without a type infer it via `inferAnswerType`. `parseAnswer` kept as an
  unused legacy export.
- P0-3 UTC-vs-local dates: `todayStr()` used UTC `toISOString` while quests used local days, so
  streaks/points could roll over at the wrong midnight. Now `todayStr()` = `localDateISO()`;
  `recordResult` compares against `dayBefore(today)` (was: real-now yesterday, ignoring the
  injected `today`); `recordGradedAttempt`/`recordReteachOutcome` thread `opts.today` into
  `awardPoints` (was: dropped on the countStreak path). Gamification UTC-days comment fixed.
- P0-4 iOS fraction slash: both answer inputs used `inputMode="decimal"` (no `/` on iOS) and
  are now `inputMode="text"` + autocapitalize/autocorrect off + `enterKeyHint="go"` with an
  on-screen keypad (`/`, `.`, `-`) via `src/lib/answerInput.ts` (`ANSWER_INPUT_MODE`,
  `ANSWER_KEYPAD_CHARS`, `appendKeypadChar`).
- P1s fixed in the same diffs: reteach lesson mistyped as `answerType: "text"` (fraction
  equiv/decimal marked wrong in Teach Me); streak yesterday ignored explicit `today`;
  effort-points `today` dropped on the default path; stale UTC comment.
- Verify: `tests/fixes-audit.test.ts` 21 regression tests; `npm test` 304/304 pass;
  `npx tsc --noEmit` exit 0; `npm run build` passes (10 static routes).

## Infra hardening: build/lint/deploy readiness (2026-09-10)

### Changed

- **Next bumped 14.2.5 → 14.2.35** (`next` is pinned exactly; `node -p "require('next/package.json').version"` → `14.2.35`), closing the App Router RSC DoS advisory. Stayed on 14.x (React 18).
- **Lint is real now**: added `eslint@8.57.1`, `eslint-config-next@14.2.35`, `prettier@3.3.3` (dev) plus `.eslintrc.json`, `.prettierrc`, `.prettierignore`. `next lint` no longer prompts. `npm run lint` exits 0 with 3 warnings in files owned by other slices (`src/app/profile/page.tsx`, `src/app/profiles/page.tsx`: `@next/next/no-img-element`, `react-hooks/exhaustive-deps`).
- **`server-only`** (`0.0.1`) is now imported by `src/lib/ai/provider.ts` and `src/lib/db/client.ts` instead of being comment-enforced.
- **`.env*` ignored** with `!.env.example` (`git add -A` can no longer pick up `.env.production`/`.env.development`/`.env.staging`).
- **`/admin` no longer prints its PIN.** `ADMIN_PIN` reads `NEXT_PUBLIC_ADMIN_PIN` with `2468` as a documented fallback, and its doc comment states plainly that it is a speed bump, not a security boundary.
- **Security headers** in `next.config.js`: `poweredByHeader: false` + `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`, and a CSP (`script-src 'self' 'unsafe-inline'`, `'unsafe-eval'` in dev only; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self' data:`; `connect-src 'self'` + ws in dev + `https://*.supabase.co`; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`). Verified live over HTTP.
- **Metadata/PWA surface**: `metadataBase` + `openGraph` + `twitter` in `src/app/layout.tsx` (origin from `NEXT_PUBLIC_SITE_URL`, else `VERCEL_URL`, else localhost), plus `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/icon.svg`, `src/app/not-found.tsx`, `src/app/error.tsx` and `src/app/global-error.tsx` (both boundaries `"use client"`, styled on the app tokens). `/favicon.ico` itself still 404s on a direct request — the icon surface is declared through `<link rel="icon">` + `/icon.svg`.
- **Test discovery fixed**: `npm test` is now `tsx --test "tests/**/*.test.ts" "src/**/__tests__/**/*.test.ts"` — 16 files matched (15 under `tests/`, 1 at `src/app/admin/__tests__/analytics.test.ts`); the old script hardcoded the nested analytics path.
- **Scripts/fields**: added `verify` (typecheck + lint + test + build), `lint:fix`, `format`, `format:check`, `test:watch`, `clean`, `engines.node >= 20.9`, `description`, `license: UNLICENSED`, `repository`.
- **CI**: `.github/workflows/ci.yml` gained `permissions: contents: read`, `concurrency`, `timeout-minutes: 20`, `npm run lint`, a `.next/cache` restore step, and `npm audit --audit-level=high`. The audit step is `continue-on-error: true` **because it genuinely fails on this pinned tree**: 5 advisories (1 critical, 4 high — `next`, `@next/eslint-plugin-next`, `eslint-config-next`, `glob`, nested `postcss`) whose only offered fix is `next@16`. Blocking it would mean a permanently red CI, so it stays visible-but-non-blocking until the Next 16 / React 19 upgrade. Added `.github/dependabot.yml` (weekly npm + github-actions).
- **Docs rewritten to match the code**: `ARCHITECTURE.md`, `DATABASE.md` (12 tables + triggers + RLS from `supabase/migrations/0001_init.sql`, explicitly "written, not wired"), `ROADMAP.md` (phases 1–7 shipped, open items listed), `PRODUCT_SPEC.md` (daily quest, grade-5 unlocks, grown-up surfaces), `README.md`, and this STATUS head.

### Verify

- `npx tsc --noEmit`: no errors in the files owned by this slice (the only reported errors are in concurrently-edited `ProblemPlayer.tsx`, `session.ts`, `tests/fixes-audit.test.ts`).
- `npm run lint`: exit 0, non-interactive (3 warnings, all in another slice's files).
- Dev-server smoke (`:3210`): `/robots.txt` 200 + all five security headers and no `x-powered-by`; `/sitemap.xml` 200 (`application/xml`); unmatched URL 404 rendering `not-found.tsx` (browser-verified: "This path wandered off!" with cream/green/Fredoka tokens); `/zz-errorsmoke` (throwaway, since deleted) rendered `error.tsx` in a real browser; `/admin` renders the gate with no PIN value on screen; og/twitter tags and `viewport` (no `maximumScale`) present in the HTML.
- Icons verified with `sips` + magic bytes: `icon-512.png` and `maskable-512.png` are real 512×512 PNGs; `icon-192.png` 192×192 and `apple-touch-icon.png` 180×180 are real PNGs.
- `npm run build` was intentionally **not** run (other slices were mid-edit).

### Remaining gaps

- `npm audit --audit-level=high` cannot pass until Next 16 / React 19.
- `/favicon.ico` direct requests 404 (no binary `.ico` was generated; a real 32×32 favicon was out of this slice's owned paths).
- `supabase/seed.sql` still seeds only the 45 grade-4 skills.
- `exportBackup()` still covers 6 of the 10 per-kid suffixes.
