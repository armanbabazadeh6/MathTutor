import { clampLevel } from "./levels";
import type { SkillLevel } from "./levels";

/** Milliseconds in one day; the unit of every interval here. */
export const DAY_MS = 86_400_000;

/**
 * Spaced-review ladder, indexed by consecutive successful reviews:
 * 0 -> 1 day, 1 -> 3, 2 -> 7, 3 -> 16, 4+ -> 35. Monotonically non-decreasing.
 */
export const REVIEW_LADDER_DAYS = [1, 3, 7, 16, 35] as const;

/** Mastery 0 -> half-length, mastery 100 -> 1.5x. Neutral at 50. */
function masteryFactor(mastery: number): number {
  const m = Number.isFinite(mastery) ? Math.min(100, Math.max(0, mastery)) : 50;
  return 0.5 + m / 100;
}

/** L1 -> 0.8x ... L5 -> 1.2x. Neutral at L3. */
function levelFactor(level: SkillLevel): number {
  return 0.8 + (clampLevel(level) - 1) * 0.1;
}

/**
 * SM-2-lite interval in days for a skill the student is due to review.
 *
 * The rung is chosen by how many times in a row the skill was answered well;
 * low mastery shortens the interval and a higher level stretches it. Always
 * at least one day so a review never becomes immediately due again.
 */
export function reviewIntervalDays(
  level: SkillLevel,
  mastery: number,
  consecutiveSuccesses: number,
): number {
  const rung = Math.min(
    REVIEW_LADDER_DAYS.length - 1,
    Math.max(0, Math.floor(consecutiveSuccesses)),
  );
  const raw = REVIEW_LADDER_DAYS[rung] * masteryFactor(mastery) * levelFactor(level);
  return Math.max(1, Math.round(raw));
}

/**
 * True when a skill is due for review at `now` (epoch ms).
 *
 * A skill with no recorded sighting is always due; otherwise it is due once
 * `intervalDays` have elapsed since it was last seen.
 */
export function isDue(lastSeenAt: number | undefined, intervalDays: number, now: number): boolean {
  if (lastSeenAt === undefined || !Number.isFinite(lastSeenAt)) return true;
  const interval = Number.isFinite(intervalDays) ? Math.max(0, intervalDays) : 0;
  return lastSeenAt + interval * DAY_MS <= now;
}
