import { ALL_SKILLS, generateProblem, mulberry32 } from "./generators";
import type { Difficulty, MasteryMap, Problem } from "./types";

/** Cap: no single skill appears more than this many times in one assignment. */
export const MAX_PER_SKILL = 3;

export interface BuildAssignmentOptions {
  todaySkill: string;
  masteryMap?: MasteryMap;
  count?: number;
  seed?: number;
}

const WEAK_CUTOFF = 60;

interface Quota {
  today: number;
  weak: number;
  review: number;
  challenge: number;
}

/**
 * Target ~50/25/20/5 (today/weak/review/challenge). The hard cap of 3 per
 * skill bounds the today block (3 of 10), so the realized mix for count=10
 * is 3/3/3/1 — today tied for largest, challenge at ~5-10%. Leftover slots
 * after capping flow to weak/review so the total always equals count.
 */
function quota(count: number): Quota {
  const challenge = count >= 8 ? Math.max(1, Math.round(count * 0.05)) : 0;
  const today = Math.min(MAX_PER_SKILL, Math.round(count * 0.5));
  const weak = Math.round(count * 0.25);
  const review = Math.max(0, count - challenge - today - weak);
  return { today, weak, review, challenge };
}

/**
 * Compose a mixed assignment: ~50% today's skill (capped at 3 per skill),
 * ~25% weak skills (mastery < 60), ~20% review (mastery >= 60), ~5% challenge.
 * Handles empty history (weak/review quotas fall back to other skills) and
 * unknown todaySkill ids (falls back to the first registered skill).
 */
export function buildAssignment(options: BuildAssignmentOptions): Problem[] {
  const { masteryMap = {}, seed = 1 } = options;
  const n = Math.max(1, Math.floor(options.count ?? 10));
  const todaySkill = ALL_SKILLS.includes(options.todaySkill) ? options.todaySkill : ALL_SKILLS[0];
  const rng = mulberry32(seed);
  const q = quota(n);

  const weakPool = Object.entries(masteryMap)
    .filter(([s, m]) => s !== todaySkill && m < WEAK_CUTOFF && ALL_SKILLS.includes(s))
    .map(([s]) => s)
    .sort();
  const reviewPool = Object.entries(masteryMap)
    .filter(([s, m]) => s !== todaySkill && m >= WEAK_CUTOFF && ALL_SKILLS.includes(s))
    .map(([s]) => s)
    .sort();
  const otherSkills = ALL_SKILLS.filter((s) => s !== todaySkill);

  const problems: Problem[] = [];
  const used: Record<string, number> = {};
  function take(skill: string, difficulty?: Difficulty): void {
    const headroom = (k: string): boolean => (used[k] ?? 0) < MAX_PER_SKILL;
    const s = headroom(skill) ? skill : (ALL_SKILLS.find(headroom) ?? skill);
    used[s] = (used[s] ?? 0) + 1;
    const p = generateProblem(s, Math.floor(rng() * 2 ** 31), difficulty);
    p.id = `${s}-${problems.length}`;
    problems.push(p);
  }

  /** Cycle through a pool (rng-chosen start), falling back when empty. */
  function fill(times: number, pool: string[], fallback: string[]): void {
    const src = pool.length > 0 ? pool : fallback;
    const start = src.length > 0 ? Math.floor(rng() * src.length) : 0;
    for (let i = 0; i < times; i++) take(src[(start + i) % src.length]);
  }

  for (let i = 0; i < q.today; i++) take(todaySkill);
  fill(q.weak, weakPool, [...reviewPool, ...otherSkills, todaySkill]);
  fill(q.review, reviewPool, [...otherSkills, ...weakPool, todaySkill]);
  for (let i = 0; i < q.challenge; i++) take(weakPool[0] ?? todaySkill, "challenge");

  return problems;
}
