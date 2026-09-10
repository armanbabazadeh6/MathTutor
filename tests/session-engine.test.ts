/**
 * Integration tests for the plan-driven half of `src/lib/session.ts`.
 *
 * These cover the contracts the UI depends on and that a plausible change
 * would silently break: level reaching the generator, promotion firing once
 * per crossing, reteach wins counting, history being timestamped, legacy
 * stored problems staying readable, and the quest never serving locked
 * grade-5 content to a kid who has not graduated.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  generateAssignment,
  getDailyQuest,
  loadAssignment,
  loadPlanSession,
  questToAssignment,
  recordGradedAttempt,
  recordReteachOutcome,
  saveAssignment,
} from "../src/lib/session";
import { ALL_SKILLS, generateProblem, generatorGradeFor } from "../src/lib/math/generators";
import { DEFAULT_LEVEL, MAX_LEVEL } from "../src/lib/plan/levels";
import { SKILLS } from "../src/lib/skills";

/* In-memory window.localStorage so session persistence works under tsx. */
const backing = new Map<string, string>();
const storage = {
  getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
  setItem: (k: string, v: string) => {
    backing.set(k, String(v));
  },
  removeItem: (k: string) => {
    backing.delete(k);
  },
  clear: () => backing.clear(),
  key: (i: number) => Array.from(backing.keys())[i] ?? null,
  get length() {
    return backing.size;
  },
};
(globalThis as unknown as { window?: unknown }).window = { localStorage: storage };

beforeEach(() => backing.clear());

/** A first-try win on a skill, as the practice player records it. */
function win(skillId: string) {
  return {
    skillId,
    firstTryCorrect: true,
    exhaustedAttempts: false,
    correct: true,
    usedHint: false,
  };
}

const SKILL = "oa-mult-1digit";

/** Largest number appearing anywhere in the prompt for a skill at a level. */
function largestOperand(skillId: string, level: 1 | 5): number {
  let max = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const n of generateProblem(skillId, seed, level).text.match(/\d+/g) ?? []) {
      max = Math.max(max, Number(n));
    }
  }
  return max;
}

test("history entries are timestamped so review can be scheduled", () => {
  const before = Date.now();
  recordGradedAttempt(win(SKILL));
  const after = Date.now();
  const entry = loadPlanSession().history.at(-1);
  assert.ok(entry, "an entry should have been recorded");
  const at = entry.at;
  assert.equal(typeof at, "number");
  assert.ok(at !== undefined && at >= before && at <= after, `at=${at} not in [${before}, ${after}]`);
});

test("three consecutive wins promote exactly one level", () => {
  recordGradedAttempt(win(SKILL));
  recordGradedAttempt(win(SKILL));
  const third = recordGradedAttempt(win(SKILL));
  assert.equal(third.promoted, true);
  assert.equal(third.level, DEFAULT_LEVEL + 1);
  assert.equal(loadPlanSession().levels[SKILL], DEFAULT_LEVEL + 1);
});

test("a longer win streak promotes once per three fresh wins, not per win", () => {
  // The audited defect: every right answer walked the level up one rung
  // (3rd->L3, 4th->L4, 5th->L5) because the promotion streak was never
  // consumed. One promotion now costs a *fresh* run of three wins.
  const levels: number[] = [];
  for (let i = 0; i < 10; i++) {
    recordGradedAttempt(win(SKILL));
    levels.push(loadPlanSession().levels[SKILL] ?? DEFAULT_LEVEL);
  }
  assert.deepEqual(
    levels,
    [2, 2, 3, 3, 3, 4, 4, 4, 5, 5],
    "level should step once per three consecutive wins",
  );
  assert.equal(levels.at(-1), MAX_LEVEL, "the ladder must cap at MAX_LEVEL");
});

test("a correct reteach answer counts toward the promotion run", () => {
  recordGradedAttempt(win(SKILL));
  recordGradedAttempt(win(SKILL));
  // The teach-mode check: correct, but recorded as a reteach outcome rather
  // than a first-try practice answer. It used to be unable to ever promote.
  const reteach = recordReteachOutcome(SKILL, true);
  assert.equal(reteach.promoted, true);
  assert.equal(reteach.level, DEFAULT_LEVEL + 1);
});

test("a failed reteach does not promote and re-queues the skill", () => {
  recordGradedAttempt(win(SKILL));
  recordGradedAttempt(win(SKILL));
  const missed = recordReteachOutcome(SKILL, false);
  assert.equal(missed.promoted, false);
  assert.equal(loadPlanSession().levels[SKILL], DEFAULT_LEVEL);
  assert.ok(loadPlanSession().reteachQueue.includes(SKILL));
});

test("the plan level actually changes the numbers a kid sees", () => {
  // Level is the whole point of the ladder: a level-5 problem must be
  // measurably bigger than a level-1 problem for the same skill.
  const easy = largestOperand(SKILL, 1);
  const hard = largestOperand(SKILL, 5);
  assert.ok(hard > easy, `level 5 should draw larger numbers than level 1 (got ${hard} vs ${easy})`);
});

test("generated problems carry a valid plan level and a reason", () => {
  const a = generateAssignment(["operations-algebraic"], "", 4);
  assert.ok(a.problems.length > 0);
  for (const p of a.problems) {
    assert.ok(p.level >= 1 && p.level <= MAX_LEVEL, `level out of range: ${p.level}`);
    assert.ok(p.reason.length > 0, `problem ${p.id} has no reason`);
    assert.ok(generateProblem(p.skillId, 1, p.level), `skill ${p.skillId} is not generatable`);
  }
});

test("a stored assignment without levels still loads with sane defaults", () => {
  // Problems saved before the level work have no level/reason/answerType.
  const legacy = {
    id: "a-legacy",
    createdAt: 0,
    label: "Old",
    domains: ["operations-algebraic"],
    customTopic: "",
    problems: [
      {
        id: "old-1",
        domain: "operations-algebraic",
        skillId: SKILL,
        skillName: "Multiply 1-digit numbers",
        prompt: "What is 3 × 4?",
        answer: "12",
        hint1: "Count in fours.",
        hint2: "Groups of 4.",
        explanation: "3 × 4 = 12.",
      },
    ],
  };
  backing.set("mt.assignment.v1", JSON.stringify(legacy));
  const loaded = loadAssignment(null);
  assert.ok(loaded, "legacy assignment should still load");
  const p = loaded.problems[0];
  assert.equal(p.level, DEFAULT_LEVEL);
  assert.equal(p.reason, "today");
  assert.equal(p.answerType, "integer");
});

test("every skill in the registry has a generator", () => {
  const covered = new Set(ALL_SKILLS);
  const missing = SKILLS.filter((s) => !covered.has(s.id)).map((s) => s.id);
  assert.deepEqual(missing, [], `skills without a generator: ${missing.join(", ")}`);
});

test("a freshly minted quest never serves locked grade-5 content", () => {
  // With no history and no graduations, every quest item must be grade 4.
  const quest = getDailyQuest("2026-09-10");
  const assignment = questToAssignment(quest);
  const leaked = assignment.problems.filter((p) => generatorGradeFor(p.skillId) === 5);
  assert.deepEqual(leaked.map((p) => p.skillId), [], "grade-5 skills leaked into a grade-4 quest");
});

test("saving and reloading an assignment round-trips the level", () => {
  const a = generateAssignment(["fractions"], "", 3);
  saveAssignment(a);
  const loaded = loadAssignment();
  assert.deepEqual(
    loaded?.problems.map((p) => p.level),
    a.problems.map((p) => p.level),
  );
});
