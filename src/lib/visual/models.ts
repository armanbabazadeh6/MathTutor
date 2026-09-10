/**
 * Drawable visual models for generated problems.
 *
 * Pure data + prompt parsing: no React, no DOM, no imports — every generator
 * prompt is read back with a pattern matched to the text the generator in
 * `src/lib/math/generators.ts` actually produces. `buildVisual` never throws
 * and never returns a model containing NaN or Infinity; anything it cannot
 * picture safely returns `null`.
 */

export interface VisualFraction {
  numerator: number;
  denominator: number;
}

export interface VisualPoint {
  x: number;
  y: number;
}

export type VisualModel =
  | {
      kind: "fraction-bar";
      numerator: number;
      denominator: number;
      compare?: VisualFraction;
    }
  | { kind: "number-line"; min: number; max: number; marks: number[]; label?: string }
  | { kind: "area-model"; rows: number; cols: number; label?: string }
  | { kind: "place-value"; digits: string; highlight?: number }
  | { kind: "coordinate-grid"; points: VisualPoint[]; max: number }
  | { kind: "angle"; degrees: number }
  | { kind: "unit-cubes"; length: number; width: number; height: number }
  | { kind: "clock"; hour: number; minute: number }
  | { kind: "polygon"; sides: number; equalSides?: boolean; label?: string }
  | { kind: "symmetry"; sides: number; axes: number }
  | { kind: "bar-graph"; values: number[]; label: string; unit?: string }
  | { kind: "number-chips"; values: number[] };

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** Digits with optional thousands separators -> number. */
function num(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/** Thousands-separated integers, trimmed decimals, em dash for non-numbers. */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "\u2014";
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return String(Number(n.toFixed(4)));
}

/** Reject null and any model carrying NaN/Infinity in a numeric slot. */
function valid(model: VisualModel | null): VisualModel | null {
  if (!model) return null;
  return finite(model) ? model : null;
}

function finite(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(finite);
  }
  return true;
}

const PLACE_EXP: Record<string, number> = {
  ones: 0,
  tens: 1,
  hundreds: 2,
  thousands: 3,
  "ten-thousands": 4,
  "hundred-thousands": 5,
};

const ROUND_FACTOR: Record<string, number> = { ten: 10, hundred: 100, thousand: 1000 };

const INT_PLACES = ["ones", "tens", "hundreds", "thousands", "ten-thousands", "hundred-thousands"];
const DEC_PLACES = ["tenths", "hundredths", "thousandths"];

/** Full place name of the character at `index` of a written number, if known. */
function placeNameAt(digits: string, index: number): string | null {
  if (index < 0 || index >= digits.length) return null;
  const dot = digits.indexOf(".");
  if (dot === -1) return INT_PLACES[digits.length - 1 - index] ?? null;
  if (index < dot) return INT_PLACES[dot - 1 - index] ?? null;
  if (index === dot) return "decimal point";
  return DEC_PLACES[index - dot - 1] ?? null;
}

/** Multiplier that gives the highlighted digit its value (e.g. tenths -> 1/10). */
function placeUnitAt(digits: string, index: number): string | null {
  if (index < 0 || index >= digits.length) return null;
  const dot = digits.indexOf(".");
  if (dot !== -1 && index > dot) {
    const places = index - dot;
    return places === 1 ? "1/10" : `1/1${"0".repeat(places - 1)}`;
  }
  const exponent = dot === -1 ? digits.length - 1 - index : dot - 1 - index;
  return exponent <= 0 ? "1" : `1${"0".repeat(exponent)}`;
}

/** Place-value parts of `n * factor`, biggest place first (partial products). */
function placeParts(n: number, factor: number): number[] {
  const text = String(n);
  const parts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const digit = Number(text[i]);
    if (digit === 0) continue;
    parts.push(digit * 10 ** (text.length - 1 - i) * factor);
  }
  return parts;
}

/* ------------------------------------------------------------------ *
 * Prompt -> model
 * ------------------------------------------------------------------ */

