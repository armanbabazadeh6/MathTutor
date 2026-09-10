import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ALL_SKILLS,
  GENERATORS,
  GENERATOR_GRADES,
  generateProblem,
} from "../src/lib/math/generators";
import { grade } from "../src/lib/math/grading";
import {
  compareDecimal,
  isCorrectAnswer,
  isEquivalentFraction,
  numericValue,
} from "../src/lib/math/answers";
import { buildLesson, isLessonSupported } from "../src/lib/teach/lessons";
import type { Problem } from "../src/lib/math/types";

/**
 * Every member of the `VisualModel` union in `src/lib/visual/models.ts`.
 * Duplicated deliberately: a change to that union should fail this test.
 */
const LESSON_VISUAL_KINDS = [
  "fraction-bar",
  "number-line",
  "area-model",
  "place-value",
  "coordinate-grid",
  "angle",
  "unit-cubes",
  "clock",
  "polygon",
  "symmetry",
  "bar-graph",
  "number-chips",
];

/* Depth batch 2: angle types, triangle classification, symmetry, elapsed time,
   fraction number lines, decimal place value, composite perimeter, multi-step
   word problems, comparing fractions. */

const NEW_SKILLS = [
  "geo-angles-types",
  "geo-triangles",
  "geo-symmetry",
  "md-time",
  "fr-mixed-numbers",
  "fr-decimals-tenths",
  "geo-composite-shapes",
  "oa-multistep-word",
  "fr-compare",
];

function findSeed(skill: string, pred: (p: Problem) => boolean, max = 500): Problem {
  for (let seed = 1; seed <= max; seed++) {
    const p = generateProblem(skill, seed);
    if (pred(p)) return p;
  }
  throw new Error(`no seed <= ${max} matched for ${skill}`);
}

function toMin(h: number, m: number, ap: string): number {
  return (h % 12) * 60 + m + (ap === "PM" ? 12 * 60 : 0);
}

function parseClocks(p: Problem): { start: number; end: number } {
  const m = /starts at (\d+):(\d+) (AM|PM) and ends at (\d+):(\d+) (AM|PM)/.exec(p.text);
  assert.ok(m, `unparseable clocks: ${p.text}`);
  return {
    start: toMin(Number(m[1]), Number(m[2]), m[3]),
    end: toMin(Number(m[4]), Number(m[5]), m[6]),
  };
}

/* ---------- registry ---------- */

test("new skills are registered with generators, grade flags, and lessons", () => {
  assert.ok(ALL_SKILLS.length >= 30, `expected >=30 skills, got ${ALL_SKILLS.length}`);
  for (const id of NEW_SKILLS) {
    assert.ok(typeof GENERATORS[id] === "function", `${id} missing generator`);
    assert.equal(GENERATOR_GRADES[id], 4, `${id} should be grade 4`);
    assert.ok(isLessonSupported(id), `${id} missing lesson template`);
  }
});

/* ---------- angle types ---------- */

function expectedAngle(deg: number): string {
  return deg === 90 ? "right" : deg < 90 ? "acute" : "obtuse";
}

test("geo-angles-types answer matches the degree classification", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("geo-angles-types", seed);
    const m = /An angle measures (\d+) degrees/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    assert.equal(p.answer, expectedAngle(Number(m[1])));
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("geo-angles-types edge cases: right angle exists, extremes classify correctly", () => {
  const right = findSeed("geo-angles-types", (p) => p.text.includes("90 degrees"), 2000);
  assert.equal(right.answer, "right");
  const labels = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) labels.add(generateProblem("geo-angles-types", seed).answer);
  assert.ok(labels.has("acute") && labels.has("obtuse") && labels.has("right"), `labels: ${Array.from(labels)}`);
});

/* ---------- triangles ---------- */

