import { updateMastery } from "../math/mastery";
import { DEFAULT_LEVEL, DEFAULT_MASTERY, MAX_LEVEL, MIN_LEVEL, clampLevel } from "./levels";
import type { SkillLevel } from "./levels";

/** Consecutive first-try correct answers on a skill that trigger a level-up. */
export const PROMOTION_STREAK = 3;
/** Exhausted-attempt events in the recent window that trigger a level-down. */
export const DEMOTION_EXHAUSTED_COUNT = 2;
/** How many recent events per skill the demotion count is evaluated over. */
export const RECENT_WINDOW = 5;
/** Mastery below this (0-100) forces a level-down + reteach flag. */
export const LOW_MASTERY_DEMOTION = 30;
/** Mastery at or above this counts as solid when blending recent outcomes. */
export const SOLID_MASTERY = 70;

/** One practiced question on a skill, newest last. */
export interface SkillHistoryEntry {
  skillId: string;
  /** Correct on the first try with no hint. */
  firstTryCorrect: boolean;
  /** All attempts on the question were used up without success. */
  exhaustedAttempts: boolean;
  /** Eventually answered correctly (any attempt). */
  correct: boolean;
  /** A hint was used on the question. */
  usedHint: boolean;
}

/** Outcome of applying promotion/demotion rules to one skill. */
export interface LevelUpdate {
  level: SkillLevel;
  mastery: number;
  promoted: boolean;
  demoted: boolean;
  /** True when the skill needs reteaching at the lowered level. */
  reteach: boolean;
}

export interface ApplyRulesInput {
  level?: number;
  mastery?: number;
  /** Chronological outcomes for THIS skill only (oldest first). */
  recent: SkillHistoryEntry[];
}

/** Count the trailing run of first-try-correct entries (newest backwards). */
export function trailingFirstTryStreak(recent: SkillHistoryEntry[]): number {
  let n = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].firstTryCorrect) n++;
    else break;
  }
  return n;
}

/** Count exhausted-attempt events inside the recent window. */
export function exhaustedInWindow(recent: SkillHistoryEntry[], window = RECENT_WINDOW): number {
  const slice = recent.slice(Math.max(0, recent.length - window));
  let n = 0;
  for (const e of slice) if (e.exhaustedAttempts) n++;
  return n;
}

/**
 * Blend recent outcomes into mastery by folding the shared `updateMastery`
 * step over each entry in order (correct/usedHint per entry). One function,
 * one scale: rules and the rest of the app share the same 0-100 model.
 */
export function blendMastery(current: number | undefined, recent: SkillHistoryEntry[]): number {
  let m = current ?? DEFAULT_MASTERY;
  for (const e of recent) {
    m = updateMastery(m, { correct: e.correct, usedHint: e.usedHint, submitted: "" });
  }
  return m;
}

/**
 * Apply promotion/demotion for one skill:
 * - Promotion: trailing first-try streak >= PROMOTION_STREAK -> level +1 (cap MAX_LEVEL).
 * - Demotion: exhausted count in window >= DEMOTION_EXHAUSTED_COUNT OR
 *   blended mastery < LOW_MASTERY_DEMOTION -> level -1 (floor MIN_LEVEL) + reteach flag.
 * - Demotion takes precedence over promotion when both fire.
 * Mastery is always blended from recent outcomes first, then thresholds apply.
 */
export function applyRulesForSkill(input: ApplyRulesInput): LevelUpdate {
  const level = clampLevel(input.level ?? DEFAULT_LEVEL);
  const mastery = blendMastery(input.mastery, input.recent);
  const streak = trailingFirstTryStreak(input.recent);
  const exhausted = exhaustedInWindow(input.recent);

  const shouldDemote = exhausted >= DEMOTION_EXHAUSTED_COUNT || mastery < LOW_MASTERY_DEMOTION;
  if (shouldDemote) {
    const next = clampLevel(level - 1);
    return {
      level: next,
      mastery,
      promoted: false,
      demoted: next !== level,
      reteach: true,
    };
  }

  if (streak >= PROMOTION_STREAK) {
    const next = clampLevel(level + 1);
    return {
      level: next,
      mastery,
      promoted: next !== level,
      demoted: false,
      reteach: false,
    };
  }

  return { level, mastery, promoted: false, demoted: false, reteach: false };
}

/** Group a mixed chronological history by skill id (order preserved per skill). */
export function groupBySkill(history: SkillHistoryEntry[]): Map<string, SkillHistoryEntry[]> {
  const out = new Map<string, SkillHistoryEntry[]>();
  for (const e of history) {
    const arr = out.get(e.skillId);
    if (arr) arr.push(e);
    else out.set(e.skillId, [e]);
  }
  return out;
}
