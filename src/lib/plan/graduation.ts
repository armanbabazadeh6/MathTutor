import { SKILLS } from "../skills";
import type { SkillDomain } from "../skills";
import { ALL_SKILLS } from "../math/generators";
import type { MasteryMap } from "../math/types";
import { DEFAULT_LEVEL, DEFAULT_MASTERY } from "./levels";
import type { LevelsMap } from "./levels";

/** Mean level across a domain's grade-4 skills needed to graduate the domain. */
export const GRADUATION_MIN_AVG_LEVEL = 4 as const;
/** Mean mastery (0-100) across a domain's grade-4 skills needed to graduate the domain. */
export const GRADUATION_MIN_AVG_MASTERY = 75 as const;
/**
 * Share of a domain's grade-4 skills that must individually sit at
 * level >= 4 AND mastery >= 75 before the domain graduates. Guards the
 * means against one maxed skill masking several weak ones.
 */
export const GRADUATION_COVERAGE = 0.8 as const;
/** Graduated domains needed before the global "Fifth Grade!" unlock fires. */
export const GLOBAL_GRADUATION_DOMAINS_NEEDED = 3 as const;
/** Display name for the global fifth-grade unlock. */
export const FIFTH_GRADE_UNLOCK_NAME = "Fifth Grade!" as const;

/** Per-skill bar a grade-4 skill must clear to count toward domain coverage. */
export const GRADUATION_SKILL_LEVEL = 4 as const;
export const GRADUATION_SKILL_MASTERY = 75 as const;

/** Grade-4 skill ids in a domain (the full registry base, generators or not). */
export function grade4SkillsForDomain(domain: SkillDomain): string[] {
  return SKILLS.filter((s) => s.domain === domain && s.grade === 4).map((s) => s.id);
}

const GENERATOR_BACKED = new Set(ALL_SKILLS);

/**
 * Grade-4 skill ids in a domain that have a deterministic generator, i.e. the
 * skills a kid can actually practice and be graded on. This is the graduation
 * basis: registry-only skills would otherwise sit at DEFAULT_LEVEL/MASTERY
 * forever and make graduation mathematically unreachable.
 */
export function grade4GeneratorSkillsForDomain(domain: SkillDomain): string[] {
  return SKILLS.filter(
    (s) => s.domain === domain && s.grade === 4 && GENERATOR_BACKED.has(s.id),
  ).map((s) => s.id);
}

/** Grade-5 skill ids in a domain (the unlock reward). */
export function grade5SkillsForDomain(domain: SkillDomain): string[] {
  return SKILLS.filter((s) => s.domain === domain && s.grade === 5).map((s) => s.id);
}

export interface DomainGraduationStatus {
  domain: SkillDomain;
  /** Mean level across the domain's generator-backed grade-4 skills (missing -> DEFAULT_LEVEL). */
  avgLevel: number;
  /** Mean mastery across those skills (missing -> DEFAULT_MASTERY). */
  avgMastery: number;
  /** Share of generator-backed grade-4 skills individually at level >= 4 and mastery >= 75. */
  coverage: number;
  qualifying: number;
  /** Generator-backed grade-4 skill count (the coverage denominator). */
  total: number;
  graduated: boolean;
}

/**
 * Grade one domain: graduated when avg level >= 4 AND avg mastery >= 75
 * AND at least 80% of its generator-backed grade-4 skills individually clear
 * level 4 / mastery 75. Pure: inputs are plain maps, no I/O. Levels keep the
 * 1-5 ladder inside grade-5 skills too — graduation only gates visibility. A
 * domain with no generator-backed grade-4 skills is never graduateable.
 */
