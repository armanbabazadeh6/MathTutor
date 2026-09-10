# Product Spec — MathTutor

## Audience

Kids doing short daily practice, mostly grade 4 with grade-5 areas unlocking as they graduate,
plus the parent/teacher who owns the device and reviews progress in `/admin`.

## Core loop

1. A kid picks their profile on `/profiles` (or is sent there automatically on first run).
2. Today (`/`) shows **one fixed Daily Quest per kid per day** — 10–12 questions drawn from the
   adaptive plan (`src/lib/quest/quest.ts`). Picking another topic instead is labelled optional
   extra practice and does not move the streak.
3. Practice is one question per screen with large touch targets, instant friendly feedback,
   hints, and Teach Me after a failed attempt (`ProblemPlayer`, `TeachView`).
4. Stars, points and per-skill mastery update behind the scenes; a completed quest pays the
   quest bonus and advances the streak.
5. `/plan` shows the grade climb: graduating a domain's grade-4 skills opens its grade-5 games,
   and 3 graduations unlock Fifth Grade. `/progress` shows mastery, `/rewards` shows star goals,
   badges and the grown-up prize catalog.
6. Everything is stored on the device; parents can export/import a JSON backup from `/profiles`.

## Grown-up surfaces

- `/admin` (PIN speed bump, not a security boundary) shows every kid's assignments, points,
  prize ledger and analytics, and can rebuild the day's quest with a reason and lock/unlock
  grade-5 areas per kid.
- The prize **catalog** is parent-global; each kid's **redemption history** is per-profile.

## Non-goals (v1)

No accounts beyond a local profile, no multiplayer, no chat tutor, no cloud sync (the Supabase
schema exists but is unwired — `docs/DATABASE.md`).

## UX principles

Playful but clean; big type; one question per screen; never punish wrong answers — explain and
retry a variant; motion is CSS-only and switches off under `prefers-reduced-motion`; zoom is
never blocked (no `maximumScale`).
