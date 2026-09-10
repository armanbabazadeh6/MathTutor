import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ALL_SKILLS, generateProblem } from "../src/lib/math/generators";
import { buildVisual, describeVisual } from "../src/lib/visual";
import type { VisualModel } from "../src/lib/visual";

/* Visual-model pipeline contract: every skill the library claims to picture
   must produce a model for every seed the generator can throw at it, and the
   model must be finite, deterministic, and describable. */

type Kind = VisualModel["kind"];

/** Skills with a real model, and the kinds each one is allowed to produce. */
const COVERED: Record<string, Kind[]> = {
  "bt-add-multidigit": ["number-line"],
  "bt-sub-multidigit": ["number-line"],
  "oa-mult-1digit": ["area-model"],
  "oa-mult-digit-1digit": ["bar-graph"],
  "oa-div-facts": ["area-model"],
  "oa-div-1digit-divisor": ["bar-graph"],
  "oa-order-ops": ["number-chips"],
  "bt-place-value": ["place-value"],
  "bt-rounding": ["number-line"],
  "fr-decimals-tenths": ["place-value"],
  "fr-equiv": ["fraction-bar"],
  "fr-add-like": ["fraction-bar"],
  "fr-sub-like": ["fraction-bar"],
  "fr-add-unlike-5": ["fraction-bar"],
  "fr-sub-unlike-5": ["fraction-bar"],
  "fr-mult-whole-adv": ["fraction-bar"],
  "fr-compare": ["fraction-bar"],
  "fr-mixed-numbers": ["number-line"],
  "fr-compare-decimals": ["number-line"],
  "bt-dec-add-sub": ["number-chips"],
  "bt-dec-mult-pow10": ["number-chips"],
  "md-area": ["area-model"],
  "md-perimeter": ["polygon"],
  "md-volume": ["unit-cubes"],
  "md-time": ["clock"],
  "geo-angles-types": ["angle"],
  "geo-triangles": ["polygon"],
  "geo-symmetry": ["symmetry"],
  "geo-coord-plane": ["coordinate-grid"],
  "geo-composite-shapes": ["area-model"],
  "oa-multistep-word": ["area-model", "bar-graph"],
  /* ---- sibling generator set ---- */
  "oa-mult-2digit-2digit": ["bar-graph"],
  "oa-factor-pairs": ["area-model"],
  "oa-multiples-prime": ["number-chips"],
  "oa-patterns": ["number-line"],
  "oa-remainders": ["bar-graph"],
  "oa-multistep-frac": ["fraction-bar"],
  "oa-expressions": ["number-chips"],
  "bt-add-sub-word": ["number-line"],
  "bt-multiply-10s": ["number-chips"],
  "bt-estimate": ["number-chips"],
  "bt-compare-order": ["number-line"],
  "bt-expanded-form": ["place-value"],
  "fr-add-unlike-10-100": ["fraction-bar"],
  "fr-mult-fraction-whole": ["fraction-bar"],
  "fr-fraction-word": ["fraction-bar"],
  "md-length-convert": ["bar-graph"],
  "md-mass-capacity": ["bar-graph"],
  "md-money": ["bar-graph"],
  "md-line-plots": ["bar-graph"],
  "md-angles": ["angle", "number-chips"],
  "md-area-perimeter-word": ["area-model", "polygon"],
  "geo-points-lines": ["number-line", "polygon"],
  "geo-quadrilaterals": ["polygon"],
  "geo-coordinate-intro": ["coordinate-grid"],
  "geo-quad-hierarchy": ["polygon"],
};

const SEEDS = [1, 2, 3, 4, 5];

function assertFiniteNumbers(value: unknown, path: string): void {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} is not finite: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertFiniteNumbers(item, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertFiniteNumbers(item, `${path}.${key}`);
    }
  }
}

/* ---------- pipeline contract ---------- */