export function domainGraduationStatus(
  domain: SkillDomain,
  levels: LevelsMap = {},
  mastery: MasteryMap = {},
): DomainGraduationStatus {
  const ids = grade4GeneratorSkillsForDomain(domain);
  const total = ids.length;
  if (total === 0) {
    return { domain, avgLevel: 0, avgMastery: 0, coverage: 0, qualifying: 0, total: 0, graduated: false };
  }
  let levelSum = 0;
  let masterySum = 0;
  let qualifying = 0;
  for (const id of ids) {
    const lv = levels[id] ?? DEFAULT_LEVEL;
    const m = mastery[id] ?? DEFAULT_MASTERY;
    levelSum += lv;
    masterySum += m;
    if (lv >= GRADUATION_SKILL_LEVEL && m >= GRADUATION_SKILL_MASTERY) qualifying++;
  }
  const avgLevel = levelSum / total;
  const avgMastery = masterySum / total;
  const coverage = qualifying / total;
  const graduated =
    avgLevel >= GRADUATION_MIN_AVG_LEVEL &&
    avgMastery >= GRADUATION_MIN_AVG_MASTERY &&
    coverage >= GRADUATION_COVERAGE;
  return { domain, avgLevel, avgMastery, coverage, qualifying, total, graduated };
}

/** Domains whose grade-4 base is graduated (grade-5 queue unlocked). */
export function graduatedDomains(levels: LevelsMap = {}, mastery: MasteryMap = {}): SkillDomain[] {
  const out: SkillDomain[] = [];
  const domains: SkillDomain[] = [
    "operations-algebraic",
    "base-ten",
    "fractions",
    "measurement-data",
    "geometry",
  ];
  for (const d of domains) {
    if (domainGraduationStatus(d, levels, mastery).graduated) out.push(d);
  }
  return out;
}

/** True when the domain's grade-5 skills are unlocked (domain graduated). */
export function isGrade5UnlockedForDomain(
  domain: SkillDomain,
  levels: LevelsMap = {},
  mastery: MasteryMap = {},
): boolean {
  return domainGraduationStatus(domain, levels, mastery).graduated;
}

/** True when a skill is currently practicable: grade 4 always, grade 5 only after its domain graduates. */
export function isSkillUnlocked(
  skillId: string,
  levels: LevelsMap = {},
  mastery: MasteryMap = {},
): boolean {
  const skill = SKILLS.find((s) => s.id === skillId);
  if (!skill) return false;
  if (skill.grade === 4) return true;
  return isGrade5UnlockedForDomain(skill.domain, levels, mastery);
}

/** Every currently practicable skill id: all of grade 4 plus unlocked grade 5. */
export function unlockedSkills(levels: LevelsMap = {}, mastery: MasteryMap = {}): string[] {
  return SKILLS.filter((s) => isSkillUnlocked(s.id, levels, mastery)).map((s) => s.id);
}

/** Grade-5 skill ids still locked (domain not yet graduated). */
export function lockedGrade5Skills(levels: LevelsMap = {}, mastery: MasteryMap = {}): string[] {
  return SKILLS.filter((s) => s.grade === 5 && !isSkillUnlocked(s.id, levels, mastery)).map(
    (s) => s.id,
  );
}

export interface GlobalGraduationStatus {
  name: typeof FIFTH_GRADE_UNLOCK_NAME;
  graduatedCount: number;
  needed: number;
  graduated: SkillDomain[];
  unlocked: boolean;
}

/**
 * Global "Fifth Grade!" unlock: fires when >= 3 domains graduate.
 * Pure function of the same levels/mastery maps.
 */
export function globalGraduationStatus(
  levels: LevelsMap = {},
  mastery: MasteryMap = {},
): GlobalGraduationStatus {
  const graduated = graduatedDomains(levels, mastery);
  return {
    name: FIFTH_GRADE_UNLOCK_NAME,
    graduatedCount: graduated.length,
    needed: GLOBAL_GRADUATION_DOMAINS_NEEDED,
    graduated,
    unlocked: graduated.length >= GLOBAL_GRADUATION_DOMAINS_NEEDED,
  };
}
