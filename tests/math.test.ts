import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_SKILLS,
  GENERATORS,
  generateProblem,
  mulberry32,
} from "../src/lib/math/generators";
import {
  compareDecimal,
  compareInteger,
  isCorrectAnswer,
  isEquivalentFraction,
  normalizeAnswer,
} from "../src/lib/math/answers";
import { grade, gradeAttempt } from "../src/lib/math/grading";
import { updateMastery } from "../src/lib/math/mastery";

function num(t: string): number {
  return Number(t.replace(/,/g, ""));
}

/* ---------- generators: canonical answers ---------- */

test("add-multidigit answer equals the parsed sum", () => {
  const p = generateProblem("bt-add-multidigit", 7);
  const m = /([\d,]+) \+ ([\d,]+)\?/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.equal(num(p.answer), num(m[1]) + num(m[2]));
});

test("sub-multidigit answer equals the parsed difference", () => {
  const p = generateProblem("bt-sub-multidigit", 7);
  const m = /([\d,]+) - ([\d,]+)\?/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.equal(num(p.answer), num(m[1]) - num(m[2]));
  assert.ok(num(p.answer) > 0);
});

test("mult-facts answer equals the parsed product", () => {
  const p = generateProblem("oa-mult-1digit", 7);
  const m = /(\d+) × (\d+)\?/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.equal(num(p.answer), Number(m[1]) * Number(m[2]));
});

test("mult-digit-1digit answer equals the parsed product", () => {
  const p = generateProblem("oa-mult-digit-1digit", 7);
  const m = /([\d,]+) × (\d+)\?/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.equal(num(p.answer), num(m[1]) * Number(m[2]));
});

test("div-facts answer matches dividend and divisor", () => {
  const p = generateProblem("oa-div-facts", 7);
  const m = /(\d+) ÷ (\d+)\?/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.equal(Number(m[1]), Number(m[2]) * num(p.answer));
});

test("div-remainder answer satisfies dividend = divisor × Q + R", () => {
  const p = generateProblem("oa-div-1digit-divisor", 7);
  const mt = /Divide ([\d,]+) by (\d+)\./.exec(p.text);
  const ma = /(\d+)\s*R\s*(\d+)/i.exec(p.answer);
  assert.ok(mt && ma, `unparseable: ${p.text} / ${p.answer}`);
  const n = num(mt[1]);
  const d = Number(mt[2]);
  const q = Number(ma[1]);
  const r = Number(ma[2]);
  assert.equal(n, d * q + r);
  assert.ok(r > 0 && r < d, `remainder ${r} out of range for divisor ${d}`);
});

test("equiv answer scales with the shown denominator", () => {
  const p = generateProblem("fr-equiv", 7);
  const m = /(\d+)\/(\d+) = \?\/(\d+)/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.equal(Number(m[1]) * Number(m[3]), Number(m[2]) * num(p.answer));
});

test("add-like answer is equivalent to the parsed sum", () => {
  const p = generateProblem("fr-add-like", 7);
  const m = /(\d+)\/(\d+) \+ (\d+)\/(\d+)\?/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.ok(isEquivalentFraction(p.answer, `${Number(m[1]) + Number(m[3])}/${m[2]}`));
});

test("sub-like answer is equivalent to the parsed difference", () => {
  const p = generateProblem("fr-sub-like", 7);
  const m = /(\d+)\/(\d+) - (\d+)\/(\d+)\?/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.ok(isEquivalentFraction(p.answer, `${Number(m[1]) - Number(m[3])}/${m[2]}`));
});

test("compare-decimals answer is the larger value", () => {
  const p = generateProblem("fr-compare-decimals", 7);
  const m = /Which is greater: ([\d.]+) or ([\d.]+)\?/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.equal(Number(p.answer), Math.max(Number(m[1]), Number(m[2])));
});

test("area answer equals length × width", () => {
  const p = generateProblem("md-area", 7);
  const m = /is (\d+) cm long and (\d+) cm wide/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.equal(num(p.answer), Number(m[1]) * Number(m[2]));
});

test("perimeter answer equals 2 × (l + w)", () => {
  const p = generateProblem("md-perimeter", 7);
  const m = /is (\d+) cm long and (\d+) cm wide/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  assert.equal(num(p.answer), 2 * (Number(m[1]) + Number(m[2])));
});

const PLACE_EXP: Record<string, number> = {
  ones: 0,
  tens: 1,
  hundreds: 2,
  thousands: 3,
  "ten-thousands": 4,
  "hundred-thousands": 5,
};

test("place-value answer matches the digit at that place", () => {
  const p = generateProblem("bt-place-value", 7);
  const m = /In the number ([\d,]+), which digit is in the ([\w-]+) place\?/.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  const n = num(m[1]);
  const digit = Math.floor(n / 10 ** PLACE_EXP[m[2]]) % 10;
  assert.equal(p.answer, String(digit));
});

test("rounding answer is the nearest multiple", () => {
  const p = generateProblem("bt-rounding", 7);
  const m = /Round ([\d,]+) to the nearest (ten|hundred|thousand)\./.exec(p.text);
  assert.ok(m, `unparseable prompt: ${p.text}`);
  const f = m[2] === "ten" ? 10 : m[2] === "hundred" ? 100 : 1000;
  assert.equal(num(p.answer), Math.round(num(m[1]) / f) * f);
});

/* ---------- generators: determinism + metadata ---------- */

test("same seed yields the same problem", () => {
  const a = generateProblem("bt-add-multidigit", 42);
  const b = generateProblem("bt-add-multidigit", 42);
  assert.deepEqual(a, b);
});

