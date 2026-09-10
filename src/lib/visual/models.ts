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
 * Quadrilateral classifications the generator asks for, keyed by the answer it
 * expects. `equalSides` drives the drawing; the label carries the definition the
 * frozen `polygon` kind cannot express visually.
 */
const QUADRILATERALS: Record<string, { equalSides: boolean; label: string }> = {
  square: { equalSides: true, label: "a square: 4 right angles and 4 equal sides" },
  rectangle: { equalSides: false, label: "a rectangle: 4 right angles with opposite sides equal" },
  rhombus: { equalSides: true, label: "a rhombus: 4 equal sides with parallel opposite sides" },
  parallelogram: { equalSides: false, label: "a parallelogram: both pairs of opposite sides parallel and equal" },
  trapezoid: { equalSides: false, label: "a trapezoid: exactly one pair of parallel sides" },
};

/** Side facts behind the quadrilateral hierarchy questions. */
const QUADRILATERAL_PROPERTIES: Record<string, { equalSides: boolean; sides: string }> = {
  square: { equalSides: true, sides: "4 right angles and 4 equal sides" },
  rectangle: { equalSides: false, sides: "4 right angles and opposite sides equal" },
  rhombus: { equalSides: true, sides: "4 equal sides and parallel opposite sides" },
  parallelogram: { equalSides: false, sides: "two pairs of parallel sides" },
  trapezoid: { equalSides: false, sides: "exactly one pair of parallel sides" },
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

    /* ---------- extra operations (sibling generator set) ---------- */
    case "oa-div-facts": {
      const m = /What is ([\d,]+) ÷ (\d+)\?/.exec(text);
      if (!m) return null;
      const n = num(m[1]);
      const divisor = num(m[2]);
      const quotient = num(answer);
      if (!Number.isInteger(quotient) || quotient <= 0) return null;
      return valid({
        kind: "area-model",
        rows: divisor,
        cols: quotient,
        label: `${n} ÷ ${divisor}`,
      });
    }

    case "oa-mult-2digit-2digit": {
      const m = /What is ([\d,]+) × (\d+)\?/.exec(text);
      if (!m) return null;
      const a = num(m[1]);
      const b = num(m[2]);
      const tens = Math.floor(b / 10) * 10;
      const ones = b % 10;
      if (ones === 0) return valid({ kind: "bar-graph", values: [a * b], label: `${fmtNum(a)} × ${b}` });
      return valid({
        kind: "bar-graph",
        values: [a * tens, a * ones],
        label: `${fmtNum(a)} × ${b} split into ${fmtNum(tens)} + ${ones}`,
      });
    }

    case "oa-factor-pairs": {
      const m = /The number ([\d,]+) can be written as (\d+) × \?/.exec(text);
      if (!m) return null;
      const n = num(m[1]);
      const known = num(m[2]);
      const missing = num(answer);
      if (!Number.isInteger(missing) || missing <= 0) return null;
      return valid({
        kind: "area-model",
        rows: known,
        cols: missing,
        label: `${n} = ${known} × ${missing}`,
      });
    }

    case "oa-multiples-prime": {
      const m = /Is ([\d,]+) prime or composite\?/.exec(text);
      if (!m) return null;
      const n = num(m[1]);
      if (!Number.isInteger(n) || n < 2) return null;
      const proper: number[] = [];
      for (let factor = 2; factor * factor <= n; factor++) {
        if (n % factor !== 0) continue;
        proper.push(factor);
        if (factor !== n / factor) proper.push(n / factor);
      }
      proper.sort((a, b) => a - b);
      // A prime shows exactly two factors; a composite shows more, capped so the
      // chip row stays readable.
      return valid({ kind: "number-chips", values: [1, ...proper.slice(0, 4), n] });
    }

    case "oa-patterns": {
      const m = /next number in this pattern\? ([\d, ]+), \?/.exec(text);
      if (!m) return null;
      const terms = m[1].split(",").map((part) => Number(part.trim()));
      const next = num(answer);
      if (terms.length < 2 || terms.some((term) => !Number.isFinite(term)) || !Number.isFinite(next)) {
        return null;
      }
      return valid({
        kind: "number-line",
        min: Math.min(...terms),
        max: Math.max(next, ...terms),
        marks: terms,
      });
    }

    case "oa-remainders": {
      const packed = /^([\d,]+) .+ are packed into .+ holds no more than (\d+) /.exec(text);
      const shared = /^([\d,]+) .+ are shared equally among (\d+) friends\./.exec(text);
      const match = packed ?? shared;
      if (!match) return null;
      const total = num(match[1]);
      const group = num(match[2]);
      if (group <= 0) return null;
      const quotient = Math.floor(total / group);
      const remainder = total % group;
      return valid({
        kind: "bar-graph",
        values: [quotient, remainder],
        label: `${fmtNum(total)} put into groups of ${group}: ${quotient} full groups, ${remainder} left over`,
      });
    }

    case "oa-multistep-frac": {
      const m = /A recipe uses (\d+)\/(\d+) cup of sugar for each batch\. .+ makes (\d+) batches, starting with ([\d,]+) cups? of sugar\./.exec(text);
      if (!m) return null;
      const [a, d, batches] = [num(m[1]), num(m[2]), num(m[3])];
      if (d <= 0) return null;
      return valid({
        kind: "fraction-bar",
        numerator: a * batches,
        denominator: d,
        compare: { numerator: a, denominator: d },
      });
    }

    case "oa-expressions": {
      const quoted = /Write the expression for "(.+?)" and evaluate it/.exec(text);
      if (!quoted) return null;
      const operands = (quoted[1].match(/\d+/g) ?? []).map(Number);
      const value = num(answer);
      if (operands.length === 0 || !Number.isFinite(value)) return null;
      return valid({ kind: "number-chips", values: [...operands, value] });
    }

    case "bt-add-sub-word": {
      const added = /collected ([\d,]+) .+ and ([\d,]+) this year/.exec(text);
      if (added) {
        const a = num(added[1]);
        const b = num(added[2]);
        return valid({
          kind: "number-line",
          min: 0,
          max: a + b,
          marks: [a, a + b],
          label: `${fmtNum(a)} + ${fmtNum(b)}`,
        });
      }
      const taken = /has ([\d,]+) .+ and gives away ([\d,]+)\./.exec(text);
      if (!taken) return null;
      const a = num(taken[1]);
      const b = num(taken[2]);
      return valid({
        kind: "number-line",
        min: 0,
        max: a,
        marks: [a - b, a],
        label: `${fmtNum(a)} − ${fmtNum(b)}`,
      });
    }

    case "bt-multiply-10s": {
      const m = /What is ([\d,]+) × (\d+)\?/.exec(text);
      if (!m) return null;
      const value = num(answer);
      if (!Number.isFinite(value)) return null;
      return valid({ kind: "number-chips", values: [num(m[1]), num(m[2]), value] });
    }

    case "bt-estimate": {
      const both = /Estimate ([\d,]+) ([+×]) ([\d,]+) by rounding each number to the nearest (ten|hundred|thousand)\./.exec(text);
      const mixed = /Estimate ([\d,]+) × ([\d,]+) by rounding ([\d,]+) to the nearest (ten|hundred|thousand) and ([\d,]+) to the nearest (ten|hundred|thousand)\./.exec(text);
      const estimate = num(answer);
      if (!Number.isFinite(estimate)) return null;
      if (both) {
        const place = ROUND_FACTOR[both[4]];
        const a = num(both[1]);
        const b = num(both[3]);
        return valid({
          kind: "number-chips",
          values: [a, Math.round(a / place) * place, b, Math.round(b / place) * place, estimate],
        });
      }
      if (!mixed) return null;
      const a = num(mixed[1]);
      const b = num(mixed[2]);
      const placeA = ROUND_FACTOR[mixed[4]];
      const placeB = ROUND_FACTOR[mixed[6]];
      return valid({
        kind: "number-chips",
        values: [a, Math.round(a / placeA) * placeA, b, Math.round(b / placeB) * placeB, estimate],
      });
    }

    case "bt-compare-order": {
      const m = /Compare: ([\d,]+) \? ([\d,]+)\./.exec(text);
      if (!m) return null;
      const a = num(m[1]);
      const b = num(m[2]);
      const marks = Array.from(new Set([a, b])).sort((x, y) => x - y);
      return valid({
        kind: "number-line",
        min: 0,
        max: Math.max(a, b),
        marks,
        label: `compare ${fmtNum(a)} with ${fmtNum(b)}`,
      });
    }

    case "bt-expanded-form": {
      const write = /Write ([\d,]+) in expanded form/.exec(text);
      const rebuild = /What number is ([\d,]+(?: \+ [\d,]+)+)\?/.exec(text);
      const digits = (write ? write[1] : rebuild ? String(num(answer)) : "").replace(/,/g, "");
      if (digits.length === 0 || !/^\d+$/.test(digits)) return null;
      return valid({ kind: "place-value", digits, highlight: 0 });
    }

    case "fr-add-unlike-10-100": {
      const m = ADD_UNLIKE.exec(text);
      if (!m) return null;
      const [a, d1, b, d2] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])];
      if (d1 <= 0 || d2 % d1 !== 0) return null;
      return valid({
        kind: "fraction-bar",
        numerator: a * (d2 / d1) + b,
        denominator: d2,
        compare: { numerator: a, denominator: d1 },
      });
    }

    case "fr-mult-fraction-whole": {
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

    case "fr-fraction-word": {
      const pairs = Array.from(text.matchAll(/(\d+)\/(\d+)/g));
      if (pairs.length < 2) return null;
      const [a, d, b, d2] = [num(pairs[0][1]), num(pairs[0][2]), num(pairs[1][1]), num(pairs[1][2])];
      if (d !== d2) return null;
      const numerator = /cut off|eaten/.test(text) ? a - b : a + b;
      if (numerator <= 0) return null;
      return valid({ kind: "fraction-bar", numerator, denominator: d, compare: { numerator: a, denominator: d } });
    }

    case "md-length-convert": {
      const m = /How many ([\w\s]+?) are in ([\d,]+) (\w+)\?/.exec(text);
      if (!m) return null;
      const converted = num(answer);
      if (!Number.isFinite(converted)) return null;
      const to = m[1].trim();
      return valid({
        kind: "bar-graph",
        values: [converted],
        label: `${fmtNum(num(m[2]))} ${m[3]} in ${to}`,
        unit: to,
      });
    }

    case "md-mass-capacity": {
      const combined = /^([\d,]+) (\w+) and ([\d,]+) (\w+) is how many ([\w\s]+?) in all\?/.exec(text);
      if (combined) {
        const converted = num(answer);
        if (!Number.isFinite(converted)) return null;
        const to = combined[5].trim();
        return valid({
          kind: "bar-graph",
          values: [converted],
          label: `${fmtNum(num(combined[1]))} ${combined[2]} plus ${fmtNum(num(combined[3]))} ${combined[4]}, in ${to}`,
          unit: to,
        });
      }
      const m = /How many ([\w\s]+?) are in ([\d,]+) (\w+)\?/.exec(text);
      if (!m) return null;
      const converted = num(answer);
      if (!Number.isFinite(converted)) return null;
      const to = m[1].trim();
      return valid({
        kind: "bar-graph",
        values: [converted],
        label: `${fmtNum(num(m[2]))} ${m[3]} in ${to}`,
        unit: to,
      });
    }

    case "md-money": {
      const m = /buys (\d+) .+ for \$([\d.]+) each/.exec(text);
      if (!m) return null;
      const quantity = num(m[1]);
      const price = num(m[2]);
      const spent = price * quantity;
      const paid = /pays with \$([\d.]+)\./.exec(text);
      const answerValue = num(answer);
      if (!Number.isFinite(answerValue)) return null;
      if (paid) {
        const bill = num(paid[1]);
        return valid({
          kind: "bar-graph",
          values: [spent, answerValue],
          label: `${quantity} at $${price.toFixed(2)} from $${bill.toFixed(2)}`,
          unit: "dollars",
        });
      }
      return valid({
        kind: "bar-graph",
        values: [price, answerValue],
        label: `${quantity} items at $${price.toFixed(2)} each`,
        unit: "dollars",
      });
    }

    case "md-line-plots": {
      const m = /A line plot of (.+?) shows: (.+?)\. /.exec(text);
      if (!m) return null;
      const counts = Array.from(m[2].matchAll(/(\d+) at /g)).map((pair) => num(pair[1]));
      if (counts.length === 0) return null;
      return valid({
        kind: "bar-graph",
        values: counts,
        label: `${m[1]}: ${m[2]}`,
      });
    }

    case "md-angles": {
      const split = /A (\d+)° angle is split into two parts\. One part measures (\d+)°\./.exec(text);
      const composed = /An angle is split into (\d+) parts measuring ([\d° +]+)\./.exec(text);
      const numericAnswer = num(answer);
      if (split) {
        const whole = num(split[1]);
        const part = num(split[2]);
        if (whole <= 180) return valid({ kind: "angle", degrees: whole });
        return valid({ kind: "number-chips", values: [whole, part, numericAnswer] });
      }
      if (!composed) return null;
      const parts = (composed[2].match(/\d+/g) ?? []).map(Number);
      if (parts.length === 0) return null;
      if (numericAnswer <= 180) return valid({ kind: "angle", degrees: numericAnswer });
      return valid({ kind: "number-chips", values: [...parts, numericAnswer] });
    }

    case "md-area-perimeter-word": {
      const m = /A rectangular \w+ is ([\d,]+) meters long and ([\d,]+) meters wide\./.exec(text);
      if (!m) return null;
      const length = num(m[1]);
      const width = num(m[2]);
      if (/What is its area/.test(text)) {
        return valid({
          kind: "area-model",
          rows: length,
          cols: width,
          label: `${length} m × ${width} m`,
        });
      }
      return valid({
        kind: "polygon",
        sides: 4,
        equalSides: length === width,
        label: `${length} m long, ${width} m wide`,
      });
    }

    case "geo-points-lines": {
      if (/named location with no length, width, or size/.test(text)) {
        return valid({ kind: "number-line", min: 0, max: 10, marks: [5], label: "a point marks one exact location" });
      }
      if (/goes on forever in both directions/.test(text)) {
        return valid({ kind: "number-line", min: 0, max: 10, marks: [], label: "a line goes on forever in both directions" });
      }
      if (/two endpoints that you can measure/.test(text)) {
        return valid({ kind: "number-line", min: 0, max: 10, marks: [2, 8], label: "a line segment has two endpoints" });
      }
      if (/starts at one endpoint and goes on forever in one direction/.test(text)) {
        return valid({ kind: "number-line", min: 0, max: 10, marks: [2], label: "a ray starts at one endpoint and goes one way" });
      }
      if (/never meet and stay the same distance apart/.test(text)) {
        return valid({
          kind: "polygon",
          sides: 4,
          equalSides: false,
          label: "parallel lines never meet — the opposite sides of this rectangle are parallel",
        });
      }
      if (/meet and form four right angles/.test(text)) {
        return valid({
          kind: "polygon",
          sides: 4,
          equalSides: true,
          label: "perpendicular lines meet at a right angle",
        });
      }
      return null;
    }

    case "geo-quadrilaterals": {
      const shape = QUADRILATERALS[answer.trim().toLowerCase()];
      if (!shape) return null;
      return valid({ kind: "polygon", sides: 4, equalSides: shape.equalSides, label: shape.label });
    }

    case "geo-coordinate-intro": {
      const move = /Point A is at \((\d+), (\d+)\) on the grid\. You move (\d+) units right and (\d+) units up/.exec(text);
      if (move) {
        const start = { x: num(move[1]), y: num(move[2]) };
        const end = { x: start.x + num(move[3]), y: start.y + num(move[4]) };
        return valid({
          kind: "coordinate-grid",
          points: [start, end],
          max: Math.max(start.x, start.y, end.x, end.y, 5) + 1,
        });
      }
      const origin = /Point A is (\d+) units to the right and (\d+) units up/.exec(text);
      if (!origin) return null;
      const x = num(origin[1]);
      const y = num(origin[2]);
      return valid({
        kind: "coordinate-grid",
        points: [{ x, y }],
        max: Math.max(x, y, 5) + 1,
      });
    }

    case "geo-quad-hierarchy": {
      const m = /Is every (\w+) a (\w+)\?/.exec(text);
      if (!m) return null;
      const subject = m[1].toLowerCase();
      const properties = QUADRILATERAL_PROPERTIES[subject];
      if (!properties) return null;
      return valid({
        kind: "polygon",
        sides: 4,
        equalSides: properties.equalSides,
        label: `every ${subject} has ${properties.sides} — is every ${subject} a ${m[2]}?`,
      });
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
      const noun =
        model.marks.length === 0
          ? "no marked points"
          : model.marks.length === 1
            ? `a mark at ${marks}`
            : `marks at ${marks}`;
      return `A number line from ${fmtNum(model.min)} to ${fmtNum(model.max)} with ${noun}${caption}.`;
    }
    case "area-model": {
      const caption = model.label ? ` — ${model.label}` : "";
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
      const shape =
        model.equalSides === false
          ? `${model.sides}-sided shape with sides of different lengths`
          : `regular ${model.sides}-sided shape`;
      const sentence = model.label ? `A ${shape} — ${model.label}` : `A ${shape}`;
      return /[.?!]$/.test(sentence) ? sentence : `${sentence}.`;
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
