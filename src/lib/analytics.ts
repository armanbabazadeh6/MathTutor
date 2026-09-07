// MathTutor — admin analytics.
//
// Pure functions over local assignment history. No I/O, no Date.now(), no
// React: every function takes its inputs as arguments so results are trivially
// testable and the same code can run against Supabase rows later.
//
// SUPABASE SWAP: map tables to the record types below —
//   assignments table -> AssignmentRecord (id, date, skill_ids, question_ids,
//     completed_question_ids, difficulty, status)
//   attempts table     -> AttemptRecord (one row per attempt per question)
// Dates are local "YYYY-MM-DD" strings; timestamps are ISO strings.
//
// Mastery model (documented, v1): per skill,
//   mastery = round(100 * (0.7 * accuracy + 0.3 * firstAttemptAccuracy))
// where accuracy is over all attempts and firstAttemptAccuracy over each
// question's first attempt. 70/30 weights reward eventual correctness while
// still valuing getting it right the first time.

import type { Skill } from "./skills";

export type AssignmentDifficulty = "warmup" | "grade" | "challenge";

export type AssignmentStatus = "assigned" | "in-progress" | "completed";

export interface AttemptRecord {
  id: string;
  assignmentId: string;
  skillId: Skill["id"];
  questionId: string;
  /** 1-based attempt number for this question within its session. */
  attemptNumber: number;
  correct: boolean;
  /** Seconds spent on this attempt. */
  durationSec: number;
  /** Student's actual answer (for the wrong-answer inspector). */
  givenAnswer: string;
  expectedAnswer: string;
  createdAt: string;
}

export interface AssignmentRecord {
  id: string;
  /** Local date "YYYY-MM-DD". */
  date: string;
  skillIds: Skill["id"][];
  questionIds: string[];
  completedQuestionIds: string[];
  difficulty: AssignmentDifficulty;
  status: AssignmentStatus;
}

export interface SkillMastery {
  skillId: Skill["id"];
  questions: number;
  attempts: number;
  accuracy: number;
  firstAttemptAccuracy: number;
  /** 0-100 blended score; see module doc. */
  mastery: number;
}

export interface MistakePattern {
  skillId: Skill["id"];
  /** Wrong attempts on this skill. */
  misses: number;
  /** All attempts on this skill. */
  total: number;
  missRate: number;
  examples: { questionId: string; givenAnswer: string; expectedAnswer: string }[];
}

export interface StatSummary {
  completionPct: number;
  questionsTotal: number;
  questionsDone: number;
  attempts: number;
  correct: number;
  accuracy: number;
  firstAttemptAccuracy: number;
  timeSec: number;
  streakDays: number;
}

export interface TodayStatus {
  date: string;
  assigned: number;
  completed: number;
  totalQuestions: number;
  doneQuestions: number;
  complete: boolean;
}

/** % of an assignment's questions completed. Empty assignment -> 0. */
export function completionPct(a: AssignmentRecord): number {
  if (a.questionIds.length === 0) return 0;
  const done = new Set(a.completedQuestionIds).size;
  return Math.min(100, Math.round((done / a.questionIds.length) * 100));
}

/** Fraction of attempts correct. No attempts -> 0. */
export function accuracyOf(attempts: AttemptRecord[]): number {
  if (attempts.length === 0) return 0;
  return attempts.filter((a) => a.correct).length / attempts.length;
}

/**
 * Fraction of questions answered correctly on the first try. Uses each
 * question's lowest attemptNumber as "first" (robust to 0-based writers).
 * No first attempts -> 0.
 */
export function firstAttemptAccuracyOf(attempts: AttemptRecord[]): number {
  if (attempts.length === 0) return 0;
  const firstByQuestion = new Map<string, AttemptRecord>();
  for (const a of attempts) {
    const prev = firstByQuestion.get(a.questionId);
    if (!prev || a.attemptNumber < prev.attemptNumber) firstByQuestion.set(a.questionId, a);
  }
  const firsts = Array.from(firstByQuestion.values());
  if (firsts.length === 0) return 0;
  return firsts.filter((a) => a.correct).length / firsts.length;
}

/** Total seconds spent across attempts. */
export function totalTimeSec(attempts: AttemptRecord[]): number {
  return attempts.reduce((sum, a) => sum + Math.max(0, a.durationSec), 0);
}

/** "125s" -> "2m 5s"; "45s" -> "45s"; 0 -> "0s". */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m === 0) return `${rest}s`;
  return rest === 0 ? `${m}m` : `${m}m ${rest}s`;
}

/** Sorted unique dates of completed assignments. */
export function completedDates(assignments: AssignmentRecord[]): string[] {
  const dates = new Set<string>();
  for (const a of assignments) if (a.status === "completed") dates.add(a.date);
  return Array.from(dates).sort();
}