test("geo-triangles side-length problems name the correct side class", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const p = generateProblem("geo-triangles", seed);
    const m = /side lengths (\d+) cm, (\d+) cm, and (\d+) cm/.exec(p.text);
    if (!m) continue;
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
    assert.ok(a + b > c && a + c > b && b + c > a, `degenerate triangle: ${p.text}`);
    const expected = a === b && b === c ? "equilateral" : a === b || b === c || a === c ? "isosceles" : "scalene";
    assert.equal(p.answer, expected, p.text);
  }
});

test("geo-triangles angle problems sum to 180 and name the correct angle class", () => {
  let checked = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const p = generateProblem("geo-triangles", seed);
    const m = /angles (\d+)°, (\d+)°, and (\d+)°/.exec(p.text);
    if (!m) continue;
    checked++;
    const [x, y, z] = [Number(m[1]), Number(m[2]), Number(m[3])];
    assert.equal(x + y + z, 180, p.text);
    const big = Math.max(x, y, z);
    const expected = big === 90 ? "right" : big < 90 ? "acute" : "obtuse";
    assert.equal(p.answer, expected, p.text);
  }
  assert.ok(checked > 0, "no angle-variant triangle found in seeds 1..12");
});

test("geo-triangles covers all six labels across seeds", () => {
  const labels = new Set<string>();
  for (let seed = 1; seed <= 300; seed++) labels.add(generateProblem("geo-triangles", seed).answer);
  for (const want of ["equilateral", "isosceles", "scalene", "acute", "right", "obtuse"]) {
    assert.ok(labels.has(want), `missing label ${want}; got ${Array.from(labels)}`);
  }
});

/* ---------- symmetry ---------- */

const SYMMETRY_EXPECTED: Record<string, string> = {
  square: "4",
  "rectangle that is not a square": "2",
  "equilateral triangle": "3",
  "isosceles triangle that is not equilateral": "1",
  "regular pentagon": "5",
  "regular hexagon": "6",
  "rhombus that is not a square": "2",
  kite: "1",
  "parallelogram that is neither a rectangle nor a rhombus": "0",
  "scalene triangle": "0",
};

test("geo-symmetry every shape yields its line count", () => {
  for (const [shape, lines] of Object.entries(SYMMETRY_EXPECTED)) {
    const p = findSeed("geo-symmetry", (q) => {
      const m = /does a (.+) have\?$/.exec(q.text);
      return !!m && m[1] === shape;
    });
    assert.equal(p.answer, lines, `${shape}: ${p.text}`);
    assert.ok(isCorrectAnswer(lines, p.answer, p.answerType));
  }
});

test("geo-symmetry answers stay in range and zero-line shapes exist", () => {
  let sawZero = false;
  for (let seed = 1; seed <= 25; seed++) {
    const p = generateProblem("geo-symmetry", seed);
    const v = Number(p.answer);
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 6, `out of range: ${p.answer}`);
    if (v === 0) sawZero = true;
  }
  assert.ok(sawZero, "no zero-line shape in seeds 1..25");
});

/* ---------- elapsed time ---------- */

