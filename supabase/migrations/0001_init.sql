-- supabase/migrations/0001_init.sql
-- MathTutor initial schema: users, profiles, skills, mastery, assignments,
-- problems, attempts, daily topics, achievements, admin notes.
--
-- RLS ASSUMPTIONS (see policies below):
--   A1. Every row in public.users has id = auth.uid() once Supabase Auth is
--       wired. Students currently sign in with a username+PIN stub
--       (src/lib/auth.ts); after migration each student gets a Supabase Auth
--       user whose uid equals public.users.id, and pin_hash is retired.
--       Admins already use Supabase Auth email/password.
--   A2. service_role bypasses RLS (Supabase default). Server-side code uses
--       the service-role key and MUST enforce its own authorization.
--   A3. Until A1 holds, anon/authenticated clients with no linked users row
--       can read only public taxonomy tables (skills, achievements,
--       daily_topics). All private reads require a linked users row.
--   A4. public.is_admin() is SECURITY DEFINER owned by postgres, so it
--       bypasses RLS on public.users and does not recurse into policies.

create extension if not exists "pgcrypto";

-- Shared updated_at trigger.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- users ---
create table public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique,
  email text unique,
  role text not null default 'student' check (role in ('student', 'admin')),
  -- Placeholder for the username+PIN stub. Stores an opaque verifier, never a
  -- raw PIN. Retired once students move to Supabase Auth (see A1).
  pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (username is not null or email is not null)
);

