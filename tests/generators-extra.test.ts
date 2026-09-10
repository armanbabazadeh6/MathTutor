import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTRA_GENERATORS, EXTRA_GRADES } from "../src/lib/math/generators-extra";
import { generateProblem } from "../src/lib/math/generators";
import { isCorrectAnswer, numericValue } from "../src/lib/math/answers";
import { SKILLS } from "../src/lib/skills";
import type { Level } from "../src/lib/math/types";

const LEVELS: Level[] = [1, 5];
const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);

const EXPECTED_IDS = [
  "oa-mult-2digit-2digit",
  "oa-factor-pairs",
  "oa-multiples-prime",
  "oa-patterns",
  "oa-remainders",
  "oa-multistep-frac",
  "oa-expressions",
  "bt-add-sub-word",
  "bt-multiply-10s",
  "bt-estimate",
  "bt-compare-order",
  "bt-expanded-form",
  "fr-add-unlike-10-100",
  "fr-mult-fraction-whole",
  "fr-fraction-word",
  "md-length-convert",
  "md-mass-capacity",
  "md-money",
  "md-line-plots",
  "md-angles",
  "md-area-perimeter-word",
  "geo-points-lines",
  "geo-quadrilaterals",
  "geo-coordinate-intro",
  "geo-quad-hierarchy",
].sort();

/** Skills whose canonical answer is a number that must grow with the level. */
const NUMERIC_IDS = [
  "oa-mult-2digit-2digit",
  "oa-remainders",
  "oa-multistep-frac",
  "oa-expressions",
  "bt-add-sub-word",
  "bt-multiply-10s",
  "bt-estimate",
  "md-length-convert",
  "md-mass-capacity",
  "md-money",
  "md-angles",
  "md-area-perimeter-word",
];

test("EXTRA_GENERATORS exports exactly the 25 expected extra skills", () => {
  assert.deepEqual(Object.keys(EXTRA_GENERATORS).sort(), EXPECTED_IDS);
});

test("EXTRA_GRADES matches the SKILLS grades for every extra id", () => {
  assert.equal(Object.keys(EXTRA_GRADES).length, EXPECTED_IDS.length);
  for (const id of EXPECTED_IDS) {
    const skill = SKILLS.find((s) => s.id === id);
    assert.ok(skill, `no skill registry entry for ${id}`);
    assert.equal(EXTRA_GRADES[id], skill.grade, `grade mismatch for ${id}`);
  }
});

test("extra skills generate gradeable, deterministic problems at levels 1 and 5", () => {
  for (const id of EXPECTED_IDS) {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        const where = `${id} L${level} seed ${seed}`;
        const p = generateProblem(id, seed, level);
        assert.equal(p.skill, id, `${where}: wrong skill`);
        for (const [field, value] of [
          ["hint1", p.hint1],
          ["hint2", p.hint2],
          ["explanation", p.explanation],
        ] as const) {
          assert.ok(value.trim().length > 0, `${where}: empty ${field}`);
        }
        assert.ok(p.answer.trim().length > 0, `${where}: empty answer`);
        for (const field of [p.text, p.answer, p.hint1, p.hint2, p.explanation]) {
          assert.ok(
            !/NaN|undefined|Infinity/.test(field),
            `${where}: broken token in "${field}"`,
          );
        }
        assert.ok(
          isCorrectAnswer(p.answer, p.answer, p.answerType),
          `${where}: canonical answer "${p.answer}" not gradeable as ${p.answerType}`,
        );
        assert.deepEqual(generateProblem(id, seed, level), p, `${where}: not deterministic`);
      }
    }
  }
});

test("level 5 draws larger numbers than level 1 for the numeric skills", () => {
  for (const id of NUMERIC_IDS) {
    const meanMag = (level: Level): number => {
      let sum = 0;
      for (const seed of SEEDS) {
        const p = generateProblem(id, seed, level);
        const v = numericValue(p.answer);
        assert.ok(v !== null, `${id} L${level} seed ${seed}: non-numeric answer "${p.answer}"`);
        sum += Math.abs(v);
      }
      return sum / SEEDS.length;
    };
    const low = meanMag(1);
    const high = meanMag(5);
    assert.ok(high > low, `${id}: level-5 mean ${high} should exceed level-1 mean ${low}`);
  }
});
