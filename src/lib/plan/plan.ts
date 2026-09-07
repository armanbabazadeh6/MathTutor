import { SKILLS } from "../skills";
import type { MasteryMap } from "../math/types";
import { DEFAULT_LEVEL, DEFAULT_MASTERY, levelToDifficulty } from "./levels";
import type { LevelsMap, SkillLevel } from "./levels";
import { applyRulesForSkill, groupBySkill } from "./rules";
import type { SkillHistoryEntry } from "./rules";
import { domainGraduationStatus, grade5SkillsForDomain } from "./graduation";

/** Persisted plan format version. Bump on breaking shape changes. */
export const PLAN_VERSION = 1;
/** Default queue length when `size` is not given. */
export const DEFAULT_PLAN_SIZE = 10;
/** One skill appears at most this many times per plan (anti-over-drill). */
export const MAX_PER_SKILL_PER_PLAN = 3;
/** Challenge items are emitted only when mean level across skills >= this. */
export const CHALLENGE_MIN_AVG_LEVEL = 3;
/** Cap on reteach items at the head of the queue. */
export const MAX_RETEACH_ITEMS = 3;
/** Cap on weak-skill practice items. */
export const MAX_WEAK_ITEMS = 3;
/** Cap on spaced-review items. */
export const MAX_REVIEW_ITEMS = 2;
/** Cap on challenge items. */
export const MAX_CHALLENGE_ITEMS = 2;
/** Cap on grade-5 unlock items (one per graduated domain, at most this many). */
export const MAX_GRADE5_ITEMS = 3;
export type PlanReason = "reteach" | "today" | "weak" | "review" | "challenge" | "grade5";

export interface PlanItem {
  skillId: string;
  level: SkillLevel;
  difficulty: ReturnType<typeof levelToDifficulty>;
  reason: PlanReason;
}

/** Fully persistable plan state: plain JSON only. */
export interface Plan {
  version: typeof PLAN_VERSION;
  items: PlanItem[];
  /** Post-rule levels per skill. */
  levels: LevelsMap;
  /** Post-rule mastery per skill. */
  mastery: MasteryMap;
  /** skills flagged for reteach at the lowered level. */
  reteachSkills: string[];
  /** Consumption cursor into `items`. */
  cursor: number;
}

export interface BuildPlanInput {
  masteryMap?: MasteryMap;
  levelsMap?: LevelsMap;
  /** Mixed chronological history across skills (oldest first). */
  history?: SkillHistoryEntry[];
  /** Focus skill for the "today" slot; defaults to weakest skill. */
  todayTopic?: string;
  /** Queue length; defaults to DEFAULT_PLAN_SIZE. */
  size?: number;
}

function meanLevel(levels: LevelsMap, ids: string[]): number {
  if (ids.length === 0) return DEFAULT_LEVEL;
  let sum = 0;
  for (const id of ids) sum += levels[id] ?? DEFAULT_LEVEL;
  return sum / ids.length;
}

function pushCapped(
  queue: PlanItem[],
  counts: Record<string, number>,
  item: PlanItem,
  size: number,
): boolean {
  if (queue.length >= size) return false;
  if ((counts[item.skillId] ?? 0) >= MAX_PER_SKILL_PER_PLAN) return false;
  queue.push(item);
  counts[item.skillId] = (counts[item.skillId] ?? 0) + 1;
  return true;
}

/**
 * Build an ordered practice queue:
 * 1. reteach (flagged skills at lowered level) 2. today topic at current
 * level 3. weak-skill practice (lowest mastery first) 4. spaced review
 * (practiced least-recently first) 5. challenge (only if mean level >=
 * CHALLENGE_MIN_AVG_LEVEL). Never repeats one skill more than
 * MAX_PER_SKILL_PER_PLAN times. Cold start (empty maps/history) yields all
 * level 2 / mastery 50 with the first registry skill as today's topic.
 */
