import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ALL_SKILLS, generateProblem } from "../src/lib/math/generators";
import { buildVisual, describeVisual } from "../src/lib/visual";
import type { VisualModel } from "../src/lib/visual";

/* Visual-model pipeline contract: every skill has a picture, every picture is
   deterministic and finite, and a *practice* picture never prints the answer
   or a quantity derived from the problem's numbers. */

type Kind = VisualModel["kind"];

/** Skills with a real model (practice mode), and the kinds each may produce. */
const COVERED: Record<string, Kind[]> = {
  "bt-add-multidigit": ["number-line"],
  "bt-sub-multidigit": ["number-line"],
  "oa-mult-1digit": ["area-model"],
  "oa-mult-digit-1digit": ["place-value"],
  "oa-div-facts": ["number-line"],
  "oa-div-1digit-divisor": ["number-line"],
  "oa-order-ops": ["number-chips"],
  "bt-place-value": ["place-value"],
  "bt-rounding": ["place-value"],
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
  "geo-symmetry": ["polygon"],
  "geo-coord-plane": ["coordinate-grid"],
  "geo-composite-shapes": ["area-model"],
  "oa-multistep-word": ["area-model", "bar-graph"],
  /* ---- sibling generator set ---- */
  "oa-mult-2digit-2digit": ["place-value"],
  "oa-factor-pairs": ["number-line"],
  "oa-multiples-prime": ["number-line"],
  "oa-patterns": ["number-line"],
  "oa-remainders": ["number-line"],
  "oa-multistep-frac": ["fraction-bar"],
  "oa-expressions": ["number-chips"],
  "bt-add-sub-word": ["number-line"],
  "bt-multiply-10s": ["number-chips"],
  "bt-estimate": ["number-chips"],
  "bt-compare-order": ["number-line"],
  "bt-expanded-form": ["place-value", "number-chips"],
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

/** Skills whose `reveal` model is allowed to be a richer kind than practice. */
const REVEAL_KINDS: Record<string, Kind[]> = {
  "oa-mult-digit-1digit": ["bar-graph"],
  "oa-div-facts": ["area-model"],
  "oa-div-1digit-divisor": ["bar-graph"],
  "bt-rounding": ["number-line"],
  "geo-symmetry": ["symmetry"],
  "oa-mult-2digit-2digit": ["bar-graph"],
  "oa-factor-pairs": ["area-model"],
  "oa-multiples-prime": ["number-chips"],
  "oa-remainders": ["bar-graph"],
};

const SEEDS = [1, 2, 3, 4, 5];

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

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

function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((raw) => Number(raw.replace(/,/g, "")));
}

/** Numbers the model carries as content — the ones a reader can see. */
function contentNumbers(model: VisualModel): number[] {
  const out: number[] = [];
  const push = (value: unknown): void => {
    if (typeof value === "number") out.push(value);
    else if (typeof value === "string") out.push(...numbersIn(value));
  };
  switch (model.kind) {
    case "fraction-bar":
      push(model.numerator);
      push(model.denominator);
      if (model.compare) {
        push(model.compare.numerator);
        push(model.compare.denominator);
      }
      break;
    case "number-line":
      model.marks.forEach(push);
      push(model.label);
      break;
    case "area-model":
      push(model.rows);
      push(model.cols);
      push(model.label);
      break;
    case "place-value":
      // `highlight` is an index, never printed; the digits are the given number.
      push(model.digits);
      break;
    case "coordinate-grid":
      model.points.forEach((point) => {
        push(point.x);
        push(point.y);
      });
      break;
    case "angle":
      push(model.degrees);
      break;
    case "unit-cubes":
      push(model.length);
      push(model.width);
      push(model.height);
      break;
    case "clock":
      push(model.hour);
      push(model.minute);
      break;
    case "polygon":
      // `sides` is the shape being drawn, not a printed quantity.
      push(model.label);
      break;
    case "symmetry":
      push(model.axes);
      break;
    case "bar-graph":
      model.values.forEach(push);
      push(model.label);
      push(model.unit);
      break;
    case "number-chips":
      model.values.forEach(push);
      break;
  }
  return out;
}

