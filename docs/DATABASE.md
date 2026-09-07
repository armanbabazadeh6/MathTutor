# Database

No DB wired yet. Planned tables (for the migrations task):

- `profiles` — student profile (name, grade, created_at).
- `skills` — mirrors `src/lib/skills.ts` taxonomy (id, domain, name).
- `mastery` — per-profile per-skill score (profile_id, skill_id, score, updated_at).
- `sessions` — practice session record (profile_id, started_at, finished_at).
- `attempts` — one row per answered question (session_id, skill_id, correct, duration_ms, created_at).
- `badges` — earned awards (profile_id, badge_id, earned_at).
