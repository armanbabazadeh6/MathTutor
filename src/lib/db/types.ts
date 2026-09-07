// src/lib/db/types.ts
// Row types mirroring supabase/migrations/0001_init.sql column-for-column.
// Timestamps arrive as ISO strings; numeric scores are 0..1 fractions.

export type UserRole = "student" | "admin";

export type AssignmentStatus = "assigned" | "in_progress" | "completed";

export interface UserRow {
  id: string;
  username: string | null;
  email: string | null;
  role: UserRole;
  /** Opaque PIN verifier stub; null for admins. Never a raw PIN. */
  pin_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  grade: number | null;
  created_at: string;
  updated_at: string;
}

export interface SkillRow {
  id: string;
  domain: string;
  name: string;
  description: string;
  created_at: string;
}

export interface StudentSkillMasteryRow {
  profile_id: string;
  skill_id: string;
  score: number;
  attempts_count: number;
  created_at: string;
  updated_at: string;
}

export interface AssignmentRow {
  id: string;
  student_profile_id: string;
  /** Calendar date as YYYY-MM-DD. */
  date: string;
  topic: string;
  status: AssignmentStatus;
  started_at: string | null;
  completed_at: string | null;
  /** Fraction correct, 0..1; null until scored. */
  score: number | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentItemRow {
  id: string;
  assignment_id: string;
  skill_id: string;
  position: number;
  created_at: string;
}

export interface ProblemRow {
  id: string;
  assignment_item_id: string | null;
  skill_id: string;
  stem: string;
  correct_answer: string;
  /** Optional multiple-choice options as a JSON array of strings. */
  choices: string[] | null;
  created_at: string;
}

export interface AttemptRow {
  id: string;
  problem_id: string;
  student_profile_id: string;
  assignment_id: string | null;
  submitted_answer: string;
  correct: boolean;
  attempt_no: number;
  hint_level: number;
  /** Milliseconds from problem display to submit; null when untimed. */
  response_ms: number | null;
  created_at: string;
}

export interface DailyTopicRow {
  id: string;
  /** Calendar date as YYYY-MM-DD; unique. */
  date: string;
  topic: string;
  skill_ids: string[];
  created_at: string;
}

export interface AchievementRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface StudentAchievementRow {
  profile_id: string;
  achievement_id: string;
  earned_at: string;
}

export interface AdminNoteRow {
  id: string;
  student_profile_id: string;
  admin_user_id: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

// Insert/Update shapes: server defaults cover id/timestamps/counters, so
// callers omit them; everything else follows the column nullability above.
export type UserInsert = Omit<UserRow, "id" | "created_at" | "updated_at">;
export type UserUpdate = Partial<UserInsert>;
export type StudentProfileInsert = Omit<StudentProfileRow, "id" | "created_at" | "updated_at">;
export type StudentProfileUpdate = Partial<StudentProfileInsert>;
export type SkillInsert = Omit<SkillRow, "created_at">;
export type SkillUpdate = Partial<Omit<SkillRow, "id">>;
export type StudentSkillMasteryInsert = Omit<
  StudentSkillMasteryRow,
  "score" | "attempts_count" | "created_at" | "updated_at"
> &
  Partial<Pick<StudentSkillMasteryRow, "score" | "attempts_count">>;
export type StudentSkillMasteryUpdate = Partial<
  Pick<StudentSkillMasteryRow, "score" | "attempts_count">
>;
export type AssignmentInsert = Omit<AssignmentRow, "id" | "created_at" | "updated_at">;
export type AssignmentUpdate = Partial<
  Omit<AssignmentRow, "id" | "student_profile_id" | "created_at" | "updated_at">
>;
export type AssignmentItemInsert = Omit<AssignmentItemRow, "id" | "created_at">;
export type AssignmentItemUpdate = Partial<Omit<AssignmentItemRow, "id" | "created_at">>;
export type ProblemInsert = Omit<ProblemRow, "id" | "created_at">;
export type ProblemUpdate = Partial<Omit<ProblemRow, "id" | "created_at">>;
/** Attempts are append-only: no Update type by design. */
export type AttemptInsert = Omit<AttemptRow, "id" | "created_at">;
export type DailyTopicInsert = Omit<DailyTopicRow, "id" | "created_at">;
export type DailyTopicUpdate = Partial<Omit<DailyTopicRow, "id" | "created_at">>;
export type AchievementInsert = Omit<AchievementRow, "created_at">;
export type AchievementUpdate = Partial<Omit<AchievementRow, "id">>;
export type StudentAchievementInsert = Omit<StudentAchievementRow, "earned_at"> &
  Partial<Pick<StudentAchievementRow, "earned_at">>;
export type AdminNoteInsert = Omit<AdminNoteRow, "id" | "created_at" | "updated_at">;
export type AdminNoteUpdate = Partial<Pick<AdminNoteRow, "note">>;

// supabase-js generic surface: Tables.<name>.Row/Insert/Update.
export interface Database {
  public: {
    Tables: {
      users: { Row: UserRow; Insert: UserInsert; Update: UserUpdate };
      student_profiles: {
        Row: StudentProfileRow;
        Insert: StudentProfileInsert;
        Update: StudentProfileUpdate;
      };
      skills: { Row: SkillRow; Insert: SkillInsert; Update: SkillUpdate };
      student_skill_mastery: {
        Row: StudentSkillMasteryRow;
        Insert: StudentSkillMasteryInsert;
        Update: StudentSkillMasteryUpdate;
      };
      assignments: { Row: AssignmentRow; Insert: AssignmentInsert; Update: AssignmentUpdate };
      assignment_items: {
        Row: AssignmentItemRow;
        Insert: AssignmentItemInsert;
        Update: AssignmentItemUpdate;
      };
      problems: { Row: ProblemRow; Insert: ProblemInsert; Update: ProblemUpdate };
      attempts: { Row: AttemptRow; Insert: AttemptInsert; Update: never };
      daily_topics: {
        Row: DailyTopicRow;
        Insert: DailyTopicInsert;
        Update: DailyTopicUpdate;
      };
      achievements: {
        Row: AchievementRow;
        Insert: AchievementInsert;
        Update: AchievementUpdate;
      };
      student_achievements: {
        Row: StudentAchievementRow;
        Insert: StudentAchievementInsert;
        Update: never;
      };
      admin_notes: { Row: AdminNoteRow; Insert: AdminNoteInsert; Update: AdminNoteUpdate };
    };
  };
}