test("every covered skill yields a finite model of the expected kind for every seed", () => {
  for (const [skillId, kinds] of Object.entries(COVERED)) {
    assert.ok(kinds.length > 0, `${skillId} has no expected kind`);
    for (const seed of SEEDS) {
      const problem = generateProblem(skillId, seed);
      const model = buildVisual(skillId, { text: problem.text, answer: problem.answer });
      assert.ok(model, `${skillId} seed ${seed} produced no model for: ${problem.text}`);
      assert.ok(
        kinds.includes(model.kind),
        `${skillId} seed ${seed} produced ${model.kind}, expected ${kinds.join("/")} for: ${problem.text}`,
      );
      assertFiniteNumbers(model, `${skillId}#${seed}`);
      const again = buildVisual(skillId, { text: problem.text, answer: problem.answer });
      assert.deepEqual(again, model, `${skillId} seed ${seed} is not deterministic`);
    }
  }
});

test("every registered skill has a picture, and every covered id is real", () => {
  const unknown = Object.keys(COVERED).filter((id) => !ALL_SKILLS.includes(id));
  assert.deepEqual(unknown, [], `covered skills missing from the generator registry: ${unknown.join(", ")}`);
  const uncovered = ALL_SKILLS.filter((id) => !(id in COVERED));
  assert.deepEqual(uncovered, [], `registered skills with no visual model: ${uncovered.join(", ")}`);
});

test("parsing survives every level, including the largest operands", () => {
  const levels = [1, 2, 3, 4, 5] as const;
  for (const skillId of Object.keys(COVERED)) {
    for (const level of levels) {
      for (const seed of [1, 2, 3]) {
        const problem = generateProblem(skillId, seed, level);
        const model = buildVisual(skillId, { text: problem.text, answer: problem.answer });
        assert.ok(model, `${skillId} level ${level} seed ${seed} produced no model for: ${problem.text}`);
        assertFiniteNumbers(model, `${skillId} L${level}#${seed}`);
      }
    }
  }
});

/* ---------- models actually describe the problem ---------- */

test("number-line addition places the sum after the first addend", () => {
  const model = buildVisual("bt-add-multidigit", { text: "What is 1,234 + 5,678?", answer: "6912" });
  assert.ok(model && model.kind === "number-line");
  assert.deepEqual(model.marks, [1234, 6912]);
  assert.equal(model.max, 6912);
});

test("subtraction marks the minuend and the difference", () => {
  const model = buildVisual("bt-sub-multidigit", { text: "What is 9,000 - 1,200?", answer: "7800" });
  assert.ok(model && model.kind === "number-line");
  assert.deepEqual(model.marks, [7800, 9000]);
});

test("equivalent fractions show the same shading at both scales", () => {
  const model = buildVisual("fr-equiv", { text: "Fill in the missing number: 3/4 = ?/12", answer: "9" });
  assert.ok(model && model.kind === "fraction-bar");
  assert.deepEqual({ n: model.numerator, d: model.denominator }, { n: 3, d: 4 });
  assert.deepEqual(model.compare, { numerator: 9, denominator: 12 });
});

test("unlike-denominator addition uses a common-denominator bar", () => {
  const model = buildVisual("fr-add-unlike-5", { text: "What is 1/3 + 1/4? Give your answer as a fraction.", answer: "7/12" });
  assert.ok(model && model.kind === "fraction-bar");
  assert.deepEqual({ n: model.numerator, d: model.denominator }, { n: 7, d: 12 });
  assert.deepEqual(model.compare, { numerator: 1, denominator: 3 });
});

test("place value highlights the digit the question names", () => {
  const model = buildVisual("bt-place-value", { text: "In the number 45,371, which digit is in the hundreds place?", answer: "3" });
  assert.ok(model && model.kind === "place-value");
  assert.equal(model.digits, "45371");
  assert.equal(model.highlight, 2);
});

test("decimal place value highlights past the decimal point", () => {
  const model = buildVisual("fr-decimals-tenths", { text: "In the number 45.37, what is the value of the digit in the tenths place?", answer: "0.3" });
  assert.ok(model && model.kind === "place-value");
  assert.equal(model.digits, "45.37");
  assert.equal(model.digits[model.highlight ?? 0], "3");
});