test("md-time answer equals end minus start in minutes", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("md-time", seed);
    const { start, end } = parseClocks(p);
    assert.ok(end > start, `end not after start: ${p.text}`);
    assert.equal(Number(p.answer), end - start, p.text);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("md-time hour-boundary borrow case is correct", () => {
  const p = findSeed("md-time", (q) => {
    const m = /starts at \d+:(\d+) (AM|PM) and ends at \d+:(\d+) (AM|PM)/.exec(q.text);
    return !!m && Number(m[3]) < Number(m[1]);
  });
  const { start, end } = parseClocks(p);
  assert.equal(Number(p.answer), end - start, p.text);
});

test("md-time noon-crossing (AM to PM) case is correct", () => {
  const p = findSeed("md-time", (q) => q.text.includes("AM and ends at") && q.text.includes("PM."));
  const { start, end } = parseClocks(p);
  assert.ok(start < 12 * 60 && end > 12 * 60, p.text);
  assert.equal(Number(p.answer), end - start, p.text);
  // Midnight-crossing trips (e.g. 11 PM -> 1 AM) are out of scope: not generated.
  for (let seed = 1; seed <= 200; seed++) {
    const p = generateProblem("md-time", seed);
    const { start, end } = parseClocks(p);
    assert.ok(end > start, `end not after start: ${p.text}`);
    assert.ok(end < 24 * 60, `crosses midnight: ${p.text}`);
    assert.ok(end - start >= 15 && end - start <= 180, `duration out of range: ${p.text}`);
  }
});

/* ---------- fraction number line ---------- */

test("fr-mixed-numbers dot names tick/parts equivalently", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("fr-mixed-numbers", seed);
    const m = /each whole cut into (\d+) equal parts\)\. A dot sits at tick (\d+)/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    assert.ok(isCorrectAnswer(p.answer, `${m[2]}/${m[1]}`, "fraction"), `seed ${seed}: ${p.answer}`);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("fr-mixed-numbers improper-fraction dots (past one whole) work", () => {
  const p = findSeed("fr-mixed-numbers", (q) => {
    const m = /each whole cut into (\d+) equal parts\)\. A dot sits at tick (\d+)/.exec(q.text);
    return !!m && Number(m[2]) > Number(m[1]);
  });
  const m = /each whole cut into (\d+) equal parts\)\. A dot sits at tick (\d+)/.exec(p.text);
  assert.ok(m);
  assert.ok((numericValue(p.answer) ?? 0) > 1, `${p.text} = ${p.answer}`);
  assert.ok(isCorrectAnswer(p.answer, `${m[2]}/${m[1]}`, "fraction"), `${p.text} = ${p.answer}`);
});

test("fr-mixed-numbers answers are fully simplified, incl. whole numbers", () => {
  const whole = findSeed("fr-mixed-numbers", (q) => {
    const m = /each whole cut into (\d+) equal parts\)\. A dot sits at tick (\d+)/.exec(q.text);
    return !!m && Number(m[2]) % Number(m[1]) === 0;
  });
  assert.ok(!whole.answer.includes("/"), `whole answer should be plain: ${whole.answer}`);
  for (let seed = 1; seed <= 25; seed++) {
    const p = generateProblem("fr-mixed-numbers", seed);
    const frac = /^(-?\d+)\/(-?\d+)$/.exec(p.answer);
    if (frac) {
      const a = Math.abs(Number(frac[1]));
      const b = Math.abs(Number(frac[2]));
      const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
      assert.equal(g(a, b), 1, `not simplified: ${p.answer}`);
    }
  }
});

/* ---------- decimal place value ---------- */

test("fr-decimals-tenths digit value matches the place", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("fr-decimals-tenths", seed);
    const m = /In the number ([\d.]+), what is the value of the digit in the (\w+) place/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    const cents = Math.round(Number(m[1]) * 100);
    const expected =
      m[2] === "tenths" ? (Math.floor(cents / 10) % 10) / 10 : (cents % 10) / 100;
    assert.ok(compareDecimal(p.answer, String(expected)), `${p.text} = ${p.answer}`);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

test("fr-decimals-tenths zero-digit edge and fixed two-decimal format", () => {
  const zero = findSeed("fr-decimals-tenths", (q) => q.answer === "0", 300);
  assert.ok(grade(zero, "0") && !grade(zero, "zzz-nope-zzz"));
  for (let seed = 1; seed <= 25; seed++) {
    const p = generateProblem("fr-decimals-tenths", seed);
    const m = /In the number ([\d.]+),/.exec(p.text);
    assert.ok(m && /^\d+\.\d{2}$/.test(m[1]), `not two decimals: ${p.text}`);
  }
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 30; seed++) {
    kinds.add(generateProblem("fr-decimals-tenths", seed).text.includes("tenths") ? "t" : "h");
  }
  assert.ok(kinds.has("t") && kinds.has("h"), "both places should appear");
});
test("geo-composite-shapes answer is 2(W+H) with a strictly smaller notch", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("geo-composite-shapes", seed);
    const m = /from a (\d+) m by (\d+) m rectangle with a (\d+) m by (\d+) m/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    const [W, H, a, b] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    assert.ok(a < W && b < H, `notch not smaller: ${p.text}`);
    assert.equal(Number(p.answer), 2 * (W + H), p.text);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

/* ---------- multi-step word problems ---------- */

test("oa-multistep-word covers all six validated templates", () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 300; seed++) {
    const t = generateProblem("oa-multistep-word", seed).text;
    for (const k of ["party bags", "muffins", "books", "shells", "cookies", "garden"]) {
      if (t.includes(k)) seen.add(k);
    }
  }
  assert.equal(seen.size, 6, `seen: ${Array.from(seen)}`);
});

