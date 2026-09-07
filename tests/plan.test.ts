import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LEVEL,
  DEFAULT_MASTERY,
  LEVEL_MEANINGS,
  MAX_LEVEL,
  MIN_LEVEL,
  clampLevel,
  levelToDifficulty,
  normalizeLevelsMap,
} from "../src/lib/plan/levels";
import {
  DEMOTION_EXHAUSTED_COUNT,
  LOW_MASTERY_DEMOTION,
  PROMOTION_STREAK,
  applyRulesForSkill,
  blendMastery,
  exhaustedInWindow,
  trailingFirstTryStreak,
} from "../src/lib/plan/rules";
import type { SkillHistoryEntry } from "../src/lib/plan/rules";
import {
  CHALLENGE_MIN_AVG_LEVEL,
  DEFAULT_PLAN_SIZE,
  MAX_PER_SKILL_PER_PLAN,
  PLAN_VERSION,
  buildPlan,
  deserializePlan,
  planAverageLevel,
  serializePlan,
} from "../src/lib/plan/plan";
import { SKILLS } from "../src/lib/skills";

function win(skillId: string, n: number): SkillHistoryEntry[] {
  return Array.from({ length: n }, () => ({
    skillId,
    firstTryCorrect: true,
    exhaustedAttempts: false,
    correct: true,
    usedHint: false,
  }));
}

function losses(skillId: string, n: number): SkillHistoryEntry[] {
  return Array.from({ length: n }, () => ({
    skillId,
    firstTryCorrect: false,
    exhaustedAttempts: true,
    correct: false,
    usedHint: false,
  }));
}

/* ---------- levels ---------- */

test("ladder spans 1-5 with documented meanings", () => {
  assert.equal(MIN_LEVEL, 1);
  assert.equal(MAX_LEVEL, 5);
  for (const l of [1, 2, 3, 4, 5] as const) assert.ok(LEVEL_MEANINGS[l].length > 0);
});

test("level-to-difficulty mapping ramps easy->medium->challenge", () => {
  assert.equal(levelToDifficulty(1), "easy");
  assert.equal(levelToDifficulty(2), "easy");
  assert.equal(levelToDifficulty(3), "medium");
  assert.equal(levelToDifficulty(4), "medium");
  assert.equal(levelToDifficulty(5), "challenge");
});

test("clampLevel enforces floor and cap", () => {
  assert.equal(clampLevel(0), 1);
  assert.equal(clampLevel(-9), 1);
  assert.equal(clampLevel(6), 5);
  assert.equal(clampLevel(99), 5);
  assert.equal(clampLevel(3), 3);
});

test("normalizeLevelsMap repairs junk to default", () => {
  const out = normalizeLevelsMap({ a: 3, b: 99, c: "x" as unknown as number });
  assert.equal(out.a, 3);
  assert.equal(out.b, 5);
  assert.equal(out.c, DEFAULT_LEVEL);
});

/* ---------- rules ---------- */

test("3-in-a-row first-try promotes one level", () => {
  const r = applyRulesForSkill({ level: 2, mastery: 50, recent: win("s", 3) });
  assert.equal(r.level, 3);
  assert.ok(r.promoted);
  assert.ok(!r.demoted && !r.reteach);
});

test("short streak does not promote", () => {
  const r = applyRulesForSkill({ level: 2, mastery: 50, recent: win("s", PROMOTION_STREAK - 1) });
  assert.equal(r.level, 2);
  assert.ok(!r.promoted);
});

test("broken streak resets the count", () => {
  const recent: SkillHistoryEntry[] = [
    ...win("s", 2),
    { skillId: "s", firstTryCorrect: false, exhaustedAttempts: false, correct: true, usedHint: true },
    ...win("s", 2),
  ];
  assert.equal(trailingFirstTryStreak(recent), 2);
  const r = applyRulesForSkill({ level: 2, mastery: 50, recent });
  assert.ok(!r.promoted);
});

test("repeated exhausted attempts demote and flag reteach", () => {
  const r = applyRulesForSkill({ level: 3, mastery: 60, recent: losses("s", 2) });
  assert.equal(r.level, 2);
  assert.ok(r.demoted);
  assert.ok(r.reteach);
});

test("single exhausted attempt does not demote", () => {
  const r = applyRulesForSkill({ level: 3, mastery: 60, recent: losses("s", DEMOTION_EXHAUSTED_COUNT - 1) });
  assert.ok(!r.demoted && !r.reteach);
});

test("very low mastery demotes even without exhaustions", () => {
  const r = applyRulesForSkill({ level: 3, mastery: LOW_MASTERY_DEMOTION - 20, recent: [] });
  assert.ok(r.reteach);
  assert.equal(r.level, 2);
});

test("promotion caps at 5", () => {
  const r = applyRulesForSkill({ level: 5, mastery: 90, recent: win("s", 5) });
  assert.equal(r.level, 5);
  assert.ok(!r.promoted);
});

test("demotion floors at 1 but still flags reteach", () => {
  const r = applyRulesForSkill({ level: 1, mastery: 10, recent: losses("s", 3) });
  assert.equal(r.level, 1);
  assert.ok(r.reteach);
});