function toDay(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function toDateStr(day: number): string {
  const t = new Date(day * 86_400_000);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Current daily streak. Counts consecutive completed days ending today; if
 * today is not yet complete the streak runs through yesterday (an incomplete
 * today does not zero an active streak). No completions -> 0.
 */
export function currentStreakDays(dates: string[], today: string): number {
  const set = new Set(dates);
  if (set.size === 0) return 0;
  let cursor = set.has(today) ? toDay(today) : toDay(today) - 1;
  let streak = 0;
  while (set.has(toDateStr(cursor))) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

/** Longest run of consecutive completed days. Empty -> 0. */
export function longestStreakDays(dates: string[]): number {
  if (dates.length === 0) return 0;
  const days = Array.from(new Set(dates)).map(toDay).sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) {
      run += 1;
      best = Math.max(best, run);
    } else if (days[i] !== days[i - 1]) {
      run = 1;
    }
  }
  return best;
}

/** Per-skill mastery blended per the module doc. Sorted strongest first. */
export function masteryBySkill(attempts: AttemptRecord[]): SkillMastery[] {
  const bySkill = new Map<string, AttemptRecord[]>();
  for (const a of attempts) {
    const list = bySkill.get(a.skillId);
    if (list) list.push(a);
    else bySkill.set(a.skillId, [a]);
  }
  const out: SkillMastery[] = [];
  bySkill.forEach((list, skillId) => {
    const accuracy = accuracyOf(list);
    const firstAttemptAccuracy = firstAttemptAccuracyOf(list);
    out.push({
      skillId,
      questions: new Set(list.map((a) => a.questionId)).size,
      attempts: list.length,
      accuracy,
      firstAttemptAccuracy,
      mastery: Math.round(100 * (0.7 * accuracy + 0.3 * firstAttemptAccuracy)),
    });
  });
  return out.sort((a, b) => b.mastery - a.mastery || b.attempts - a.attempts);
}

/** Top-n mastered skills with at least one attempt. */
export function strongestTopics(masteries: SkillMastery[], n = 3): SkillMastery[] {
  return masteries.filter((m) => m.attempts > 0).slice(0, Math.max(0, n));
}

/** Bottom-n mastered skills with at least one attempt, weakest first. */
export function weakestTopics(masteries: SkillMastery[], n = 3): SkillMastery[] {
  return [...masteries]
    .filter((m) => m.attempts > 0)
    .sort((a, b) => a.mastery - b.mastery || b.attempts - a.attempts)
    .slice(0, Math.max(0, n));
}

/**
 * Wrong-answer clusters by skill, most-missed first. Examples are the first
 * `limitExamples` distinct wrong questions per skill (inspector fuel).
 */
export function mistakePatterns(
  attempts: AttemptRecord[],
  limitExamples = 3,
): MistakePattern[] {
  const bySkill = new Map<string, AttemptRecord[]>();
  for (const a of attempts) {
    const list = bySkill.get(a.skillId);
    if (list) list.push(a);
    else bySkill.set(a.skillId, [a]);
  }
  const out: MistakePattern[] = [];
  bySkill.forEach((list, skillId) => {
    const wrong = list.filter((a) => !a.correct);
    if (wrong.length === 0) return;
    const seen = new Set<string>();
    const examples: MistakePattern["examples"] = [];
    for (const w of wrong) {
      if (seen.has(w.questionId)) continue;
      seen.add(w.questionId);
      if (examples.length < Math.max(0, limitExamples)) {
        examples.push({
          questionId: w.questionId,
          givenAnswer: w.givenAnswer,
          expectedAnswer: w.expectedAnswer,
        });
      }
    }
    out.push({
      skillId,
      misses: wrong.length,
      total: list.length,
      missRate: wrong.length / list.length,
      examples,
    });
  });
  return out.sort((a, b) => b.misses - a.misses || b.missRate - a.missRate);
}

export interface RecommendOptions {
  count?: number;
  /** Skills at/above this mastery are deprioritized, not excluded. Default 80. */
  targetBelow?: number;
  /** Disabled or manually excluded skill ids. */
  exclude?: string[];
}

/**
 * Tomorrow's focus skills: weakest first, skills below `targetBelow` ahead of
 * the rest, excluded ids dropped. Falls back to stronger skills so the count
 * is met whenever practiced skills exist.
 */
export function recommendTomorrow(
  masteries: SkillMastery[],
  opts: RecommendOptions = {},
): string[] {
  const { count = 3, targetBelow = 80, exclude = [] } = opts;
  const excluded = new Set(exclude);
  const pool = [...masteries]
    .filter((m) => m.attempts > 0 && !excluded.has(m.skillId))
    .sort((a, b) => a.mastery - b.mastery || b.attempts - a.attempts);
  const weak = pool.filter((m) => m.mastery < targetBelow);
  const rest = pool.filter((m) => m.mastery >= targetBelow);
  return [...weak, ...rest].slice(0, Math.max(0, count)).map((m) => m.skillId);
}

/** One-call session rollup for the stat grid. */
export function summarizeSession(
  assignment: AssignmentRecord,
  attempts: AttemptRecord[],
  allAssignments: AssignmentRecord[],
  today: string,
): StatSummary {
  const mine = attempts.filter((a) => a.assignmentId === assignment.id);
  const correct = mine.filter((a) => a.correct).length;
  return {
    completionPct: completionPct(assignment),
    questionsTotal: assignment.questionIds.length,
    questionsDone: new Set(assignment.completedQuestionIds).size,
    attempts: mine.length,
    correct,
    accuracy: accuracyOf(mine),
    firstAttemptAccuracy: firstAttemptAccuracyOf(mine),
    timeSec: totalTimeSec(mine),
    streakDays: currentStreakDays(completedDates(allAssignments), today),
  };
}

/** Today's aggregate for the status card. */
export function todayStatus(
  assignments: AssignmentRecord[],
  date: string,
): TodayStatus {
  const todays = assignments.filter((a) => a.date === date);
  const totalQuestions = todays.reduce((n, a) => n + a.questionIds.length, 0);
  const doneQuestions = todays.reduce(
    (n, a) => n + new Set(a.completedQuestionIds).size,
    0,
  );
  const completed = todays.filter((a) => a.status === "completed").length;
  return {
    date,
    assigned: todays.length,
    completed,
    totalQuestions,
    doneQuestions,
    complete:
      todays.length > 0 &&
      completed === todays.length &&
      (totalQuestions === 0 || doneQuestions >= totalQuestions),
  };
}