test("oa-multistep-word party bags: (a+b) x c", () => {
  const p = findSeed("oa-multistep-word", (q) => q.text.includes("party bags"));
  const m = /Each bag gets (\d+) stickers and (\d+) candies\. \w+ makes (\d+) bags/.exec(p.text);
  assert.ok(m, p.text);
  assert.equal(Number(p.answer), (Number(m[1]) + Number(m[2])) * Number(m[3]), p.text);
});

test("oa-multistep-word muffin boxes: a x b + c", () => {
  const p = findSeed("oa-multistep-word", (q) => q.text.includes("muffins"));
  const m = /boxes with (\d+) muffins each\. \w+ buys (\d+) boxes plus (\d+) extra/.exec(p.text);
  assert.ok(m, p.text);
  assert.equal(Number(p.answer), Number(m[1]) * Number(m[2]) + Number(m[3]), p.text);
});

test("oa-multistep-word book money: a - b x c stays positive", () => {
  const p = findSeed("oa-multistep-word", (q) => q.text.includes("books"));
  const m = /has \$(\d+)\. \w+ buys (\d+) books for \$(\d+) each/.exec(p.text);
  assert.ok(m, p.text);
  const [a, c, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert.ok(a - b * c > 0, `non-positive result: ${p.text}`);
  assert.equal(Number(p.answer), a - b * c, p.text);
});

test("oa-multistep-word shared shells: (a+b) / c is exact", () => {
  const p = findSeed("oa-multistep-word", (q) => q.text.includes("shells"));
  const m = /collects (\d+) shells on Saturday and (\d+) shells on Sunday, then shares all (\d+) shells equally among (\d+) friends/.exec(p.text);
  assert.ok(m, p.text);
  const [a, b, total, c] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  assert.equal(a + b, total, `total mismatch: ${p.text}`);
  assert.equal(total % c, 0, `not exact: ${p.text}`);
  assert.equal(Number(p.answer), total / c, p.text);
});

test("oa-multistep-word packed cookies: (a-b) / c is exact and positive", () => {
  const p = findSeed("oa-multistep-word", (q) => q.text.includes("cookies"));
  const m = /makes (\d+) cookies, sells (\d+), then packs the rest into boxes of (\d+)/.exec(p.text);
  assert.ok(m, p.text);
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert.ok(a - b > 0 && (a - b) % c === 0, `invalid numbers: ${p.text}`);
  assert.equal(Number(p.answer), (a - b) / c, p.text);
});

test("oa-multistep-word garden rows: a x b - c stays positive", () => {
  const p = findSeed("oa-multistep-word", (q) => q.text.includes("garden"));
  const m = /has (\d+) rows with (\d+) plants each\. (\d+) plants are moved/.exec(p.text);
  assert.ok(m, p.text);
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert.ok(a * b - c > 0, `non-positive result: ${p.text}`);
  assert.equal(Number(p.answer), a * b - c, p.text);
});

/* ---------- comparing fractions ---------- */

test("fr-compare answer is the greater fraction and never a tie", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const p = generateProblem("fr-compare", seed);
    const m = /Which is greater: (\d+)\/(\d+) or (\d+)\/(\d+)\?/.exec(p.text);
    assert.ok(m, `unparseable prompt: ${p.text}`);
    const [a, d1, b, d2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    assert.notEqual(d1, d2, `denominators should differ: ${p.text}`);
    assert.notEqual(a * d2, b * d1, `tie generated: ${p.text}`);
    const expected = a * d2 > b * d1 ? `${a}/${d1}` : `${b}/${d2}`;
    assert.equal(p.answer, expected, p.text);
    assert.ok(isCorrectAnswer(p.answer, p.answer, p.answerType));
  }
});