const EQUIV = /Fill in the missing number: (\d+)\/(\d+) = \?\/(\d+)/;
const ADD_LIKE = /What is (\d+)\/(\d+) \+ (\d+)\/(\d+)\?/;
const SUB_LIKE = /What is (\d+)\/(\d+) - (\d+)\/(\d+)\?/;
const ADD_UNLIKE = /What is (\d+)\/(\d+) \+ (\d+)\/(\d+)\?/;
const SUB_UNLIKE = /What is (\d+)\/(\d+) - (\d+)\/(\d+)\?/;
const COMPARE_FRACTIONS = /Which is greater: (\d+)\/(\d+) or (\d+)\/(\d+)\?/;
const COMPARE_DECIMALS = /Which is greater: (\d+(?:\.\d+)?) or (\d+(?:\.\d+)?)\?/;
const MULT_WHOLE = /What is (\d+)\/(\d+) × (\d+)\?/;
const RECT_SIDES = /A rectangle is ([\d,]+) cm long and ([\d,]+) cm wide\./;
const TRIANGLE_SIDES = /triangle has side lengths (\d+) cm, (\d+) cm, and (\d+) cm/;
const TRIANGLE_ANGLES = /triangle has angles (\d+)°, (\d+)°, and (\d+)°/;
const DECIMAL_PLACE = /In the number ([\d.]+), what is the value of the digit in the (tenths|hundredths) place\?/;
const DEC_ADD_SUB = /What is (\d+(?:\.\d+)?) ([+-]) (\d+(?:\.\d+)?)\?/;
const DEC_POW10 = /What is (\d+(?:\.\d+)?) × (\d+)\?/;

/**
 * Shapes used by the symmetry generator, keyed by the phrase that appears in
 * the prompt. Insertion order matters: the most specific phrase must be tested
 * first ("rectangle that is not a square" contains "square" too).
 */
const SYMMETRY_SIDES: Record<string, number> = {
  hexagon: 6,
  pentagon: 5,
  "equilateral triangle": 3,
  "isosceles triangle": 3,
  "scalene triangle": 3,
  triangle: 3,
  kite: 4,
  rhombus: 4,
  rectangle: 4,
  square: 4,
};

/**
 * Best-effort model for a generated problem, or null when a picture adds
 * nothing. Deterministic: the same skill id + prompt text always yields the
 * same model (or the same null).
 */
