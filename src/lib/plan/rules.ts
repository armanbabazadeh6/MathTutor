import { updateMastery } from "../math/mastery";
import { DEFAULT_LEVEL, DEFAULT_MASTERY, clampLevel } from "./levels";
import type { SkillLevel } from "./levels";

/** Consecutive promotion-eligible wins on a skill that trigger a level-up. */
export const PROMOTION_STREAK = 3;
/** Exhausted-attempt events in the recent window that trigger a level-down. */
export const DEMOTION_EXHAUSTED_COUNT = 2;
/** How many recent events per skill the demotion count is evaluated over. */
export const RECENT_WINDOW = 5;
/** Mastery below this (0-100) forces a level-down + reteach flag. */
export const LOW_MASTERY_DEMOTION = 30;

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
  /** Epoch ms the attempt was graded; absent on legacy entries (order is the fallback). */
  at?: number;
}

/** Outcome of applying promotion/demotion rules to one skill. */
export interface LevelUpdate {
  level: SkillLevel;
  mastery: number;
  promoted: boolean;
  demoted: boolean;
  /** True when the skill needs reteaching at the lowered level. */
  reteach: boolean;
  /** Streak length consumed by the last promotion (persist and feed back in). */
  promotedAtStreak: number;
  /** Exhausted-in-window count consumed by the last demotion (persist and feed back in). */
  demotedAtExhausted: number;
}

export interface ApplyRulesInput {
  level?: number;
  mastery?: number;
  /** Chronological outcomes for THIS skill only (oldest first). */
  recent: SkillHistoryEntry[];
  /**
   * The entries in `recent` that `mastery` has not folded yet — normally just
   * the entry being recorded. Mastery folds over these only, so persisting the
   * blended value and feeding it back stays single-fold on the full history
   * (promotion/demotion windows still see all of `recent`). Omit it for a
   * one-shot evaluation of a fresh history (`mastery` unset/stale): the whole
   * `recent` list is then folded, which is the same thing for one call.
   */
  newOutcomes?: SkillHistoryEntry[];
  /** Streak length observed at the last promotion; the run must grow a full PROMOTION_STREAK past it. */
  promotedAtStreak?: number;
  /** Exhausted-in-window count observed at the last demotion; guards repeat demotion. */
  demotedAtExhausted?: number;
}

/**
 * True when an entry counts toward promotion: correct without exhausting all
 * attempts. This deliberately includes a reteach win, which is recorded as
 * `correct: true, firstTryCorrect: false, usedHint: true`.
 */
export function isPromotionEligible(entry: SkillHistoryEntry): boolean {
  return entry.correct && !entry.exhaustedAttempts;
}

/**
 * Count the trailing run of promotion-eligible entries (newest backwards).
 * Despite the historical name this counts every eligible win, not only
 * first-try wins, so a correct reteach answer keeps the run alive.
 */
export function trailingFirstTryStreak(recent: SkillHistoryEntry[]): number {
  let n = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (isPromotionEligible(recent[i])) n++;
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
 * Blend outcomes into mastery by folding the shared `updateMastery` step over
 * each entry in order. One function, one scale: rules and the rest of the app
 * share the same 0-100 model.
 *
 * Each entry moves the value once, so callers must pass only the entries that
 * have not been folded into `current` yet — folding a full history onto a
 * mastery that already contains it double-counts (a skill hit 98% after three
 * correct answers). `ApplyRulesInput.newOutcomes` carries that delta.
 *
 * The first-try bonus is reserved for genuinely first-try wins; any other
 * correct answer (a retry, or a hint-assisted win such as a reteach success)
 * earns the smaller hint-sized nudge.
 */
export function blendMastery(current: number | undefined, recent: SkillHistoryEntry[]): number {
  let m = current ?? DEFAULT_MASTERY;
  for (const e of recent) {
    const usedHint = e.usedHint || (e.correct && !e.firstTryCorrect);
    m = updateMastery(m, { correct: e.correct, usedHint, submitted: "" });
  }
  return m;
}

/**
 * Apply promotion/demotion for one skill. Both thresholds fire on a fresh
 * *crossing*, never on every event, and the call is idempotent: evaluating the
 * same history twice yields the same level and no second change.
 *
 * Promotion: needs a trailing run of PROMOTION_STREAK eligible wins that is a
 * full PROMOTION_STREAK longer than the run consumed by the last promotion.
 * `promotedAtStreak` therefore records the run length at the last promotion
 * (0 when there has never been one), so a 3-win run promotes once and a 4th or
 * 5th consecutive win does not promote again until the run reaches 6.
 *
 * Demotion: an exhausted trigger fires when the window count is at least
 * DEMOTION_EXHAUSTED_COUNT *new* exhausted events past the last demotion
 * (`demotedAtExhausted` records the count consumed); a mastery trigger fires
 * when mastery is below LOW_MASTERY_DEMOTION and no demotion has been consumed
 * yet (`demotedAtExhausted === 0`). A demotion resets `promotedAtStreak`, and a
 * promotion resets `demotedAtExhausted`, so the counters cannot leak across
 * directions. Demotion takes precedence when both fire.
 *
 * Mastery is always blended from recent outcomes first, then thresholds apply.
 */
export function applyRulesForSkill(input: ApplyRulesInput): LevelUpdate {
  const level = clampLevel(input.level ?? DEFAULT_LEVEL);
  const mastery = blendMastery(input.mastery, input.newOutcomes ?? input.recent);
  const streak = trailingFirstTryStreak(input.recent);
  const exhausted = exhaustedInWindow(input.recent);
  const promotedAtStreak = Math.max(0, Math.floor(input.promotedAtStreak ?? 0));
  const demotedAtExhausted = Math.max(0, Math.floor(input.demotedAtExhausted ?? 0));

  const exhaustedCrossed =
    exhausted >= DEMOTION_EXHAUSTED_COUNT &&
    exhausted >= demotedAtExhausted + DEMOTION_EXHAUSTED_COUNT;
  const masteryCrossed = mastery < LOW_MASTERY_DEMOTION && demotedAtExhausted < 1;

  if (exhaustedCrossed || masteryCrossed) {
    const next = clampLevel(level - 1);
    return {
      level: next,
      mastery,
      promoted: false,
      demoted: next !== level,
      reteach: true,
      promotedAtStreak: 0,
      demotedAtExhausted: Math.max(exhausted, 1),
    };
  }

  if (streak >= PROMOTION_STREAK && streak >= promotedAtStreak + PROMOTION_STREAK) {
    const next = clampLevel(level + 1);
    return {
      level: next,
      mastery,
      promoted: next !== level,
      demoted: false,
      reteach: false,
      promotedAtStreak: streak,
      demotedAtExhausted: 0,
    };
  }

  return {
    level,
    mastery,
    promoted: false,
    demoted: false,
    reteach: false,
    promotedAtStreak,
    demotedAtExhausted,
  };
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