/* ---------- cross-cutting: determinism, grading, shape ---------- */

test("new skills are deterministic per seed", () => {
  for (const skill of NEW_SKILLS) {
    const a = generateProblem(skill, 42);
    const b = generateProblem(skill, 42);
    assert.deepEqual(a, b, skill);
  }
});

test("new skills self-grade true and reject junk", () => {
  for (const skill of NEW_SKILLS) {
    for (let seed = 1; seed <= 10; seed++) {
      const p = generateProblem(skill, seed);
      assert.equal(grade(p, p.answer), true, `${skill}#${seed} fails self-grade`);
      assert.equal(grade(p, "zzz-nope-zzz"), false, `${skill}#${seed} accepts junk`);
    }
  }
});

test("new problems are distractor-free with non-empty hints and explanations", () => {
  for (const skill of NEW_SKILLS) {
    for (let seed = 1; seed <= 5; seed++) {
      const p = generateProblem(skill, seed);
      for (const k of ["distractors", "choices", "options"] as const) {
        assert.ok(!(k in p), `${skill}#${seed} carries ${k}`);
      }
      for (const f of [p.text, p.answer, p.hint1, p.hint2, p.explanation] as const) {
        assert.ok(f.trim().length > 0, `${skill}#${seed} has an empty field`);
      }
      assert.ok(["easy", "medium", "challenge"].includes(p.difficulty), `${skill} bad difficulty`);
      assert.ok(["integer", "decimal", "fraction", "text"].includes(p.answerType), `${skill} bad type`);
    }
  }
});

test("new problems survive JSON serialization round-trips", () => {
  for (const skill of NEW_SKILLS) {
    const p = generateProblem(skill, 11);
    assert.deepEqual(JSON.parse(JSON.stringify(p)), p, skill);
    const lesson = buildLesson(p);
    assert.deepEqual(JSON.parse(JSON.stringify(lesson)), lesson, `${skill} lesson`);
  }
});

test("new skills have teachable lessons with valid shape", () => {
  for (const skill of NEW_SKILLS) {
    const p = generateProblem(skill, 7);
    const lesson = buildLesson(p);
    assert.equal(lesson.skill, skill);
    assert.equal(lesson.problemText, p.text);
    assert.ok(lesson.steps.length >= 3 && lesson.steps.length <= 5, `${skill}: ${lesson.steps.length} steps`);
    const hay = (p.text + " " + p.answer).replace(/,/g, "");
    for (const s of lesson.steps) {
      assert.ok(s.title.length > 0 && s.body.length > 0, `${skill} empty step`);
      // A step either carries a real visual model or nothing at all — the old
      // opaque "text" | "number-line" strings are gone.
      if (s.visual !== null) {
        assert.ok(
          LESSON_VISUAL_KINDS.includes(s.visual.kind),
          `${skill} unknown visual kind: ${s.visual.kind}`,
        );
      }
      assert.ok(s.workedNumbers.length > 0, `${skill} step without numbers`);
      assert.ok(
        s.workedNumbers.some((n) => hay.includes(String(n))),
        `${skill} step does not reference failed numbers`,
      );
    }
    const last = lesson.steps[lesson.steps.length - 1];
    assert.match(last.title.toLowerCase(), /try|your turn/);
  }
});