export function buildPlan(input: BuildPlanInput = {}): Plan {
  const size = Math.max(1, Math.floor(input.size ?? DEFAULT_PLAN_SIZE));
  const history = input.history ?? [];
  const bySkill = groupBySkill(history);

  const levels: LevelsMap = {};
  const mastery: MasteryMap = {};
  const reteachSkills: string[] = [];

  for (const s of SKILLS) {
    const recent = bySkill.get(s.id) ?? [];
    const res = applyRulesForSkill({
      level: input.levelsMap?.[s.id] ?? DEFAULT_LEVEL,
      mastery: input.masteryMap?.[s.id] ?? DEFAULT_MASTERY,
      recent,
    });
    levels[s.id] = res.level;
    mastery[s.id] = res.mastery;
    if (res.reteach) reteachSkills.push(s.id);
  }

  const lastSeen = new Map<string, number>();
  history.forEach((e, i) => {
    lastSeen.set(e.skillId, i);
  });

  // Grade-5 skills stay out of the queue until their domain graduates (acing
  // 4th grade unlocks 5th grade domain by domain). Levels/mastery above cover
  // every skill so serialization still round-trips grade-5 state.
  const ALL_DOMAINS = ["operations-algebraic", "base-ten", "fractions", "measurement-data", "geometry"] as const;
  const graduatedList = ALL_DOMAINS.filter((d) => domainGraduationStatus(d, levels, mastery).graduated);
  const graduatedBy: Record<string, true> = {};
  for (const d of graduatedList) graduatedBy[d] = true;
  const eligible = SKILLS.filter((s) => s.grade === 4 || graduatedBy[s.domain]);
  const weakestFirst = [...eligible].sort((a, b) => {
    const d = (mastery[a.id] ?? DEFAULT_MASTERY) - (mastery[b.id] ?? DEFAULT_MASTERY);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  const todayId =
    input.todayTopic && eligible.some((s) => s.id === input.todayTopic)
      ? input.todayTopic
      : weakestFirst[0].id;
  const leastRecentFirst = [...eligible].sort((a, b) => {
    const ia = lastSeen.has(a.id) ? (lastSeen.get(a.id) as number) : -1;
    const ib = lastSeen.has(b.id) ? (lastSeen.get(b.id) as number) : -1;
    if (ia !== ib) return ia - ib;
    return (mastery[b.id] ?? 0) - (mastery[a.id] ?? 0);
  });
  const strongestFirst = [...eligible].sort((a, b) => {
    const d = (mastery[b.id] ?? 0) - (mastery[a.id] ?? 0);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  // One headliner per graduated domain: its weakest grade-5 skill. Levels keep
  // the same 1-5 ladder inside grade-5 skills.
  const grade5Headliners = graduatedList.slice().sort()
    .flatMap((d) => grade5SkillsForDomain(d))
    .map((id) => SKILLS.find((s) => s.id === id)!)
    .filter(Boolean)
    .sort((a, b) => (mastery[a!.id] ?? DEFAULT_MASTERY) - (mastery[b!.id] ?? DEFAULT_MASTERY))
    .slice(0, MAX_GRADE5_ITEMS);

  const queue: PlanItem[] = [];
  const counts: Record<string, number> = {};

  for (const id of reteachSkills.slice(0, MAX_RETEACH_ITEMS)) {
    pushCapped(
      queue,
      counts,
      { skillId: id, level: levels[id], difficulty: levelToDifficulty(levels[id]), reason: "reteach" },
      size,
    );
  }

  pushCapped(
    queue,
    counts,
    {
      skillId: todayId,
      level: levels[todayId],
      difficulty: levelToDifficulty(levels[todayId]),
      reason: "today",
    },
    size,
  );

  for (const s of grade5Headliners) {
    if (queue.length >= size) break;
    pushCapped(
      queue,
      counts,
      {
        skillId: s!.id,
        level: levels[s!.id],
        difficulty: levelToDifficulty(levels[s!.id]),
        reason: "grade5",
      },
      size,
    );
  }

  for (const s of weakestFirst.slice(0, MAX_WEAK_ITEMS)) {
    if (queue.length >= size) break;
    pushCapped(
      queue,
      counts,
      {
        skillId: s.id,
        level: levels[s.id],
        difficulty: levelToDifficulty(levels[s.id]),
        reason: "weak",
      },
      size,
    );
  }

  for (const s of leastRecentFirst.slice(0, MAX_REVIEW_ITEMS)) {
    if (queue.length >= size) break;
    pushCapped(
      queue,
      counts,
      {
        skillId: s.id,
        level: levels[s.id],
        difficulty: levelToDifficulty(levels[s.id]),
        reason: "review",
      },
      size,
    );
  }

  const avg = meanLevel(levels, SKILLS.map((s) => s.id));
  if (avg >= CHALLENGE_MIN_AVG_LEVEL) {
    for (const s of strongestFirst.slice(0, MAX_CHALLENGE_ITEMS)) {
      if (queue.length >= size) break;
      const lvl: SkillLevel = levels[s.id] >= 3 ? levels[s.id] : 3;
      pushCapped(
        queue,
        counts,
        {
          skillId: s.id,
          level: lvl,
          difficulty: levelToDifficulty(lvl),
          reason: "challenge",
        },
        size,
      );
    }
  }

  // Top up with weak rotation so the queue always reaches `size`.
  for (const s of weakestFirst) {
    if (queue.length >= size) break;
    pushCapped(
      queue,
      counts,
      {
        skillId: s.id,
        level: levels[s.id],
        difficulty: levelToDifficulty(levels[s.id]),
        reason: "weak",
      },
      size,
    );
  }

  return { version: PLAN_VERSION, items: queue, levels, mastery, reteachSkills, cursor: 0 };
}

/** Mean level across all known skills in a plan (challenge-gating input). */
export function planAverageLevel(plan: Plan): number {
  return meanLevel(plan.levels, SKILLS.map((s) => s.id));
}

/** Serialize a plan to a JSON string (all fields are plain JSON). */
export function serializePlan(plan: Plan): string {
  return JSON.stringify(plan);
}

/** Parse + validate a serialized plan; throws on version mismatch or bad shape. */
export function deserializePlan(json: string): Plan {
  const raw = JSON.parse(json) as Partial<Plan>;
  if (raw.version !== PLAN_VERSION) throw new Error(`unsupported plan version: ${String(raw.version)}`);
  if (!Array.isArray(raw.items)) throw new Error("bad plan: items must be an array");
  if (typeof raw.levels !== "object" || raw.levels === null) throw new Error("bad plan: levels missing");
  if (typeof raw.mastery !== "object" || raw.mastery === null) throw new Error("bad plan: mastery missing");
  return {
    version: PLAN_VERSION,
    items: raw.items as PlanItem[],
    levels: raw.levels as LevelsMap,
    mastery: raw.mastery as MasteryMap,
    reteachSkills: Array.isArray(raw.reteachSkills) ? (raw.reteachSkills as string[]) : [],
    cursor: typeof raw.cursor === "number" ? raw.cursor : 0,
  };
}
