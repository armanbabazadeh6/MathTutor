# Database

**Status: written, not wired.** The schema exists in `supabase/migrations/0001_init.sql` with a
seed in `supabase/seed.sql`, and `src/lib/db/client.ts` can build typed clients from it — but no
screen imports those clients. All gameplay state is `localStorage` (`docs/ARCHITECTURE.md`,
"Persistence contract"). Nothing here is required to play or to pass `npm run build`.

## Schema (`supabase/migrations/0001_init.sql`)

12 tables in `public`, matching the row types in `src/lib/db/types.ts` column-for-column:

| Table                   | Key shape                                                                | Purpose                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                 | `id uuid` PK (defaults `gen_random_uuid()`), unique `username` / `email` | Students (username+PIN stub, `pin_hash`) and admins (Supabase Auth email/password). `role` is `student` \| `admin`.                      |
| `student_profiles`      | `id uuid` PK, unique `user_id` → `users`                                 | Display name + grade (1–8) for one kid.                                                                                                  |
| `skills`                | `id text` PK                                                             | Taxonomy mirror of `src/lib/skills.ts` (`id`, `domain`, `name`, `description`).                                                          |
| `student_skill_mastery` | PK (`profile_id`, `skill_id`)                                            | Mastery score `0..1` (double precision) + `attempts_count`.                                                                              |
| `assignments`           | `id uuid` PK                                                             | One day's work for a kid: `date`, `topic`, `status` (`assigned`\|`in_progress`\|`completed`), timings, `score`.                          |
| `assignment_items`      | `id uuid` PK → `assignments`                                             | Ordered (`position`) list of skills inside an assignment.                                                                                |
| `problems`              | `id uuid` PK                                                             | Generated stem, `correct_answer`, optional `choices` jsonb; optionally pinned to an `assignment_item`.                                   |
| `attempts`              | `id uuid` PK                                                             | **Append-only** answer log: `submitted_answer`, `correct`, `attempt_no`, `hint_level`, `response_ms`. No `AttemptUpdate` type by design. |
| `daily_topics`          | `id uuid` PK, unique `date`                                              | The curated topic + `skill_ids text[]` for a calendar day.                                                                               |
| `achievements`          | `id text` PK                                                             | Badge catalog (`name`, `description`).                                                                                                   |
| `student_achievements`  | PK (`profile_id`, `achievement_id`)                                      | Earned badges with `earned_at`.                                                                                                          |
| `admin_notes`           | `id uuid` PK → `student_profiles`                                        | Free-text parent notes; `admin_user_id` is nullable.                                                                                     |

## Triggers and functions

- `public.touch_updated_at()` — `before update` trigger on `users`, `student_profiles`,
  `student_skill_mastery`, `assignments`, `admin_notes` (`trg_*_touch`).
- `public.is_admin()` — `security definer` SQL function used by the RLS policies (owned by
  `postgres`, so it does not recurse into `users` policies).

## Row Level Security

RLS is enabled on all 12 tables. Assumptions are documented at the top of the migration (A1–A4);
the short version:

- A student reads their own `users` row; admins read/write everything.
- `student_profiles`, `mastery`, `assignments`, `assignment_items`, `attempts`: owner-readable
  (via the `student_profiles.user_id = auth.uid()` join), admin-writable.
- `skills`, `achievements`, `daily_topics`: readable by everyone (including `anon`), admin-writable.
- `problems`: readable by any authenticated user (practice content ships to the client by design),
  admin-writable.
- `service_role` bypasses RLS; server-side code using it must enforce its own authorization.

## Seed (`supabase/seed.sql`)

Idempotent upserts of: the 45 grade-4 skills (mirroring `src/lib/skills.ts` verbatim), one demo
student (`username`+PIN stub, placeholder `pin_hash` — never a real credential), one
`student_profiles` row, and 3 starter achievements.

**Known drift:** `src/lib/skills.ts` now exports 56 skills (45 grade 4 + 11 grade 5) and the seed
still inserts only the 45 grade-4 rows; the 11 grade-5 skills are not seeded yet.

## Client (`src/lib/db/client.ts`)

- `isSupabaseConfigured()` / `getBrowserClient()` — browser singleton using
  `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (RLS applies).
- `createServerClient({ useServiceRole })` — per-request server factory; resolves
  `SUPABASE_URL` / `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` when `useServiceRole` is set.
- Env placeholders live in `.env.example`. The module imports `server-only`, so importing it from a
  client component fails the build rather than shipping keys.