test("rounding brackets the number between its neighbouring multiples", () => {
  const model = buildVisual("bt-rounding", { text: "Round 4,820 to the nearest hundred.", answer: "4800" });
  assert.ok(model && model.kind === "number-line");
  assert.deepEqual(model.marks, [4800, 4820, 4900]);
});

test("area grid mirrors the rectangle, volume stacks the box", () => {
  const area = buildVisual("md-area", { text: "A rectangle is 8 cm long and 5 cm wide. What is its area in square centimeters?", answer: "40" });
  assert.ok(area && area.kind === "area-model");
  assert.deepEqual({ rows: area.rows, cols: area.cols }, { rows: 8, cols: 5 });

  const volume = buildVisual("md-volume", { text: "A box is 4 cm long, 3 cm wide, and 2 cm tall. What is its volume in cubic centimeters?", answer: "24" });
  assert.ok(volume && volume.kind === "unit-cubes");
  assert.deepEqual({ l: volume.length, w: volume.width, h: volume.height }, { l: 4, w: 3, h: 2 });
});

test("symmetry draws the shape with the asked-for axis count", () => {
  const model = buildVisual("geo-symmetry", { text: "How many lines of symmetry does a regular hexagon have?", answer: "6" });
  assert.ok(model && model.kind === "symmetry");
  assert.deepEqual({ sides: model.sides, axes: model.axes }, { sides: 6, axes: 6 });

  const none = buildVisual("geo-symmetry", { text: "How many lines of symmetry does a scalene triangle have?", answer: "0" });
  assert.ok(none && none.kind === "symmetry");
  assert.equal(none.axes, 0);
});

test("composite shapes keep the bounding rectangle and name the notch", () => {
  const model = buildVisual("geo-composite-shapes", {
    text: "An L-shaped patio is made from a 12 m by 9 m rectangle with a 4 m by 3 m corner piece removed. What is its perimeter in meters?",
    answer: "42",
  });
  assert.ok(model && model.kind === "area-model");
  assert.deepEqual({ rows: model.rows, cols: model.cols }, { rows: 9, cols: 12 });
  assert.match(model.label ?? "", /4 m by 3 m/);
});

test("coordinate grid plots the named point", () => {
  const model = buildVisual("geo-coord-plane", {
    text: "Point A is 5 units to the right and 3 units up from the origin (0, 0). What are its coordinates? Write them like this: x, y.",
    answer: "5, 3",
  });
  assert.ok(model && model.kind === "coordinate-grid");
  assert.deepEqual(model.points, [{ x: 5, y: 3 }]);
});

test("clock and angle use the measured values", () => {
  const clock = buildVisual("md-time", { text: "Class starts at 8:15 AM and ends at 9:30 AM. How many minutes long is class?", answer: "75" });
  assert.ok(clock && clock.kind === "clock");
  assert.deepEqual({ hour: clock.hour, minute: clock.minute }, { hour: 8, minute: 15 });

  const angle = buildVisual("geo-angles-types", { text: "An angle measures 120 degrees. Is it acute, right, or obtuse?", answer: "obtuse" });
  assert.ok(angle && angle.kind === "angle");
  assert.equal(angle.degrees, 120);
});

/* ---------- refusals ---------- */

test("unknown skills and junk prompts return null instead of guessing", () => {
  // Every registered skill now has a model, so refusal only applies to ids the
  // registry does not know and to prompts that do not match their skill.
  assert.equal(buildVisual("oa-mult-3digit-1digit", { text: "What is 123 × 4?", answer: "492" }), null);
  assert.equal(buildVisual("totally-made-up-skill", { text: "What is 1 + 1?", answer: "2" }), null);
  for (const skillId of Object.keys(COVERED)) {
    for (const junk of ["", "   ", "The quick brown fox!", "What is ?", "Round to the nearest.", "1/2 + ?", "\u00d7 5"]) {
      const model = buildVisual(skillId, { text: junk, answer: "?" });
      assert.equal(model, null, `${skillId} guessed a model for junk: "${junk}"`);
    }
  }
});