test("mulberry32 is reproducible", () => {
  const r1 = mulberry32(99);
  const r2 = mulberry32(99);
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
});

test("all generators cover >= 10 skills and stay valid across seeds", () => {
  assert.ok(ALL_SKILLS.length >= 10, `only ${ALL_SKILLS.length} skills`);
  for (const skill of ALL_SKILLS) {
    for (let seed = 1; seed <= 25; seed++) {
      const p = generateProblem(skill, seed);
      assert.equal(p.skill, skill);
      assert.ok(["easy", "medium", "challenge"].includes(p.difficulty));
      assert.ok(["integer", "decimal", "fraction", "text"].includes(p.answerType));
      for (const f of [p.text, p.answer, p.hint1, p.hint2, p.explanation] as const) {
        assert.ok(f.trim().length > 0, `${skill}#${seed} has an empty field`);
      }
      // canonical answer must grade itself correct
      assert.equal(grade(p, p.answer), true, `${skill}#${seed} fails to grade its own answer`);
    }
  }
});

test("unknown skill id throws", () => {
  assert.throws(() => generateProblem("nope-not-a-skill", 1), /Unknown skill/);
});

/* ---------- answers: fractions ---------- */

test("equivalent fractions compare equal", () => {
  assert.equal(isEquivalentFraction("1/2", "2/4"), true);
  assert.equal(isEquivalentFraction("2/4", "1/2"), true);
  assert.equal(isEquivalentFraction(" 1 / 2 ", "2/4"), true);
});

test("non-equivalent fractions and junk compare unequal", () => {
  assert.equal(isEquivalentFraction("1/2", "1/3"), false);
  assert.equal(isEquivalentFraction("1/2", "3"), false);
  assert.equal(isEquivalentFraction("1/2", "1/0"), false);
  assert.equal(isEquivalentFraction("abc", "1/2"), false);
});

/* ---------- answers: formatting tolerance ---------- */

test("normalize strips commas, case, and extra whitespace", () => {
  assert.equal(normalizeAnswer("  1,000  "), "1000");
  assert.equal(normalizeAnswer("6 R  2"), "6 r 2");
});
test("integer compare tolerates commas but not values", () => {
  assert.equal(compareInteger("1000", "1,000"), true);
  assert.equal(compareInteger("42", " 42 "), true);
  assert.equal(compareInteger("42", "43"), false);
  assert.equal(compareInteger("42", "4/2"), false);
  assert.equal(compareInteger("42", "abc"), false);
});

test("decimal compare tolerates formatting and small drift", () => {
  assert.equal(compareDecimal("2.5", "2.50"), true);
  assert.equal(compareDecimal("3.14159", "3.142"), true);
  assert.equal(compareDecimal("3.15", "3.14"), false);
  assert.equal(compareDecimal("0.5", "1/2"), true);
});

test("isCorrectAnswer accepts decimal for a fraction answer", () => {
  assert.equal(isCorrectAnswer("1/2", "0.5", "fraction"), true);
  assert.equal(isCorrectAnswer("1/2", "2/4", "fraction"), true);
  assert.equal(isCorrectAnswer("1/2", "1/3", "fraction"), false);
});

test("isCorrectAnswer text is case-insensitive and spacing-tolerant", () => {
  assert.equal(isCorrectAnswer("6 R 2", "6 r 2", "text"), true);
  assert.equal(isCorrectAnswer("6 R 2", "6R2", "text"), true);
  assert.equal(isCorrectAnswer("6 R 2", "6 R 3", "text"), false);
});

/* ---------- grading ---------- */

test("grade accepts canonical answer, rejects wrong answer", () => {
  const p = generateProblem("oa-mult-1digit", 7);
  assert.equal(grade(p, p.answer), true);
  assert.equal(grade(p, String(Number(p.answer) + 1)), false);
});

test("grade uses canonical comparison only (no LLM)", () => {
  const p = generateProblem("fr-add-like", 7);
  assert.equal(grade(p, ` ${p.answer} `), true);
  const q = generateProblem("oa-div-1digit-divisor", 7);
  assert.equal(grade(q, q.answer.toLowerCase()), true);
});

test("gradeAttempt packages hint usage for mastery", () => {
  const p = generateProblem("oa-div-facts", 7);
  assert.deepEqual(gradeAttempt(p, p.answer), { correct: true, usedHint: false, submitted: p.answer });
  assert.deepEqual(gradeAttempt(p, "0", true), { correct: false, usedHint: true, submitted: "0" });
});

/* ---------- mastery ---------- */

test("new skill starts at 50 then earns first-try bonus", () => {
  assert.equal(updateMastery(undefined, true), 58);
  assert.equal(updateMastery(undefined, { correct: true, usedHint: false, submitted: "x" }), 58);
});

test("correct-after-hint gains less than first-try", () => {
  assert.equal(updateMastery(50, { correct: true, usedHint: true, submitted: "x" }), 53);
  assert.ok(updateMastery(50, true) > updateMastery(50, { correct: true, usedHint: true, submitted: "x" }));
});

test("miss loses 5 points", () => {
  assert.equal(updateMastery(50, false), 45);
  assert.equal(updateMastery(60, { correct: false, usedHint: false, submitted: "x" }), 55);
});

test("mastery clamps to [0, 100]", () => {
  assert.equal(updateMastery(100, true), 100);
  assert.equal(updateMastery(97, true), 100);
  assert.equal(updateMastery(0, false), 0);
  assert.equal(updateMastery(2, false), 0);
});

test("GENERATORS registry covers every composer skill", () => {
  for (const s of ALL_SKILLS) assert.ok(typeof GENERATORS[s] === "function", `${s} missing generator`);
});