/** Structural numbers a reader may see on a visual: origin, ruler, dial, grid. */
function structuralNumbers(model: VisualModel): Set<number> {
  const allowed = new Set<number>([0]);
  switch (model.kind) {
    case "number-line":
      allowed.add(model.min);
      allowed.add(model.max);
      for (let value = Math.ceil(model.min); value <= model.max; value++) allowed.add(value);
      break;
    case "coordinate-grid":
      allowed.add(model.max);
      for (let value = 1; value <= model.max; value++) allowed.add(value);
      break;
    case "polygon":
      allowed.add(model.sides);
      break;
    case "clock":
      // The dial numerals are printed on every analog clock face.
      for (let value = 1; value <= 12; value++) allowed.add(value);
      break;
    case "angle":
      // The dashed right-angle reference is a definitional constant.
      allowed.add(90);
      break;
    default:
      break;
  }
  return allowed;
}

/** Declared axis/dimension bounds: structural sizes, not content. */
function declaredBounds(model: VisualModel): number[] {
  switch (model.kind) {
    case "number-line":
      return [model.min, model.max];
    case "coordinate-grid":
      return [model.max];
    default:
      return [];
  }
}

/** Answer + every two-operand result of the numbers the prompt states. */
function derivedNumbers(problem: { text: string }): Set<number> {
  const operands = numbersIn(problem.text);
  const derived = new Set<number>();
  for (let i = 0; i < operands.length; i++) {
    for (let j = i + 1; j < operands.length; j++) {
      const a = operands[i];
      const b = operands[j];
      derived.add(a + b);
      derived.add(Math.abs(a - b));
      derived.add(a * b);
      if (b !== 0 && Number.isInteger(a / b)) derived.add(a / b);
      if (a !== 0 && Number.isInteger(b / a)) derived.add(b / a);
    }
  }
  return derived;
}