test("mismatched prompts inside a covered skill are refused, not mis-parsed", () => {
  assert.equal(buildVisual("md-volume", { text: "A rectangle is 8 cm long and 5 cm wide.", answer: "40" }), null);
  assert.equal(buildVisual("geo-angles-types", { text: "How many lines of symmetry does a square have?", answer: "4" }), null);
  assert.equal(buildVisual("fr-mult-whole-adv", { text: "What is 1/3 + 1/4? Give your answer as a fraction.", answer: "7/12" }), null);
});

/* ---------- descriptions ---------- */

const SAMPLES: [Kind, VisualModel][] = [
  ["fraction-bar", { kind: "fraction-bar", numerator: 3, denominator: 8, compare: { numerator: 1, denominator: 2 } }],
  ["number-line", { kind: "number-line", min: 0, max: 10, marks: [4, 10], label: "4 + 6" }],
  ["area-model", { kind: "area-model", rows: 4, cols: 3, label: "4 × 3" }],
  ["place-value", { kind: "place-value", digits: "45371", highlight: 2 }],
  ["coordinate-grid", { kind: "coordinate-grid", points: [{ x: 5, y: 3 }], max: 10 }],
  ["angle", { kind: "angle", degrees: 120 }],
  ["unit-cubes", { kind: "unit-cubes", length: 4, width: 3, height: 2 }],
  ["clock", { kind: "clock", hour: 8, minute: 15 }],
  ["polygon", { kind: "polygon", sides: 4, equalSides: false, label: "8 cm long, 5 cm wide" }],
  ["symmetry", { kind: "symmetry", sides: 6, axes: 6 }],
  ["bar-graph", { kind: "bar-graph", values: [176, 2], label: "1,234 ÷ 7", unit: "shells" }],
  ["number-chips", { kind: "number-chips", values: [3, 4, 5, 7, 35] }],
];

test("every kind has its own precise sentence, and it repeats the numbers", () => {
  const seen = new Map<string, Kind>();
  for (const [kind, model] of SAMPLES) {
    const text = describeVisual(model);
    assert.ok(text.length > 20, `${kind} description too short: "${text}"`);
    const clash = seen.get(text);
    assert.equal(clash, undefined, `${kind} and ${clash} share a description: "${text}"`);
    seen.set(text, kind);
  }
  assert.equal(seen.size, SAMPLES.length);
});

test("descriptions name the actual maths", () => {
  const fractionBar = describeVisual({ kind: "fraction-bar", numerator: 3, denominator: 8 });
  assert.match(fractionBar, /3/);
  assert.match(fractionBar, /8/);

  const area = describeVisual({ kind: "area-model", rows: 4, cols: 3 });
  assert.match(area, /4 rows/);
  assert.match(area, /3 columns/);
  assert.match(area, /12/);

  const cubes = describeVisual({ kind: "unit-cubes", length: 4, width: 3, height: 2 });
  assert.match(cubes, /24/);

  const clock = describeVisual({ kind: "clock", hour: 8, minute: 15 });
  assert.match(clock, /8:15/);

  const place = describeVisual({ kind: "place-value", digits: "45371", highlight: 2 });
  assert.match(place, /45371/);
  assert.match(place, /3/);
  assert.match(place, /hundreds/);

  const line = describeVisual({ kind: "number-line", min: 0, max: 10, marks: [4, 10] });
  assert.match(line, /4/);
  assert.match(line, /10/);

  const chips = describeVisual({ kind: "number-chips", values: [3, 4, 5, 7, 35] });
  for (const value of [3, 4, 5, 7, 35]) assert.match(chips, new RegExp(String(value)));

  const graph = describeVisual({ kind: "bar-graph", values: [176, 2], label: "1,234 ÷ 7" });
  assert.match(graph, /1,234 ÷ 7/);
  assert.match(graph, /176/);
});
