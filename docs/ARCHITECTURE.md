# Architecture

Next.js **14.2.35** (App Router) + TypeScript + Tailwind CSS, `src/` layout. Vercel-ready,
no custom server. There is no backend at runtime: every kid's progress, points, plan,
quest and prize ledger lives in `localStorage` on the device.

## Routes (`src/app/`)

| Route               | File                        | What it renders                                                                                                 |
| ------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/`                 | `page.tsx`                  | Today: the fixed Daily Quest card plus optional extra practice. Redirects to `/profiles` when no kid is active. |
| `/practice`         | `practice/page.tsx`         | One-question-at-a-time player (`ProblemPlayer`); routes completion by quest vs free-pick.                       |
| `/practice/results` | `practice/results/page.tsx` | Session summary (`ResultsView`).                                                                                |
| `/plan`             | `plan/page.tsx`             | Grade climb: per-domain graduation progress, grade-5 unlocks, reteach list, next-up queue.                      |
| `/progress`         | `progress/page.tsx`         | Stars and per-domain mastery bars.                                                                              |
| `/rewards`          | `rewards/page.tsx`          | Star goals, badges, grown-up prize catalog and redemption requests.                                             |
| `/profiles`         | `profiles/page.tsx`         | Kid picker: create/select/delete profiles, photo, backup export/import.                                         |
| `/profile`          | `profile/page.tsx`          | Active-kid settings and backup.                                                                                 |
| `/admin`            | `admin/page.tsx`            | Parent dashboard (analytics, quest controls, reward manager) behind `AdminGate`.                                |

Framework files:

- `layout.tsx` — fonts (Fredoka/Nunito via `next/font/google`), page `metadata`, `ErrorGate`, `InstallPrompt`. The `viewport` export is deliberately zoom-friendly (no `maximumScale`).
- `template.tsx` — remounts per navigation and applies the `.mt-route` entrance animation.
- `not-found.tsx`, `error.tsx`, `global-error.tsx` — friendly 404 and two crash boundaries, all built on the design tokens.
- `manifest.ts`, `robots.ts`, `sitemap.ts`, `icon.svg` — PWA/metadata file conventions.
- `globals.css` — design tokens and utility classes.

## Libraries (`src/lib/`)

- `skills.ts` — canonical taxonomy: 5 `SKILL_DOMAINS`, 56 `SKILLS` (45 grade-4 + 11 grade-5, unlocked per domain by the graduation rules).
- `math/` — deterministic question engine: `generators.ts` / `generators-extra.ts`, canonical-answer grading (`grading.ts`), `mastery.ts`, `composer.ts`, `answers.ts`, `types.ts`. Grading never touches the network or an LLM.
- `plan/` — adaptive engine: `levels.ts` (level ↔ difficulty), `rules.ts` (promote/demote + consecutive streaks), `plan.ts` (queue build), `srs.ts` (spaced repetition), `graduation.ts` (grade-4 → grade-5 unlocks).
- `quest/` — the Daily Quest: `quest.ts` builds 10–12 deterministic items per kid per day (`QUEST_MIN_ITEMS`/`QUEST_MAX_ITEMS`, max 3 per skill), locked at first start.
- `rewards/` — `earning.ts` (XP/points rules), `goals.ts` (streak goals + catalog helpers), `redemption.ts` (request/approve/deny/fulfill lifecycle), `types.ts`.
- `session.ts` — composition layer over the stores: assignment, last result, progress, badges, points wallet, plan session, daily quest, grade overrides, celebrated graduations. Every key resolves through `profileKey()` so siblings never see each other's data.
- `profile/store.ts` — profiles doc, photo limits, one-time legacy `mt.*` adoption, JSON backup export/import.
- `gamification.ts` — canonical XP/level/streak/badge numbers (kept in sync with `session.ts`).
- `analytics.ts` — pure admin analytics over local assignment history.
- `sound/` — Web Audio engine, scheduler, mute store.
- `teach/lessons.ts` — Teach Me lesson builder; `visual/models.ts` — visual model builders.
- `answerInput.ts` — fraction-friendly input contract (iOS `/` keypad).
- `auth.ts` — username+PIN demo stub; not an authorization boundary.
- `ai/provider.ts` — server-only word-problem provider (`import "server-only"`).
- `db/client.ts`, `db/types.ts` — Supabase client factories and row types mirroring `supabase/migrations/0001_init.sql`. Also `server-only`, and **not wired to any screen** (see `docs/DATABASE.md`).

## Components (`src/components/`)

- `duo/` — the design system: `ChunkyButton`, `Card`, `Character` (original blob mascot), `BottomNav`/`StudentNav`, `ProgressBar`, `GemCounter`, `HeartBar`, `StreakFlame`, `EmptyState`, `Alert`, `LessonPath`, `ErrorGate`.
- `effects/` — CSS-only polish: `Celebration`, `ConfettiBurst`, `CountUp`, `LevelUpOverlay`, `PageFade`, `ProgressRing`, `Shake`, `Skeleton`, `SoundToggle`, `Streak`, `InstallPrompt`. `prefers-reduced-motion` disables the motion.
- `student/` — `ProblemPlayer`, `ResultsView`, `TeachView`, `RewardsView`, `QuickStart`, `TopicGrid`, `BackButton`.
- `admin/` — `AdminGate` (PIN), `Dashboard`, `QuestControls`, `RewardManager`, `store.ts` (admin state + `ADMIN_PIN`), `rewardStore.ts` (parent-global catalog + per-kid redemption ledger).
- `onboarding/WelcomeHero.tsx` and `ui/` primitives (Badge, Button, Card, ProgressBar, Sheet).

## Persistence contract

- Per-kid keys: `mt.p.<kid-id>.<suffix>` for `assignment.v1`, `lastResult.v1`, `progress.v1`, `newBadges.v1`, `points.v1`, `planSession.v2`, `quest.v1`, `gradeOverrides.v1`, `celebratedGraduations.v1`, `redemptions.v1`.
- Parent-global keys: `mt.profiles.v1`, `mt.profiles.migrated.v1`, `mathtutor.rewards.v1` (prize catalog), `mathtutor.admin.v1` (demo admin state), `mathtutor:sound-muted`, `mathtutor:install-dismissed`.
- Pre-profile `mt.*` keys are adopted into the first profile exactly once (`migrateLegacyOnce`) and kept as a backup. `exportBackup()` in `src/lib/profile/store.ts` covers 6 of the 10 per-kid suffixes today — see the README for the gap.

## Security posture

- Local-first means the threat model is "someone else holding the iPad". `/admin` is a PIN speed bump, not a boundary: `ADMIN_PIN` (default `2468`, overridable with `NEXT_PUBLIC_ADMIN_PIN`) is inlined into the client bundle and the data it guards is in `localStorage`.
- `next.config.js` sets `poweredByHeader: false` and sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY` and a conservative CSP (`script-src 'self' 'unsafe-inline'`, plus `'unsafe-eval'` in development only).
- `src/lib/ai/provider.ts` and `src/lib/db/client.ts` import `server-only`, so a client import fails the build instead of leaking keys.
- `npm audit --audit-level=high` currently reports advisories that only `next@16` fixes (see `.github/workflows/ci.yml`).

## Design system

Warm playful-but-clean: cream `#fdf3e1` paper, ink `#3f3a32` text, bright green primary
`#58cc02` (with the AA-safe `#3a8400` for filled buttons and `*-ink` shades for text),
line `#e8d5b0` borders, sunny/mint/sky/coral/grape accents. Tokens are CSS variables in
`globals.css` and are exposed to Tailwind in `tailwind.config.js`. Rounded cards
(`--radius-card: 1.5rem`), `.touch-target` (56px min), and the fluid `text-kid-*` type scale.
