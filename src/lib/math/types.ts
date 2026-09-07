/** Shared types for the deterministic math engine (no LLM in this path). */

export type Difficulty = "easy" | "medium" | "challenge";

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
