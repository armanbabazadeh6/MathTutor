/** Shared types for the deterministic math engine (no LLM in this path). */

export type Difficulty = "easy" | "medium" | "challenge";

/** Skill level ladder: 1 foundational .. 5 above-grade challenge. */
export type Level = 1 | 2 | 3 | 4 | 5;

/** Lowest rung of the ladder (foundational / prerequisite support). */
export const MIN_LEVEL = 1 as const;
/** Highest rung of the ladder (above-grade challenge / enrichment). */
export const MAX_LEVEL = 5 as const;
/** Cold-start level for a skill the student has not practiced yet. */
export const DEFAULT_LEVEL = 2 as const;

/** Clamp any number onto the 1-5 ladder (floors fractions; defaults non-finite). */
export function clampLevel(n: number): Level {
  if (!Number.isFinite(n)) return DEFAULT_LEVEL;
  const f = Math.floor(n);
  if (f <= MIN_LEVEL) return MIN_LEVEL;
  if (f >= MAX_LEVEL) return MAX_LEVEL;
  return f as Level;
}

/**
 * Band a level onto the generator difficulty tier. Many-to-one by design:
 * 1-2 -> easy, 3-4 -> medium, 5 -> challenge. Magnitude/steps inside a band
 * still scale with the level (see the generators' `pickByLevel` convention).
 */
export function levelToDifficulty(level: Level): Difficulty {
  if (level <= 2) return "easy";
  if (level <= 4) return "medium";
  return "challenge";
}

export type AnswerType = "integer" | "decimal" | "fraction" | "text";

/** Skill id referencing the registry in `src/lib/skills.ts` (e.g. "bt-add-multidigit"). */
export type SkillRef = string;

export interface Problem {
  id: string;
  skill: SkillRef;
  difficulty: Difficulty;
  answerType: AnswerType;
  /** Student-facing prompt. */
  text: string;
  /** Canonical answer. Grading compares against this only. */
  answer: string;
  hint1: string;
  hint2: string;
  explanation: string;
}

export interface AttemptResult {
  correct: boolean;
  usedHint: boolean;
  submitted: string;
}

/** skillId -> mastery score on a 0-100 scale. */
export type MasteryMap = Record<string, number>;