function visibleNumbers(model: VisualModel, sentence: string): number[] {
  return [...contentNumbers(model), ...numbersIn(sentence)];
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

/* ---------- practice safety: a visual is never an answer key ---------- */

test("a practice visual never prints the answer or a derived result", () => {
  const levels = [1, 2, 3, 4, 5] as const;
  for (const skillId of Object.keys(COVERED)) {
    for (const level of levels) {
      for (let seed = 1; seed <= 20; seed++) {
        const problem = generateProblem(skillId, seed, level);
        const model = buildVisual(skillId, { text: problem.text, answer: problem.answer });
        assert.ok(model, `${skillId} L${level} s${seed} produced no model`);
        const sentence = describeVisual(model);
        const where = `${skillId} L${level} s${seed} :: ${problem.text}`;

        const derived = derivedNumbers(problem);
        const answerNumbers = numbersIn(problem.answer);
        const normalised = problem.text.replace(/,/g, "");
        const bounds = declaredBounds(model);
        for (const value of visibleNumbers(model, sentence)) {
          const isAnswer = answerNumbers.includes(value);
          assert.ok(
            !isAnswer || normalised.includes(String(value)),
            `${where} printed the answer ${value} in "${sentence}"`,
          );
          // An axis bound may coincide with a derived number (a grid sized x + y
          // wide is still just a grid) — but never with the answer itself.
          if (bounds.includes(value) && !isAnswer) continue;
          assert.ok(
            !derived.has(value) || numbersIn(problem.text).includes(value),
            `${where} printed a derived value ${value} in "${sentence}"`,
          );
        }

        // Nothing invented: every visible number is a prompt number or a
        // structural count (ruler position, grid bound, dial numeral).
        const allowed = structuralNumbers(model);
        const promptNumbers = numbersIn(problem.text);
        for (const value of visibleNumbers(model, sentence)) {
          const stated = promptNumbers.includes(value) || normalised.includes(String(value));
          assert.ok(
            stated || allowed.has(value),
            `${where} printed an unexplained number ${value} in "${sentence}"`,
          );
        }
      }
    }
  }
});

test("practice never plots the point a coordinate question asks for", () => {
  for (const skillId of ["geo-coord-plane", "geo-coordinate-intro"]) {
    for (const level of [1, 3, 5] as const) {
      for (const seed of SEEDS) {
        const problem = generateProblem(skillId, seed, level);
        const model = buildVisual(skillId, { text: problem.text, answer: problem.answer });
        assert.ok(model && model.kind === "coordinate-grid", `${skillId} did not build a grid`);
        assert.deepEqual(model.points, [], `${skillId} L${level} s${seed} plotted the answer: ${problem.text}`);
      }
    }
  }
});

/* ---------- reveal: teach and results may show the worked outcome ---------- */

test("reveal shows the worked outcome where practice withholds it", () => {
  const cases: [string, (model: VisualModel, answer: string) => void][] = [
    [
      "oa-mult-1digit",
      (model) => {
        assert.match(describeVisual(model, { reveal: true }), /small squares in all/);
        assert.doesNotMatch(describeVisual(model), /small squares in all/);
      },
    ],
    [
      "bt-add-multidigit",
      (model, answer) => {
        assert.ok(model.kind === "number-line" && model.marks.includes(Number(answer)));
      },
    ],
    [
      "fr-equiv",
      (model, answer) => {
        assert.ok(model.kind === "fraction-bar");
        assert.equal(model.compare?.numerator, Number(answer));
      },
    ],
    [
      "geo-symmetry",
      (model, answer) => {
        assert.ok(model.kind === "symmetry" && model.axes === Number(answer));
      },
    ],
    [
      "oa-div-facts",
      (model, answer) => {
        assert.ok(model.kind === "area-model" && model.cols === Number(answer));
      },
    ],
    [
      "md-volume",
      (model, answer) => {
        assert.match(describeVisual(model, { reveal: true }), new RegExp(`${answer} unit cubes`));
        assert.doesNotMatch(describeVisual(model), new RegExp(`${answer} unit cubes`));
      },
    ],
  ];
  for (const [skillId, check] of cases) {
    const problem = generateProblem(skillId, 3, 2);
    const practice = buildVisual(skillId, { text: problem.text, answer: problem.answer });
    assert.ok(practice, `${skillId} practice model missing`);
    const revealed = buildVisual(skillId, { text: problem.text, answer: problem.answer }, { reveal: true });
    assert.ok(revealed, `${skillId} reveal model missing`);
    const allowed = REVEAL_KINDS[skillId];
    assert.ok(!allowed || allowed.includes(revealed.kind), `${skillId} reveal kind ${revealed.kind} unexpected`);
    check(revealed, problem.answer);
  }
});

/* ---------- models actually describe the problem ---------- */

test("number-line addition keeps the sum off the practice line", () => {
  const problem = { text: "What is 1,234 + 5,678?", answer: "6912" };
  const practice = buildVisual("bt-add-multidigit", problem);
  assert.ok(practice && practice.kind === "number-line");
  assert.deepEqual(practice.marks, [1234]);
  assert.ok(practice.max > 6912, "practice axis must leave room past the sum");

  const revealed = buildVisual("bt-add-multidigit", problem, { reveal: true });
  assert.ok(revealed && revealed.kind === "number-line");
  assert.deepEqual(revealed.marks, [1234, 6912]);
});

test("subtraction withholds the difference until reveal", () => {
  const problem = { text: "What is 9,000 - 1,200?", answer: "7800" };
  const practice = buildVisual("bt-sub-multidigit", problem);
  assert.ok(practice && practice.kind === "number-line");
  assert.deepEqual(practice.marks, [9000]);

  const revealed = buildVisual("bt-sub-multidigit", problem, { reveal: true });
  assert.ok(revealed && revealed.kind === "number-line");
  assert.deepEqual(revealed.marks, [7800, 9000]);
});

test("equivalent fractions leave the target bar empty until reveal", () => {
  const problem = { text: "Fill in the missing number: 3/4 = ?/12", answer: "9" };
  const practice = buildVisual("fr-equiv", problem);
  assert.ok(practice && practice.kind === "fraction-bar");
  assert.deepEqual({ n: practice.numerator, d: practice.denominator }, { n: 3, d: 4 });
  assert.deepEqual(practice.compare, { numerator: 0, denominator: 12 });

  const revealed = buildVisual("fr-equiv", problem, { reveal: true });
  assert.ok(revealed && revealed.kind === "fraction-bar");
  assert.deepEqual(revealed.compare, { numerator: 9, denominator: 12 });
});

test("unlike-denominator addition shows the operand bars, not the sum", () => {
  const problem = { text: "What is 1/3 + 1/4? Give your answer as a fraction.", answer: "7/12" };
  const practice = buildVisual("fr-add-unlike-5", problem);
  assert.ok(practice && practice.kind === "fraction-bar");
  assert.deepEqual({ n: practice.numerator, d: practice.denominator }, { n: 1, d: 3 });
  assert.deepEqual(practice.compare, { numerator: 1, denominator: 4 });

  const revealed = buildVisual("fr-add-unlike-5", problem, { reveal: true });
  assert.ok(revealed && revealed.kind === "fraction-bar");
  assert.deepEqual({ n: revealed.numerator, d: revealed.denominator }, { n: 7, d: 12 });
});

test("place value highlights the digit the question names", () => {
  const problem = { text: "In the number 45,371, which digit is in the hundreds place?", answer: "3" };
  const model = buildVisual("bt-place-value", problem);
  assert.ok(model && model.kind === "place-value");
  assert.equal(model.digits, "45371");
  assert.equal(model.highlight, 2);
  assert.doesNotMatch(describeVisual(model), /holds|worth|×/);
});

test("decimal place value highlights past the decimal point", () => {
  const problem = { text: "In the number 45.37, what is the value of the digit in the tenths place?", answer: "0.3" };
  const model = buildVisual("fr-decimals-tenths", problem);
  assert.ok(model && model.kind === "place-value");
  assert.equal(model.digits, "45.37");
  assert.equal(model.digits[model.highlight ?? 0], "3");
});

test("rounding points at the deciding digit, not the rounded value", () => {
  const problem = { text: "Round 4,820 to the nearest hundred.", answer: "4800" };
  const practice = buildVisual("bt-rounding", problem);
  assert.ok(practice && practice.kind === "place-value");
  assert.equal(practice.digits, "4820");
  assert.equal(practice.digits[practice.highlight ?? 0], "2");

  const revealed = buildVisual("bt-rounding", problem, { reveal: true });
  assert.ok(revealed && revealed.kind === "number-line");
  assert.deepEqual(revealed.marks, [4800, 4820, 4900]);
});

test("area grid mirrors the rectangle, volume stacks the box", () => {
  const area = buildVisual("md-area", { text: "A rectangle is 8 cm long and 5 cm wide. What is its area in square centimeters?", answer: "40" });
  assert.ok(area && area.kind === "area-model");
  assert.deepEqual({ rows: area.rows, cols: area.cols }, { rows: 8, cols: 5 });
  assert.doesNotMatch(describeVisual(area), /40|squares in all/);
  assert.match(describeVisual(area, { reveal: true }), /40 small squares/);

  const volume = buildVisual("md-volume", { text: "A box is 4 cm long, 3 cm wide, and 2 cm tall. What is its volume in cubic centimeters?", answer: "24" });
  assert.ok(volume && volume.kind === "unit-cubes");
  assert.deepEqual({ l: volume.length, w: volume.width, h: volume.height }, { l: 4, w: 3, h: 2 });
  assert.doesNotMatch(describeVisual(volume), /24/);
  assert.match(describeVisual(volume, { reveal: true }), /24 unit cubes/);
});

test("symmetry draws the shape until reveal supplies the axis count", () => {
  const problem = { text: "How many lines of symmetry does a regular hexagon have?", answer: "6" };
  const practice = buildVisual("geo-symmetry", problem);
  assert.ok(practice && practice.kind === "polygon");
  assert.equal(practice.sides, 6);
  assert.doesNotMatch(describeVisual(practice), /6/);

  const revealed = buildVisual("geo-symmetry", problem, { reveal: true });
  assert.ok(revealed && revealed.kind === "symmetry");
  assert.deepEqual({ sides: revealed.sides, axes: revealed.axes }, { sides: 6, axes: 6 });

  const none = buildVisual("geo-symmetry", { text: "How many lines of symmetry does a scalene triangle have?", answer: "0" }, { reveal: true });
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

test("coordinate grids withhold the plotted point until reveal", () => {
  const problem = {
    text: "Point A is 5 units to the right and 3 units up from the origin (0, 0). What are its coordinates? Write them like this: x, y.",
    answer: "5, 3",
  };
  const practice = buildVisual("geo-coord-plane", problem);
  assert.ok(practice && practice.kind === "coordinate-grid");
  assert.deepEqual(practice.points, []);
  assert.match(describeVisual(practice), /blank coordinate grid/);

  const revealed = buildVisual("geo-coord-plane", problem, { reveal: true });
  assert.ok(revealed && revealed.kind === "coordinate-grid");
  assert.deepEqual(revealed.points, [{ x: 5, y: 3 }]);
});

test("clock and angle use the measured values without naming the answer", () => {
  const problem = { text: "Class starts at 8:15 AM and ends at 9:30 AM. How many minutes long is class?", answer: "75" };
  const clock = buildVisual("md-time", problem);
  assert.ok(clock && clock.kind === "clock");
  assert.deepEqual({ hour: clock.hour, minute: clock.minute }, { hour: 8, minute: 15 });
  assert.doesNotMatch(describeVisual(clock), /75/);

  const angleProblem = { text: "An angle measures 120 degrees. Is it acute, right, or obtuse?", answer: "obtuse" };
  const angle = buildVisual("geo-angles-types", angleProblem);
  assert.ok(angle && angle.kind === "angle");
  assert.equal(angle.degrees, 120);
  assert.doesNotMatch(describeVisual(angle), /obtuse|acute/);
  assert.match(describeVisual(angle, { reveal: true }), /obtuse/);
});

/* ---------- refusals ---------- */

test("unknown skills and junk prompts return null instead of guessing", () => {
  assert.equal(buildVisual("oa-mult-3digit-1digit", { text: "What is 123 × 4?", answer: "492" }), null);
  assert.equal(buildVisual("totally-made-up-skill", { text: "What is 1 + 1?", answer: "2" }), null);
  for (const skillId of Object.keys(COVERED)) {
    for (const junk of ["", "   ", "The quick brown fox!", "What is ?", "Round to the nearest.", "1/2 + ?", "\u00d7 5"]) {
      const model = buildVisual(skillId, { text: junk, answer: "?" });
      assert.equal(model, null, `${skillId} guessed a model for junk: "${junk}"`);
      assert.equal(
        buildVisual(skillId, { text: junk, answer: "?" }, { reveal: true }),
        null,
        `${skillId} guessed a reveal model for junk: "${junk}"`,
      );
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
    // Reveal mode carries the full vocabulary; practice is checked separately.
    const text = describeVisual(model, { reveal: true });
    assert.ok(text.length > 20, `${kind} description too short: "${text}"`);
    assert.ok(describeVisual(model).length > 0, `${kind} has no practice description`);
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

  const empty = describeVisual({ kind: "fraction-bar", numerator: 0, denominator: 12 });
  assert.match(empty, /unshaded bar/);
  assert.match(empty, /12/);

  const area = describeVisual({ kind: "area-model", rows: 4, cols: 3 });
  assert.match(area, /4 rows/);
  assert.match(area, /3 columns/);
  assert.doesNotMatch(area, /12/);
  assert.match(describeVisual({ kind: "area-model", rows: 4, cols: 3 }, { reveal: true }), /12/);

  const cubes = describeVisual({ kind: "unit-cubes", length: 4, width: 3, height: 2 });
  assert.doesNotMatch(cubes, /24/);
  assert.match(describeVisual({ kind: "unit-cubes", length: 4, width: 3, height: 2 }, { reveal: true }), /24/);

  const clock = describeVisual({ kind: "clock", hour: 8, minute: 15 });
  assert.match(clock, /8:15/);

  const place = describeVisual({ kind: "place-value", digits: "45371", highlight: 2 });
  assert.match(place, /45371/);
  assert.match(place, /hundreds/);
  assert.doesNotMatch(place, /holds|×/);

  const line = describeVisual({ kind: "number-line", min: 0, max: 10, marks: [4, 10] });
  assert.match(line, /4/);
  assert.match(line, /10/);

  const blank = describeVisual({ kind: "coordinate-grid", points: [], max: 10 });
  assert.match(blank, /blank coordinate grid/);

  const chips = describeVisual({ kind: "number-chips", values: [3, 4, 5, 7, 35] });
  for (const value of [3, 4, 5, 7, 35]) assert.match(chips, new RegExp(String(value)));

  const graph = describeVisual({ kind: "bar-graph", values: [176, 2], label: "1,234 ÷ 7" });
  assert.match(graph, /1,234 ÷ 7/);
  assert.match(graph, /176/);
});
