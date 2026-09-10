import { strict as assert } from "node:assert";
import { test } from "node:test";
import { generateProblem } from "../src/lib/math/generators";
import { levelToDifficulty } from "../src/lib/math/types";
import type { Level } from "../src/lib/math/types";
import { SKILLS } from "../src/lib/skills";

/**
 * Observable difficulty scaling: for a representative skill per domain, the
 * numbers a student actually sees in the prompt must grow with the level, and
 * a level-5 problem must never be structurally smaller than a level-1 problem.
 */

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

/** 18 core skills spanning all five domains. */
const SAMPLE = [
  // operations-algebraic
  "oa-mult-1digit",
  "oa-mult-digit-1digit",
  "oa-div-1digit-divisor",
  "oa-order-ops",
  "oa-multistep-word",
  // base-ten
  "bt-add-multidigit",
  "bt-sub-multidigit",
  "bt-place-value",
  "bt-rounding",
  "bt-dec-add-sub",
  // fractions
  "fr-add-like",
  "fr-mult-whole-adv",
  "fr-compare",
  // measurement-data
  "md-area",
  "md-perimeter",
  "md-volume",
  // geometry
  "geo-coord-plane",
  "geo-composite-shapes",
];

/** Every number a student reads in the prompt, boundaries stripped. */
function magnitudes(skill: string, level: Level): number[] {
  return SEEDS.flatMap((seed) =>
    (generateProblem(skill, seed, level).text.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? []).map(
      Number,
    ),
  );
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Longest digit run anywhere in the prompt across the sample seeds. */
function maxDigits(skill: string, level: Level): number {
  let longest = 0;
  for (const seed of SEEDS) {
    for (const token of generateProblem(skill, seed, level).text.replace(/,/g, "").match(/\d+/g) ?? []) {
      longest = Math.max(longest, token.length);
    }
  }
  return longest;
}

test("the scaling sample spans all five domains with registered skills", () => {
  for (const id of SAMPLE) {
    assert.ok(SKILLS.some((s) => s.id === id), `${id} missing from the skill registry`);
  }
  const domains = new Set(SAMPLE.map((id) => SKILLS.find((s) => s.id === id)?.domain));
  assert.equal(domains.size, 5, `expected 5 domains, got ${Array.from(domains).join(", ")}`);
});

test("level-5 prompts use strictly larger numbers than level-1 prompts", () => {
  for (const skill of SAMPLE) {
    const lo = magnitudes(skill, 1);
    const hi = magnitudes(skill, 5);
    assert.ok(lo.length > 0 && hi.length > 0, `${skill} prompt carried no numbers`);
    const loMean = mean(lo);
    const hiMean = mean(hi);
    assert.ok(
      hiMean > loMean,
      `${skill}: level-1 mean magnitude ${loMean} is not below level-5 mean ${hiMean}`,
    );
  }
});

test("level-5 problems are never structurally smaller than level-1 problems", () => {
  for (const skill of SAMPLE) {
    const lo = maxDigits(skill, 1);
    const hi = maxDigits(skill, 5);
    assert.ok(hi >= lo, `${skill}: level 5 tops out at ${hi} digits but level 1 already reaches ${lo}`);
  }
});

test("difficulty follows the level band at every rung", () => {
  const skills = ["bt-add-multidigit", "fr-add-unlike-5", "md-time", "geo-triangles"];
  for (const level of [1, 2, 3, 4, 5] as const) {
    for (const skill of skills) {
      for (const seed of [1, 7, 42]) {
        const p = generateProblem(skill, seed, level);
        assert.equal(p.difficulty, levelToDifficulty(level), `${skill} seed ${seed} level ${level}`);
      }
    }
  }
  assert.equal(levelToDifficulty(1), "easy");
  assert.equal(levelToDifficulty(5), "challenge");
});

test("the same (skill, seed, level) is deterministic", () => {
  for (const skill of SAMPLE) {
    for (const level of [1, 3, 5] as const) {
      assert.deepEqual(
        generateProblem(skill, 123, level),
        generateProblem(skill, 123, level),
        `${skill} level ${level}`,
      );
    }
  }
});

test("level changes the problem while the seed alone does not", () => {
  const sameSeed = generateProblem("md-area", 9, 2);
  const sameSeedAgain = generateProblem("md-area", 9, 2);
  const higher = generateProblem("md-area", 9, 5);
  assert.deepEqual(sameSeed, sameSeedAgain);
  assert.notEqual(sameSeed.text, higher.text);
  assert.ok(mean(magnitudes("md-area", 5)) > mean(magnitudes("md-area", 1)));
});