test("demotion takes precedence over promotion", () => {
  const recent: SkillHistoryEntry[] = [...losses("s", 2), ...win("s", 3)];
  const r = applyRulesForSkill({ level: 3, mastery: 60, recent });
  assert.ok(r.demoted && r.reteach && !r.promoted);
});

test("blendMastery folds shared updateMastery: wins up, misses down", () => {
  const up = blendMastery(50, win("s", 1));
  const down = blendMastery(50, losses("s", 1));
  assert.ok(up > 50);
  assert.ok(down < 50);
});

test("exhaustedInWindow only counts the recent window", () => {
  const old = losses("s", 2);
  const fresh: SkillHistoryEntry[] = win("s", 5).map((e) => ({ ...e }));
  assert.equal(exhaustedInWindow([...old, ...fresh], 5), 0);
  assert.equal(exhaustedInWindow([...old, ...fresh], 7), 2);
});

/* ---------- plan ---------- */

test("cold start: all level 2, mastery 50, sane queue", () => {
  const p = buildPlan();
  for (const s of SKILLS) {
    assert.equal(p.levels[s.id], DEFAULT_LEVEL);
    assert.equal(p.mastery[s.id], DEFAULT_MASTERY);
  }
  assert.equal(p.items.length, DEFAULT_PLAN_SIZE);
  assert.ok(p.items.some((i) => i.reason === "today"));
  assert.deepEqual(p.reteachSkills, []);
});

test("reteach queue comes first at the lowered level", () => {
  const p = buildPlan({ levelsMap: { "bt-add-multidigit": 3 }, history: losses("bt-add-multidigit", 2) });
  assert.ok(p.reteachSkills.includes("bt-add-multidigit"));
  assert.equal(p.items[0].reason, "reteach");
  assert.equal(p.items[0].skillId, "bt-add-multidigit");
  assert.equal(p.items[0].level, 2);
});

test("today topic uses its current level and difficulty", () => {
  const p = buildPlan({ levelsMap: { "fr-equiv": 4 }, todayTopic: "fr-equiv", size: 4 });
  const today = p.items.find((i) => i.reason === "today");
  assert.ok(today);
  assert.equal(today.skillId, "fr-equiv");
  assert.equal(today.level, 4);
  assert.equal(today.difficulty, "medium");
});

test("challenge gated off when average level below threshold", () => {
  const p = buildPlan({ size: 10 });
  assert.ok(planAverageLevel(p) < CHALLENGE_MIN_AVG_LEVEL);
  assert.ok(!p.items.some((i) => i.reason === "challenge"));
});

test("challenge appears when average level >= 3", () => {
  const levelsMap: Record<string, 4> = {};
  for (const s of SKILLS) levelsMap[s.id] = 4;
  const p = buildPlan({ levelsMap, size: 12 });
  assert.ok(planAverageLevel(p) >= CHALLENGE_MIN_AVG_LEVEL);
  assert.ok(p.items.some((i) => i.reason === "challenge"));
});

test("no skill repeats more than 3x per plan", () => {
  const p = buildPlan({ size: 15 });
  const counts: Record<string, number> = {};
  for (const i of p.items) counts[i.skillId] = (counts[i.skillId] ?? 0) + 1;
  for (const n of Object.values(counts)) assert.ok(n <= MAX_PER_SKILL_PER_PLAN);
});

test("weak skills are prioritized after today slot", () => {
  const p = buildPlan({ masteryMap: { "bt-add-multidigit": 10 }, size: 6 });
  const weakIds = p.items.filter((i) => i.reason === "weak").map((i) => i.skillId);
  assert.ok(weakIds.includes("bt-add-multidigit"));
});

test("plan output is serializable JSON with version", () => {
  const p = buildPlan({ history: win("bt-rounding", 3) });
  const json = serializePlan(p);
  assert.equal(typeof json, "string");
  assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(json))), JSON.parse(json));
  assert.equal(JSON.parse(json).version, PLAN_VERSION);
});

test("serialization round-trips levels, queue, cursor, version", () => {
  const p = buildPlan({ history: losses("fr-compare", 2), size: 8 });
  const back = deserializePlan(serializePlan({ ...p, cursor: 3 }));
  assert.deepEqual(back.items, p.items);
  assert.deepEqual(back.levels, p.levels);
  assert.deepEqual(back.mastery, p.mastery);
  assert.deepEqual(back.reteachSkills, p.reteachSkills);
  assert.equal(back.cursor, 3);
  assert.equal(back.version, PLAN_VERSION);
});

test("success ramps difficulty up, struggle ramps it down", () => {
  const up = buildPlan({ levelsMap: { "bt-rounding": 2 }, history: win("bt-rounding", 3) });
  const down = buildPlan({
    levelsMap: { "bt-rounding": 3 },
    history: losses("bt-rounding", 2),
  });
  assert.ok(up.levels["bt-rounding"] > 2);
  assert.ok(down.levels["bt-rounding"] < 3);
  assert.ok(down.reteachSkills.includes("bt-rounding"));
  assert.ok(!up.reteachSkills.includes("bt-rounding"));
});

test("deserializePlan rejects version mismatch", () => {
  assert.throws(() => deserializePlan(JSON.stringify({ version: 999, items: [], levels: {}, mastery: {} })));
});
