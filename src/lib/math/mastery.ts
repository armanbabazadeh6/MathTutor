import type { AttemptResult } from "./types";

/** Outcome accepted by updateMastery: full attempt record or a bare correct boolean. */
export type MasteryOutcome = AttemptResult | boolean;

export const NEW_SKILL_MASTERY = 50;
export const FIRST_TRY_BONUS = 8;
export const HINT_BONUS = 3;
export const FAIL_PENALTY = 5;

function asOutcome(outcome: MasteryOutcome): { correct: boolean; usedHint: boolean } {
  if (typeof outcome === "boolean") return { correct: outcome, usedHint: false };
  return { correct: outcome.correct, usedHint: outcome.usedHint };
}

/**
 * Single-step mastery update on a 0-100 scale.
 *
 * `current` is treated as a recency-weighted average of past performance, so one
 * step nudges it: first-try correct +8, correct-after-hint +3, miss -5.
 * Unseen skills start at 50. Result is rounded and clamped to [0, 100].
 */
export function updateMastery(current: number | undefined, outcome: MasteryOutcome): number {
  const base = current ?? NEW_SKILL_MASTERY;
  const { correct, usedHint } = asOutcome(outcome);
  const next = !correct ? base - FAIL_PENALTY : usedHint ? base + HINT_BONUS : base + FIRST_TRY_BONUS;
  return Math.min(100, Math.max(0, Math.round(next)));
}