export function buildVisual(
  skillId: string,
  problem: { text: string; answer: string },
): VisualModel | null {
  const text = typeof problem?.text === "string" ? problem.text : "";
  const answer = typeof problem?.answer === "string" ? problem.answer : "";

  switch (skillId) {
    /* ---------- whole-number operations ---------- */
    case "bt-add-multidigit": {
      const m = /What is ([\d,]+) \+ ([\d,]+)\?/.exec(text);
      if (!m) return null;
      const a = num(m[1]);
      const b = num(m[2]);
      return valid({
        kind: "number-line",
        min: 0,
        max: a + b,
        marks: [a, a + b],
        label: `${fmtNum(a)} + ${fmtNum(b)}`,
      });
    }

    case "bt-sub-multidigit": {
      const m = /What is ([\d,]+) - ([\d,]+)\?/.exec(text);
      if (!m) return null;
      const a = num(m[1]);
      const b = num(m[2]);
      return valid({ kind: "number-line", min: 0, max: a, marks: [a - b, a], label: `${fmtNum(a)} − ${fmtNum(b)}` });
    }

    case "oa-mult-1digit": {
      const m = /What is (\d+) × (\d+)\?/.exec(text);
      if (!m) return null;
      const a = num(m[1]);
      const b = num(m[2]);
      return valid({ kind: "area-model", rows: a, cols: b, label: `${a} × ${b}` });
    }

    case "oa-mult-digit-1digit": {
      const m = /What is ([\d,]+) × (\d+)\?/.exec(text);
      if (!m) return null;
      const a = num(m[1]);
      const b = num(m[2]);
      const parts = placeParts(a, b);
      return valid({
        kind: "bar-graph",
        values: parts.length > 0 ? parts : [a * b],
        label: `${fmtNum(a)} × ${b} split by place value`,
      });
    }

    case "oa-div-1digit-divisor": {
      const m = /Divide ([\d,]+) by (\d+)/.exec(text);
      const parsed = /^(\d+) R (\d+)$/.exec(answer.trim());
      if (!m || !parsed) return null;
      const n = num(m[1]);
      const d = num(m[2]);
      const quotient = num(parsed[1]);
      const remainder = num(parsed[2]);
      return valid({
        kind: "bar-graph",
        values: [quotient, remainder],
        label: `${fmtNum(n)} ÷ ${d} = ${quotient} groups of ${d}, ${remainder} left over`,
      });
    }

    case "oa-order-ops": {
      const paren = /What is \((\d+) \+ (\d+)\) × (\d+)\?/.exec(text);
      if (paren) {
        const [a, b, c] = [num(paren[1]), num(paren[2]), num(paren[3])];
        return valid({ kind: "number-chips", values: [a, b, c, a + b, (a + b) * c] });
      }
      const plain = /What is (\d+) \+ (\d+) × (\d+)\?/.exec(text);
      if (!plain) return null;
      const [a, b, c] = [num(plain[1]), num(plain[2]), num(plain[3])];
      return valid({ kind: "number-chips", values: [a, b, c, b * c, a + b * c] });
    }

    /* ---------- place value & rounding ---------- */
    case "bt-place-value": {
      const m = /In the number ([\d,]+), which digit is in the ([\w-]+) place\?/.exec(text);
      if (!m) return null;
      const digits = m[1].replace(/,/g, "");
      const exponent = PLACE_EXP[m[2]];
      return valid({
        kind: "place-value",
        digits,
        highlight: exponent === undefined ? undefined : digits.length - 1 - exponent,
      });
    }

    case "bt-rounding": {
      const m = /Round ([\d,]+) to the nearest (ten|hundred|thousand)\./.exec(text);
      if (!m) return null;
      const n = num(m[1]);
      const factor = ROUND_FACTOR[m[2]];
      const lower = Math.floor(n / factor) * factor;
      const upper = lower + factor;
      return valid({
        kind: "number-line",
        min: Math.min(lower, n),
        max: Math.max(upper, n),
        marks: Array.from(new Set([lower, n, upper])).sort((a, b) => a - b),
        label: `nearest ${m[2]}`,
      });
    }

    case "fr-decimals-tenths": {
      const m = DECIMAL_PLACE.exec(text);
      if (!m) return null;
      const digits = m[1];
      const dot = digits.indexOf(".");
      if (dot === -1) return valid({ kind: "place-value", digits });
      const highlight = dot + (m[2] === "tenths" ? 1 : 2);
      return valid({
        kind: "place-value",
        digits,
        highlight: highlight < digits.length ? highlight : undefined,
      });
    }

    /* ---------- fractions ---------- */
    case "fr-equiv": {
      const m = EQUIV.exec(text);
      if (!m) return null;
      const numerator = num(m[1]);
      const denominator = num(m[2]);
      const target = num(m[3]);
      if (denominator === 0 || target % denominator !== 0) return null;
      const scale = target / denominator;
      return valid({
        kind: "fraction-bar",
        numerator,
        denominator,
        compare: { numerator: numerator * scale, denominator: target },
      });
    }

    case "fr-add-like": {
      const m = ADD_LIKE.exec(text);
      if (!m) return null;
      const [a, d1, b, d2] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])];
      if (d1 !== d2) return null;
      return valid({ kind: "fraction-bar", numerator: a + b, denominator: d1, compare: { numerator: a, denominator: d1 } });
    }

    case "fr-sub-like": {
      const m = SUB_LIKE.exec(text);
      if (!m) return null;
      const [a, d1, b, d2] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])];
      if (d1 !== d2) return null;
      return valid({ kind: "fraction-bar", numerator: a - b, denominator: d1, compare: { numerator: a, denominator: d1 } });
    }

    case "fr-add-unlike-5": {
      const m = ADD_UNLIKE.exec(text);
      if (!m) return null;
      const [a, d1, b, d2] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])];
      const denominator = d1 * d2;
      return valid({
        kind: "fraction-bar",
        numerator: a * d2 + b * d1,
        denominator,
        compare: { numerator: a, denominator: d1 },
      });
    }

    case "fr-sub-unlike-5": {
      const m = SUB_UNLIKE.exec(text);
      if (!m) return null;
      const [a, d1, b, d2] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])];
      const numerator = a * d2 - b * d1;
      if (numerator <= 0) return null;
      return valid({
        kind: "fraction-bar",
        numerator,
        denominator: d1 * d2,
        compare: { numerator: a, denominator: d1 },
      });
    }

    case "fr-mult-whole-adv": {
      const m = MULT_WHOLE.exec(text);
      if (!m) return null;
      const [a, d, whole] = [num(m[1]), num(m[2]), num(m[3])];
      return valid({
        kind: "fraction-bar",
        numerator: a * whole,
        denominator: d,
        compare: { numerator: a, denominator: d },
      });
    }

    case "fr-compare": {
      const m = COMPARE_FRACTIONS.exec(text);
      if (!m) return null;
      const [a, d1, b, d2] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])];
      return valid({
        kind: "fraction-bar",
        numerator: a,
        denominator: d1,
        compare: { numerator: b, denominator: d2 },
      });
    }

    case "fr-mixed-numbers": {
      const m = /number line from 0 to (\d+) is split into \w+ \(each whole cut into (\d+) equal parts\)\. A dot sits at tick (\d+)/.exec(text);
      if (!m) return null;
      const wholes = num(m[1]);
      const parts = num(m[2]);
      const tick = num(m[3]);
      if (parts <= 0 || tick > wholes * parts) return null;
      return valid({
        kind: "number-line",
        min: 0,
        max: wholes,
        marks: [tick / parts],
        label: `each whole cut into ${parts} equal parts; the dot is ${tick} jumps from 0`,
      });
    }

    case "fr-compare-decimals": {
      const m = COMPARE_DECIMALS.exec(text);
      if (!m) return null;
      const x = num(m[1]);
      const y = num(m[2]);
      return valid({
        kind: "number-line",
        min: 0,
        max: Math.max(Math.ceil(Math.max(x, y)), 1),
        marks: Array.from(new Set([x, y])).sort((a, b) => a - b),
        label: `${fmtNum(x)} or ${fmtNum(y)}`,
      });
    }

    case "bt-dec-add-sub": {
      const m = DEC_ADD_SUB.exec(text);
      if (!m) return null;
      const result = Number(answer.trim());
      if (!Number.isFinite(result)) return null;
      return valid({ kind: "number-chips", values: [num(m[1]), num(m[3]), result] });
    }

    case "bt-dec-mult-pow10": {
      const m = DEC_POW10.exec(text);
      if (!m) return null;
      const result = Number(answer.trim());
      if (!Number.isFinite(result)) return null;
      return valid({ kind: "number-chips", values: [num(m[1]), num(m[2]), result] });
    }

    /* ---------- measurement & geometry ---------- */
    case "md-area": {
      const m = RECT_SIDES.exec(text);
      if (!m) return null;
      const length = num(m[1]);
      const width = num(m[2]);
      return valid({ kind: "area-model", rows: length, cols: width, label: `${length} cm × ${width} cm` });
    }

    case "md-perimeter": {
      const m = RECT_SIDES.exec(text);
      if (!m) return null;
      const length = num(m[1]);
      const width = num(m[2]);
      return valid({
        kind: "polygon",
        sides: 4,
        equalSides: length === width,
        label: `${length} cm long, ${width} cm wide`,
      });
    }

    case "geo-composite-shapes": {
      const m = /made from a (\d+) m by (\d+) m rectangle with a (\d+) m by (\d+) m corner piece removed/.exec(text);
      if (!m) return null;
      const [width, height, cutW, cutH] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])];
      return valid({
        kind: "area-model",
        rows: height,
        cols: width,
        label: `L-shape: a ${width} m by ${height} m rectangle with a ${cutW} m by ${cutH} m corner removed`,
      });
    }

    case "md-volume": {
      const m = /box is (\d+) cm long, (\d+) cm wide, and (\d+) cm tall/.exec(text);
      if (!m) return null;
      return valid({
        kind: "unit-cubes",
        length: num(m[1]),
        width: num(m[2]),
        height: num(m[3]),
      });
    }

    case "md-time": {
      const m = /starts at (\d{1,2}):(\d{2}) (?:AM|PM) and ends at/.exec(text);
      if (!m) return null;
      return valid({ kind: "clock", hour: num(m[1]), minute: num(m[2]) });
    }

    case "geo-angles-types": {
      const m = /An angle measures (\d+) degrees/.exec(text);
      if (!m) return null;
      return valid({ kind: "angle", degrees: num(m[1]) });
    }

    case "geo-triangles": {
      const sides = TRIANGLE_SIDES.exec(text);
      if (sides) {
        const [a, b, c] = [num(sides[1]), num(sides[2]), num(sides[3])];
        return valid({
          kind: "polygon",
          sides: 3,
          equalSides: a === b && b === c,
          label: `sides ${a} cm, ${b} cm, ${c} cm`,
        });
      }
      const angles = TRIANGLE_ANGLES.exec(text);
      if (!angles) return null;
      const [x, y, z] = [num(angles[1]), num(angles[2]), num(angles[3])];
      return valid({
        kind: "polygon",
        sides: 3,
        equalSides: x === y && y === z,
        label: `angles ${x}°, ${y}°, ${z}°`,
      });
    }

    case "geo-symmetry": {
      const m = /How many lines of symmetry does (?:a|an) (.+?) have\?/.exec(text);
      if (!m) return null;
      let sides: number | null = null;
      for (const [shape, count] of Object.entries(SYMMETRY_SIDES)) {
        if (m[1].includes(shape)) {
          sides = count;
          break;
        }
      }
      const axes = Number(answer.trim());
      if (sides === null || !Number.isInteger(axes) || axes < 0) return null;
      return valid({ kind: "symmetry", sides, axes });
    }

    case "geo-coord-plane": {
      const m = /Point A is (\d+) units to the right and (\d+) units up/.exec(text);
      if (!m) return null;
      const x = num(m[1]);
      const y = num(m[2]);
      return valid({
        kind: "coordinate-grid",
        points: [{ x, y }],
        max: Math.max(x, y, 5) + 1,
      });
    }

    case "oa-multistep-word": {
      return valid(wordProblemVisual(text));
    }

    default:
      return null;
  }
}

