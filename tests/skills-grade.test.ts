import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILLS } from "../src/lib/skills";
import {
  ALL_SKILLS,
  GENERATORS,
  GENERATOR_GRADES,
  generateProblem,
  generatorGradeFor,
} from "../src/lib/math/generators";
import {
  compareDecimal,
  isCorrectAnswer,
  isEquivalentFraction,
  numericValue,
} from "../src/lib/math/answers";
import {
  MAX_GRADE5_ITEMS,
  buildPlan,
  deserializePlan,
  serializePlan,
} from "../src/lib/plan/plan";
import {
  FIFTH_GRADE_UNLOCK_NAME,
  GLOBAL_GRADUATION_DOMAINS_NEEDED,
  GRADUATION_COVERAGE,
  GRADUATION_MIN_AVG_LEVEL,
  GRADUATION_MIN_AVG_MASTERY,
  domainGraduationStatus,
  globalGraduationStatus,
  grade4SkillsForDomain,
  grade5SkillsForDomain,
  graduatedDomains,
  isGrade5UnlockedForDomain,
  isSkillUnlocked,
  lockedGrade5Skills,
  unlockedSkills,
} from "../src/lib/plan/graduation";
import type { SkillHistoryEntry } from "../src/lib/plan/rules";
import type { LevelsMap } from "../src/lib/plan/levels";
import type { MasteryMap } from "../src/lib/math/types";

function win(skillId: string, n: number): SkillHistoryEntry[] {
  return Array.from({ length: n }, () => ({
    skillId,
    firstTryCorrect: true,
    exhaustedAttempts: false,
    correct: true,
    usedHint: false,
  }));
}

/** Levels/mastery maps with every grade-4 skill in `domain` at level 4 / mastery 80. */
function aced(domain: Parameters<typeof grade4SkillsForDomain>[0]): {
  levelsMap: LevelsMap;
  masteryMap: MasteryMap;
} {
  const levelsMap: LevelsMap = {};
  const masteryMap: MasteryMap = {};
  for (const id of grade4SkillsForDomain(domain)) {
    levelsMap[id] = 4;
    masteryMap[id] = 80;
  }
  return { levelsMap, masteryMap };
}

function merge(
  parts: { levelsMap: LevelsMap; masteryMap: MasteryMap }[],
): { levelsMap: LevelsMap; masteryMap: MasteryMap } {
  return {
    levelsMap: Object.assign({}, ...parts.map((p) => p.levelsMap)),
    masteryMap: Object.assign({}, ...parts.map((p) => p.masteryMap)),
  };
}

function gradeOf(skillId: string): number {
  return SKILLS.find((s) => s.id === skillId)?.grade ?? -1;
}

/* ---------- registry: every skill carries a grade band ---------- */

test("every skill has a grade band of 4 or 5", () => {
  assert.ok(SKILLS.length > 0);
  for (const s of SKILLS) {
    assert.ok(s.grade === 4 || s.grade === 5, `${s.id} missing grade band`);
  }
});

test("grade-4 base intact (45 skills), grade-5 adds 10-12 skills", () => {
  const g4 = SKILLS.filter((s) => s.grade === 4);
  const g5 = SKILLS.filter((s) => s.grade === 5);
  assert.equal(g4.length, 45);
  assert.ok(g5.length >= 10 && g5.length <= 12, `expected 10-12 grade-5 skills, got ${g5.length}`);
});

test("grade-5 fractions trio: unlike add/sub and fraction-times-whole", () => {
  for (const id of ["fr-add-unlike-5", "fr-sub-unlike-5", "fr-mult-whole-adv"]) {
    const s = SKILLS.find((x) => x.id === id);
    assert.ok(s, `${id} missing from registry`);
    assert.equal(s?.domain, "fractions");
    assert.equal(s?.grade, 5);
  }
});

test("grade-5 base-ten and measurement skills present", () => {
  const want: [string, string][] = [
    ["bt-dec-add-sub", "base-ten"],
    ["bt-dec-mult-pow10", "base-ten"],
    ["md-volume", "measurement-data"],
  ];
  for (const [id, domain] of want) {
    const s = SKILLS.find((x) => x.id === id);
    assert.ok(s, `${id} missing from registry`);
    assert.equal(s?.domain, domain);
    assert.equal(s?.grade, 5);
  }
});

