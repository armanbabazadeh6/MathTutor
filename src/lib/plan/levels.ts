import { DEFAULT_LEVEL, clampLevel } from "../math/types";
import type { Level } from "../math/types";

export { MIN_LEVEL, MAX_LEVEL, DEFAULT_LEVEL, clampLevel, levelToDifficulty } from "../math/types";
export type { Level } from "../math/types";

/**
 * Per-skill level ladder (1-5) for one 4th grader. The ladder itself lives in
 * `src/lib/math/types.ts` (single source of truth) and is re-exported here so
 * every plan-engine import keeps working unchanged.
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
 * The level drives the generators for real: every generator scales its operand
 * magnitudes, digit counts, denominator sizes, and drawn-value ranges (plus
 * the shape/pool it samples from) through one shared per-level convention
 * (`pickByLevel` in `src/lib/math/generators.ts`), so an L4 problem uses
 * visibly larger numbers than an L3 problem even though both render `medium`.
 * The level/difficulty map stays many-to-one because there are only three
 * difficulty tiers.
 */

/** Cold-start mastery (0-100) for unseen skills. */
export const DEFAULT_MASTERY = 50 as const;

/** Alias kept for the plan engine's existing import surface. */
export type SkillLevel = Level;

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
