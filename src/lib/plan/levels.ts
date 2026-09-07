import type { Difficulty } from "../math/types";

/**
 * Per-skill level ladder (1-5) for one 4th grader.
 *
 * Level meanings:
 * - 1 = Foundational: prerequisite / below-grade support. Concrete models,
 *   smallest numbers, heavy scaffolding. Maps to `easy` generator output.
 * - 2 = Developing: on-ramp to grade level. Grade-4 concepts with small,
 *   friendly numbers and full hints. Maps to `easy`. This is the cold-start
 *   default: approachable without being trivial.
 * - 3 = Grade-level: at-expectation 4th-grade work. Standard ranges and
 *   two-step thinking. Maps to `medium`.
 * - 4 = Proficient: fluent grade-level work with larger numbers, extra steps,
 *   and distractors. Maps to `medium`.
 * - 5 = Above-grade challenge: stretch / enrichment past the grade bar.
 *   Maps to `challenge`.
 *
 * Generator-difficulty mapping is intentionally many-to-one because the
 * deterministic generators only emit three difficulties:
 *   L1/L2 -> "easy", L3/L4 -> "medium", L5 -> "challenge".
 * Within a difficulty band, callers scale magnitude/steps by level
 * (e.g. L4 uses larger operands than L3 at the same "medium" difficulty).
 */

/** Lowest level on the ladder (foundational). */
export const MIN_LEVEL = 1 as const;
/** Highest level on the ladder (above-grade challenge). */
export const MAX_LEVEL = 5 as const;
/** Cold-start level for unseen skills. */
export const DEFAULT_LEVEL = 2 as const;
/** Cold-start mastery (0-100) for unseen skills. */
export const DEFAULT_MASTERY = 50 as const;

/** Level ladder values. */
export type SkillLevel = 1 | 2 | 3 | 4 | 5;

/** skillId -> level. Plain JSON object; persistable. */
export type LevelsMap = Record<string, SkillLevel>;

/** Human-readable meaning per level (documented ladder). */
export const LEVEL_MEANINGS: Record<SkillLevel, string> = {
  1: "Foundational: prerequisite support below grade level",
  2: "Developing: on-ramp to grade level (cold-start default)",
  3: "Grade-level: at-expectation 4th-grade work",
  4: "Proficient: fluent grade-level work, larger numbers and extra steps",
  5: "Above-grade challenge: stretch enrichment past the grade bar",
};

/** Short label per level. */
export const LEVEL_LABELS: Record<SkillLevel, string> = {
  1: "foundational",
  2: "developing",
  3: "grade-level",
  4: "proficient",
  5: "challenge",
};

/**
 * Generator difficulty for a level. Many-to-one:
 * 1-2 -> easy, 3-4 -> medium, 5 -> challenge.
 */
export function levelToDifficulty(level: SkillLevel): Difficulty {
  if (level <= 2) return "easy";
  if (level <= 4) return "medium";
  return "challenge";
}

/** Clamp any number to the 1-5 ladder (floors fractions). */
export function clampLevel(n: number): SkillLevel {
  if (!Number.isFinite(n)) return DEFAULT_LEVEL;
  const f = Math.floor(n);
  if (f <= MIN_LEVEL) return 1;
  if (f >= MAX_LEVEL) return 5;
  return f as SkillLevel;
}

/** Normalize one raw value into the ladder. */
export function normalizeLevel(raw: unknown): SkillLevel {
  return typeof raw === "number" ? clampLevel(raw) : DEFAULT_LEVEL;
}

/** Normalize a persisted map: drop non-ladder values back to default. */
export function normalizeLevelsMap(raw: Record<string, unknown> | undefined): LevelsMap {
  const out: LevelsMap = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) out[k] = normalizeLevel(v);
  return out;
}

/** True when the value is a ladder level. */
export function isSkillLevel(v: unknown): v is SkillLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}