test("grade-5 thinking and geometry skills present", () => {
  const want: [string, string][] = [
    ["oa-order-ops", "operations-algebraic"],
    ["oa-multistep-frac", "operations-algebraic"],
    ["oa-expressions", "operations-algebraic"],
    ["geo-coord-plane", "geometry"],
    ["geo-quad-hierarchy", "geometry"],
  ];
  for (const [id, domain] of want) {
    const s = SKILLS.find((x) => x.id === id);
    assert.ok(s, `${id} missing from registry`);
    assert.equal(s?.domain, domain);
    assert.equal(s?.grade, 5);
  }
  for (const s of SKILLS.filter((x) => x.grade === 5)) {
    assert.ok(s.name.length > 0 && s.description.length > 0, `${s.id} needs name + description`);
  }
});

/* ---------- generators: grade flags ---------- */

test("GENERATOR_GRADES flags every generator; new skills are grade 5", () => {
  for (const id of ALL_SKILLS) {
    assert.ok(typeof GENERATORS[id] === "function", `${id} missing generator`);
    assert.ok(GENERATOR_GRADES[id] === 4 || GENERATOR_GRADES[id] === 5, `${id} missing grade flag`);
    assert.equal(generatorGradeFor(id), gradeOf(id), `${id} generator grade disagrees with registry`);
  }
  for (const id of ["fr-add-unlike-5", "fr-sub-unlike-5", "fr-mult-whole-adv", "bt-dec-add-sub", "bt-dec-mult-pow10", "md-volume", "oa-order-ops", "geo-coord-plane"]) {
    assert.equal(GENERATOR_GRADES[id], 5);
  }
});

/* ---------- generators: canonical correctness ---------- */