-- ------------------------------------------------- student_profiles -------
create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  display_name text not null,
  grade integer check (grade between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_student_profiles_user on public.student_profiles (user_id);

-- ------------------------------------------------------------ skills ------
-- skills.id mirrors src/lib/skills.ts Skill.id (text PK, seeded verbatim).
create table public.skills (
  id text primary key,
  domain text not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

-- -------------------------------------------- student_skill_mastery ------
create table public.student_skill_mastery (
  profile_id uuid not null references public.student_profiles (id) on delete cascade,
  skill_id text not null references public.skills (id) on delete cascade,
  score double precision not null default 0 check (score >= 0 and score <= 1),
  attempts_count integer not null default 0 check (attempts_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, skill_id)
);
create index idx_mastery_profile on public.student_skill_mastery (profile_id);
create index idx_mastery_skill on public.student_skill_mastery (skill_id);

-- ------------------------------------------------------- assignments ------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles (id) on delete cascade,
  date date not null,
  topic text not null default '',
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  score double precision check (score is null or (score >= 0 and score <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_assignments_profile_date
  on public.assignments (student_profile_id, date desc);

-- -------------------------------------------------- assignment_items ------
create table public.assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  skill_id text not null references public.skills (id),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);
create index idx_items_assignment on public.assignment_items (assignment_id);

-- ------------------------------------------------------------ problems ----
create table public.problems (
  id uuid primary key default gen_random_uuid(),
  assignment_item_id uuid references public.assignment_items (id) on delete set null,
  skill_id text not null references public.skills (id),
  stem text not null,
  correct_answer text not null,
  choices jsonb,
  created_at timestamptz not null default now()
);
create index idx_problems_skill on public.problems (skill_id);
create index idx_problems_item on public.problems (assignment_item_id);

-- ------------------------------------------------------------ attempts ----
-- Immutable answer log: rows are inserted, never updated.
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems (id) on delete cascade,
  student_profile_id uuid not null references public.student_profiles (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  submitted_answer text not null default '',
  correct boolean not null,
  attempt_no integer not null default 1 check (attempt_no >= 1),
  hint_level integer not null default 0 check (hint_level >= 0),
  response_ms integer check (response_ms is null or response_ms >= 0),
  created_at timestamptz not null default now()
);
create index idx_attempts_problem on public.attempts (problem_id);
create index idx_attempts_profile on public.attempts (student_profile_id);
create index idx_attempts_assignment on public.attempts (assignment_id);

-- ------------------------------------------------------- daily_topics -----
create table public.daily_topics (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  topic text not null,
  skill_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------- achievements ----
create table public.achievements (
  id text primary key,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------- student_achievements ---
create table public.student_achievements (
  profile_id uuid not null references public.student_profiles (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (profile_id, achievement_id)
);
create index idx_student_achievements_profile
  on public.student_achievements (profile_id);

-- ---------------------------------------------------------- admin_notes ----
create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles (id) on delete cascade,
  admin_user_id uuid references public.users (id) on delete set null,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_notes_profile on public.admin_notes (student_profile_id);

-- ------------------------------------------------------- triggers ---------
create trigger trg_users_touch
  before update on public.users
  for each row execute function public.touch_updated_at();
create trigger trg_student_profiles_touch
  before update on public.student_profiles
  for each row execute function public.touch_updated_at();
create trigger trg_mastery_touch
  before update on public.student_skill_mastery
  for each row execute function public.touch_updated_at();
create trigger trg_assignments_touch
  before update on public.assignments
  for each row execute function public.touch_updated_at();
create trigger trg_admin_notes_touch
  before update on public.admin_notes
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------ RLS ---------
alter table public.users enable row level security;
alter table public.student_profiles enable row level security;
alter table public.skills enable row level security;
alter table public.student_skill_mastery enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_items enable row level security;
alter table public.problems enable row level security;
alter table public.attempts enable row level security;
alter table public.daily_topics enable row level security;
alter table public.achievements enable row level security;
alter table public.student_achievements enable row level security;
alter table public.admin_notes enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin'
  );
$$;

-- users: a student reads/updates their own row; admins write all.
create policy users_select_own on public.users
  for select using (id = auth.uid() or public.is_admin());
create policy users_update_own on public.users
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy users_admin_insert on public.users
  for insert with check (public.is_admin());
create policy users_admin_delete on public.users
  for delete using (public.is_admin());

-- student_profiles: owner reads; all writes are admin-only.
create policy profiles_select_own on public.student_profiles
  for select using (user_id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.student_profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Public taxonomy: readable by everyone (incl. anon), writable by admins.
create policy skills_read_all on public.skills
  for select using (true);
create policy skills_admin_write on public.skills
  for all using (public.is_admin()) with check (public.is_admin());
create policy achievements_read_all on public.achievements
  for select using (true);
create policy achievements_admin_write on public.achievements
  for all using (public.is_admin()) with check (public.is_admin());
create policy daily_topics_read_all on public.daily_topics
  for select using (true);
create policy daily_topics_admin_write on public.daily_topics
  for all using (public.is_admin()) with check (public.is_admin());

-- student_skill_mastery: owner reads; admin writes.
create policy mastery_select_own on public.student_skill_mastery
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.student_profiles sp
      where sp.id = profile_id and sp.user_id = auth.uid()
    )
  );
create policy mastery_admin_write on public.student_skill_mastery
  for all using (public.is_admin()) with check (public.is_admin());

-- assignments: owner reads; admin writes.
create policy assignments_select_own on public.assignments
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );
create policy assignments_admin_write on public.assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- assignment_items: visible through the owning assignment; admin writes.
create policy items_select_own on public.assignment_items
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.assignments a
      join public.student_profiles sp on sp.id = a.student_profile_id
      where a.id = assignment_id and sp.user_id = auth.uid()
    )
  );
create policy items_admin_write on public.assignment_items
  for all using (public.is_admin()) with check (public.is_admin());

-- problems: practice content (answers ship to the client by design), so any
-- authenticated user may read; writes are admin-only.
create policy problems_read_authed on public.problems
  for select to authenticated using (true);
create policy problems_admin_write on public.problems
  for all using (public.is_admin()) with check (public.is_admin());

-- attempts: owner reads and appends own rows; admins full access.
create policy attempts_select_own on public.attempts
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );
create policy attempts_insert_own on public.attempts
  for insert to authenticated with check (
    exists (
      select 1 from public.student_profiles sp
      where sp.id = student_profile_id and sp.user_id = auth.uid()
    )
  );
create policy attempts_admin_write on public.attempts
  for all using (public.is_admin()) with check (public.is_admin());

-- student_achievements: owner reads; admin writes.
create policy student_achievements_select_own on public.student_achievements
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.student_profiles sp
      where sp.id = profile_id and sp.user_id = auth.uid()
    )
  );
create policy student_achievements_admin_write on public.student_achievements
  for all using (public.is_admin()) with check (public.is_admin());

-- admin_notes: admin-only (students cannot read notes about themselves).
create policy admin_notes_admin_all on public.admin_notes
  for all using (public.is_admin()) with check (public.is_admin());