/** Two-step word problems: picture the multiplicative step, else the compare step. */
function wordProblemVisual(text: string): VisualModel | null {
  const bags = /Each bag gets (\d+) stickers and (\d+) candies\. .+ makes (\d+) bags\./.exec(text);
  if (bags) {
    const [a, b, c] = [num(bags[1]), num(bags[2]), num(bags[3])];
    return { kind: "area-model", rows: c, cols: a + b, label: `${c} bags of ${a} + ${b} items` };
  }
  const muffins = /boxes with (\d+) muffins each\. .+ buys (\d+) boxes plus (\d+) extra muffins\./.exec(text);
  if (muffins) {
    const [a, b, c] = [num(muffins[1]), num(muffins[2]), num(muffins[3])];
    return { kind: "area-model", rows: b, cols: a, label: `${b} boxes of ${a} muffins, plus ${c} extra` };
  }
  const money = /has \$(\d+)\. .+ buys (\d+) books for \$(\d+) each\./.exec(text);
  if (money) {
    const [a, c, b] = [num(money[1]), num(money[2]), num(money[3])];
    return { kind: "area-model", rows: c, cols: b, label: `${c} books at $${b} each, from $${a}` };
  }
  const shells = /collects (\d+) shells on Saturday and (\d+) shells on Sunday, then shares all (\d+) shells equally among (\d+) friends\./.exec(text);
  if (shells) {
    const [a, b, total] = [num(shells[1]), num(shells[2]), num(shells[3])];
    return {
      kind: "bar-graph",
      values: [a, b],
      label: `shells collected: ${a} + ${b} = ${total}`,
      unit: "shells",
    };
  }
  const cookies = /makes (\d+) cookies, sells (\d+), then packs the rest into boxes of (\d+)\./.exec(text);
  if (cookies) {
    const [made, sold] = [num(cookies[1]), num(cookies[2])];
    return { kind: "bar-graph", values: [made, sold], label: `cookies made and sold`, unit: "cookies" };
  }
  const plants = /garden has (\d+) rows with (\d+) plants each\. (\d+) plants are moved elsewhere\./.exec(text);
  if (plants) {
    const [rows, perRow, moved] = [num(plants[1]), num(plants[2]), num(plants[3])];
    return { kind: "area-model", rows, cols: perRow, label: `${rows} rows of ${perRow} plants, ${moved} moved` };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Accessible description
 * ------------------------------------------------------------------ */

/** Precise, kid-readable sentence describing the maths in a model. */
export function describeVisual(model: VisualModel): string {
  switch (model.kind) {
    case "fraction-bar": {
      const more = model.numerator > model.denominator ? ", which is more than one whole" : "";
      const second = model.compare
        ? `; a second bar is cut into ${model.compare.denominator} equal parts with ${model.compare.numerator} shaded`
        : "";
      return `A bar cut into ${model.denominator} equal parts with ${model.numerator} shaded${more}${second}.`;
    }
    case "number-line": {
      const marks = model.marks.map(fmtNum).join(" and ");
      const caption = model.label ? ` (${model.label})` : "";
      const noun = model.marks.length === 1 ? "a mark at" : "marks at";
      return `A number line from ${fmtNum(model.min)} to ${fmtNum(model.max)} with ${noun} ${marks}${caption}.`;
    }
    case "area-model": {
      const caption = model.label ? `: ${model.label}` : "";
      return `A grid of ${model.rows} rows and ${model.cols} columns${caption}, showing ${model.rows * model.cols} small squares in all.`;
    }
    case "place-value": {
      if (model.highlight === undefined) {
        return `A place-value table for the number ${model.digits}.`;
      }
      const digit = model.digits[model.highlight] ?? "?";
      const place = placeNameAt(model.digits, model.highlight);
      const unit = placeUnitAt(model.digits, model.highlight);
      const worth = place && unit ? ` — the ${place} place, so ${digit} × ${unit}` : "";
      return `A place-value table for ${model.digits} with the digit ${digit} called out${worth}.`;
    }
    case "coordinate-grid": {
      const where = model.points.map((p) => `(${fmtNum(p.x)}, ${fmtNum(p.y)})`).join(" and ");
      return `A coordinate grid reaching ${fmtNum(model.max)} on both axes with a point at ${where}.`;
    }
    case "angle": {
      const type = model.degrees === 90 ? "right" : model.degrees < 90 ? "acute" : "obtuse";
      return `An angle of ${fmtNum(model.degrees)} degrees, which is ${type === "right" ? "a" : "an"} ${type} angle.`;
    }
    case "unit-cubes": {
      const volume = model.length * model.width * model.height;
      return `A box ${model.length} cubes long, ${model.width} wide, and ${model.height} tall, holding ${volume} unit cubes in all.`;
    }
    case "clock": {
      return `An analog clock showing ${model.hour}:${String(model.minute).padStart(2, "0")}.`;
    }
    case "polygon": {
      const shape = model.equalSides === false ? `${model.sides}-sided shape with sides of different lengths` : `regular ${model.sides}-sided shape`;
      return model.label ? `A ${shape}: ${model.label}.` : `A ${shape}.`;
    }
    case "symmetry": {
      const lines = model.axes === 1 ? "line" : "lines";
      return `A ${model.sides}-sided shape with ${model.axes} dashed ${lines} of symmetry drawn through it.`;
    }
    case "bar-graph": {
      const bars = model.values.map(fmtNum).join(" and ");
      const unit = model.unit ? ` (${model.unit})` : "";
      return `A bar graph titled "${model.label}"${unit} with bars of ${bars}.`;
    }
    case "number-chips": {
      return `A row of number chips: ${model.values.map(fmtNum).join(", ")}.`;
    }
  }
}