test("fr-add-unlike-5 answer equals the parsed sum over common denominator", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("fr-add-unlike-5", seed);
    const m = /(\d+)\/(\d+) \+ (\d+)\/(\d+)\?/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    const [a, d1, b, d2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    assert.notEqual(d1, d2);
    assert.ok(isEquivalentFraction(p.answer, `${a * d2 + b * d1}/${d1 * d2}`), `seed ${seed}: ${p.answer}`);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("fr-sub-unlike-5 answer equals the parsed difference and stays positive", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("fr-sub-unlike-5", seed);
    const m = /(\d+)\/(\d+) - (\d+)\/(\d+)\?/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    const [a, d1, b, d2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    assert.notEqual(d1, d2);
    assert.ok(isEquivalentFraction(p.answer, `${a * d2 - b * d1}/${d1 * d2}`), `seed ${seed}: ${p.answer}`);
    assert.ok((numericValue(p.answer) ?? 0) > 0, `seed ${seed}: non-positive ${p.answer}`);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("fr-mult-whole-adv answer equals fraction-times-whole, simplified", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("fr-mult-whole-adv", seed);
    const m = /(\d+)\/(\d+) × (\d+)\?/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    const [a, d, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
    assert.ok(isEquivalentFraction(p.answer, `${a * w}/${d}`) || numericValue(p.answer) === (a * w) / d, `seed ${seed}: ${p.answer}`);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("bt-dec-add-sub answer matches the parsed decimal operation", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("bt-dec-add-sub", seed);
    const m = /What is ([\d.]+) (\+|-) ([\d.]+)\?/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    const expected = m[2] === "+" ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3]);
    assert.ok(compareDecimal(p.answer, String(expected)), `seed ${seed}: ${p.text} = ${p.answer}`);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("bt-dec-mult-pow10 answer shifts the point by the power of ten", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("bt-dec-mult-pow10", seed);
    const m = /What is ([\d.]+) × (\d+)\?/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    assert.ok(["10", "100", "1000"].includes(m[2]), `multiplier ${m[2]} is not a power of ten`);
    assert.ok(compareDecimal(p.answer, String(Number(m[1]) * Number(m[2]))), `seed ${seed}: ${p.answer}`);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("md-volume answer equals length × width × height", () => {
  for (let seed = 1; seed <= 6; seed++) {
    const p = generateProblem("md-volume", seed);
    const m = /box is (\d+) cm long, (\d+) cm wide, and (\d+) cm tall/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    assert.equal(Number(p.answer.replace(/,/g, "")), Number(m[1]) * Number(m[2]) * Number(m[3]));
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("oa-order-ops answer respects parentheses vs multiply-first", () => {
  let sawParen = false;
  let sawBare = false;
  for (let seed = 1; seed <= 10; seed++) {
    const p = generateProblem("oa-order-ops", seed);
    const nums = p.text.match(/\d+/g)?.map(Number);
    assert.ok(nums && nums.length === 3, `unparseable prompt: ${p.text}`);
    const [a, b, c] = nums;
    const expected = p.text.includes("(") ? (a + b) * c : a + b * c;
    if (p.text.includes("(")) sawParen = true;
    else sawBare = true;
    assert.equal(Number(p.answer.replace(/,/g, "")), expected, `seed ${seed}: ${p.text}`);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
  assert.ok(sawParen && sawBare, "generator should emit both parenthesized and bare forms");
});

test("geo-coord-plane answer matches the described right/up steps", () => {
  for (let seed = 1; seed <= 6; seed++) {
    const p = generateProblem("geo-coord-plane", seed);
    const m = /(\d+) units to the right and (\d+) units up/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    assert.equal(p.answer, `${m[1]}, ${m[2]}`);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("grade-5 generators are deterministic with hints and explanations", () => {
  const ids = [
    "fr-add-unlike-5",
    "fr-sub-unlike-5",
    "fr-mult-whole-adv",
    "bt-dec-add-sub",
    "bt-dec-mult-pow10",
    "md-volume",
    "oa-order-ops",
    "geo-coord-plane",
  ];
  for (const id of ids) {
    const a = generateProblem(id, 42);
    const b = generateProblem(id, 42);
    assert.deepEqual(a, b);
    assert.equal(a.skill, id);
    assert.ok(a.hint1.length > 0 && a.hint2.length > 0 && a.explanation.length > 0, `${id} needs hints + explanation`);
  }
});

/* ---------- graduation: thresholds ---------- */

test("graduation thresholds are named exports (level 4, mastery 75, coverage 80%)", () => {
  assert.equal(GRADUATION_MIN_AVG_LEVEL, 4);
  assert.equal(GRADUATION_MIN_AVG_MASTERY, 75);
  assert.equal(GRADUATION_COVERAGE, 0.8);
  assert.equal(GLOBAL_GRADUATION_DOMAINS_NEEDED, 3);
  assert.equal(FIFTH_GRADE_UNLOCK_NAME, "Fifth Grade!");
});

test("acing a domain's grade-4 base graduates it", () => {
  const { levelsMap, masteryMap } = aced("fractions");
  const st = domainGraduationStatus("fractions", levelsMap, masteryMap);
  assert.equal(st.total, grade4SkillsForDomain("fractions").length);
  assert.ok(st.avgLevel >= 4 && st.avgMastery >= 75 && st.coverage >= 0.8);
  assert.equal(st.graduated, true);
  assert.ok(isGrade5UnlockedForDomain("fractions", levelsMap, masteryMap));
  assert.ok(graduatedDomains(levelsMap, masteryMap).includes("fractions"));
});

test("below-75 mastery does not graduate, even at level 4", () => {
  const { levelsMap, masteryMap } = aced("fractions");
  for (const id of grade4SkillsForDomain("fractions")) masteryMap[id] = 70;
  const st = domainGraduationStatus("fractions", levelsMap, masteryMap);
  assert.equal(st.graduated, false);
  assert.equal(isGrade5UnlockedForDomain("fractions", levelsMap, masteryMap), false);
});

test("below-4 average level does not graduate, even at mastery 80", () => {
  const { levelsMap, masteryMap } = aced("fractions");
  for (const id of grade4SkillsForDomain("fractions")) levelsMap[id] = 3;
  const st = domainGraduationStatus("fractions", levelsMap, masteryMap);
  assert.equal(st.graduated, false);
});

test("coverage below 80% does not graduate, even when the means pass", () => {
  const { levelsMap, masteryMap } = aced("fractions");
  const ids = grade4SkillsForDomain("fractions");
  assert.ok(ids.length === 10, "fractions needs 10 grade-4 skills for this case");
  for (const id of ids.slice(0, 3)) masteryMap[id] = 74;
  const st = domainGraduationStatus("fractions", levelsMap, masteryMap);
  assert.ok(st.avgLevel >= 4 && st.avgMastery >= 75);
  assert.ok(st.coverage < 0.8);
  assert.equal(st.graduated, false);
});

test("cold start graduates nothing", () => {
  for (const d of ["operations-algebraic", "base-ten", "fractions", "measurement-data", "geometry"] as const) {
    assert.equal(domainGraduationStatus(d).graduated, false);
  }
  assert.deepEqual(graduatedDomains(), []);
  assert.equal(globalGraduationStatus().unlocked, false);
});

/* ---------- plan: no grade-5 before thresholds ---------- */

test("cold-start queue and unlocked set contain no grade-5 skills", () => {
  const p = buildPlan();
  for (const item of p.items) assert.equal(gradeOf(item.skillId), 4);
  assert.ok(!p.items.some((i) => i.reason === "grade5"));
  for (const id of unlockedSkills()) assert.equal(gradeOf(id), 4);
  assert.equal(lockedGrade5Skills().length, SKILLS.filter((s) => s.grade === 5).length);
  assert.ok(!isSkillUnlocked("fr-add-unlike-5"));
});

test("locked grade-5 todayTopic falls back to a grade-4 skill", () => {
  const p = buildPlan({ todayTopic: "fr-add-unlike-5", size: 6 });
  const today = p.items.find((i) => i.reason === "today");
  assert.ok(today);
  assert.equal(gradeOf(today.skillId), 4);
});

/* ---------- plan: domain-by-domain unlock ---------- */

test("graduating fractions unlocks grade-5 queue for fractions only", () => {
  const { levelsMap, masteryMap } = aced("fractions");
  const p = buildPlan({ levelsMap, masteryMap, size: 12 });
  const g5 = p.items.filter((i) => i.reason === "grade5");
  assert.ok(g5.length >= 1 && g5.length <= MAX_GRADE5_ITEMS);
  for (const item of g5) {
    const s = SKILLS.find((x) => x.id === item.skillId);
    assert.equal(s?.grade, 5);
    assert.equal(s?.domain, "fractions");
  }
  assert.ok(p.items.some((i) => i.skillId === "fr-add-unlike-5" || gradeOf(i.skillId) === 5));
  assert.ok(!p.items.some((i) => i.skillId === "geo-coord-plane"), "geometry stays locked");
  assert.equal(isSkillUnlocked("fr-add-unlike-5", p.levels, p.mastery), true);
  assert.equal(isSkillUnlocked("geo-coord-plane", p.levels, p.mastery), false);
});

/* ---------- global Fifth Grade! unlock ---------- */

test("three graduated domains fire the global Fifth Grade! unlock; two do not", () => {
  const three = merge([aced("fractions"), aced("base-ten"), aced("geometry")]);
  const g3 = globalGraduationStatus(three.levelsMap, three.masteryMap);
  assert.equal(g3.name, "Fifth Grade!");
  assert.equal(g3.graduatedCount, 3);
  assert.equal(g3.unlocked, true);
  const two = merge([aced("fractions"), aced("base-ten")]);
  const g2 = globalGraduationStatus(two.levelsMap, two.masteryMap);
  assert.equal(g2.graduatedCount, 2);
  assert.equal(g2.unlocked, false);
});

/* ---------- levels continue 1-5 inside grade-5 skills ---------- */

test("grade-5 skills climb the same 1-5 ladder via practice history", () => {
  const p = buildPlan({ levelsMap: { "fr-add-unlike-5": 2 }, history: win("fr-add-unlike-5", 3) });
  assert.equal(p.levels["fr-add-unlike-5"], 3);
  assert.ok(p.levels["fr-add-unlike-5"] >= 1 && p.levels["fr-add-unlike-5"] <= 5);
  const capped = buildPlan({ levelsMap: { "md-volume": 5 }, history: win("md-volume", 3) });
  assert.equal(capped.levels["md-volume"], 5);
});

/* ---------- serialization ---------- */

test("plan with a grade-5 queue round-trips through serialization", () => {
  const { levelsMap, masteryMap } = aced("fractions");
  const p = buildPlan({ levelsMap, masteryMap, size: 12 });
  assert.ok(p.items.some((i) => i.reason === "grade5"), "needs a grade-5 queue to round-trip");
  const back = deserializePlan(serializePlan(p));
  assert.deepEqual(back.items, p.items);
  assert.deepEqual(back.levels, p.levels);
  assert.deepEqual(back.mastery, p.mastery);
  assert.ok(back.items.some((i) => i.reason === "grade5"));
});
