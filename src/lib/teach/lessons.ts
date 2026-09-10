import { ALL_SKILLS, generateProblem } from "../math/generators";
import { DEFAULT_LEVEL, type Problem } from "../math/types";
import type { VisualModel } from "@/lib/visual";

/** Piece types lifted from the union so this file needs no extra exports. */
type FractionCompare = NonNullable<Extract<VisualModel, { kind: "fraction-bar" }>["compare"]>;
type GridPoint = Extract<VisualModel, { kind: "coordinate-grid" }>["points"][number];

/**
 * A teachable step.
 *
 * `visual` is a real drawable model from `src/lib/visual` (rendered by
 * `VisualModelView`), or `null` when the words carry the step on their own.
 * `workedNumbers` stays as the drift guard: every step must be grounded in the
 * numbers of the problem the student actually failed.
 */
export interface LessonStep {
  title: string;
  body: string;
  visual: VisualModel | null;
  /** Numbers from the ACTUAL failed problem used in this step. */
  workedNumbers: number[];
}

export interface Lesson {
  skill: string;
  title: string;
  problemText: string;
  steps: LessonStep[];
  /** A FRESH problem of the same skill — never the one just failed. */
  checkProblem: Problem;
}

/** Thousands-separated display; matches generator fmt. */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** All plain numbers (ints + decimals) in a string, commas tolerated. */
function allNumbers(text: string): number[] {
  const m = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g);
  return m ? m.map(Number) : [];
}

function expandedForm(n: number): string {
  const digits = String(Math.abs(Math.trunc(n)));
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[i]);
    if (d === 0) continue;
    parts.push(fmt(d * 10 ** (digits.length - 1 - i)));
  }
  return parts.length ? parts.join(" + ") : "0";
}

/** First divisor > 1 of `n`, or `n` itself when prime. */
function firstDivisor(n: number): number {
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return d;
  }
  return n;
}

/** "3/4" -> 0.75, "1" -> 1, anything else -> 0. */
function fractionValue(raw: string): number {
  const m = /^(\d+)\/(\d+)$/.exec(raw.trim());
  if (!m) return Number(raw) || 0;
  const den = Number(m[2]);
  return den > 0 ? Number(m[1]) / den : 0;
}

/** Sides of the shapes the symmetry generator names. */
function shapeSides(shape: string): number {
  const key = shape.toLowerCase();
  if (key.includes("hexagon")) return 6;
  if (key.includes("pentagon")) return 5;
  if (key.includes("triangle")) return 3;
  if (key.includes("kite") || key.includes("rhombus") || key.includes("rectangle") || key.includes("square")) return 4;
  return 4;
}

/* ---------- visual model factories ---------- *
 * Optional keys are attached only when set so a built lesson survives
 * JSON round-trips unchanged, and non-finite numbers are floored away so a
 * malformed prompt can never hand the renderer a NaN.
 */

function whole(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(fallback, Math.round(value)) : fallback;
}

function chips(values: number[]): VisualModel {
  const safe = values.filter((value) => Number.isFinite(value));
  return { kind: "number-chips", values: safe.length > 0 ? safe : [0] };
}

function numberLine(min: number, max: number, marks: number[], label?: string): VisualModel {
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) && max > lo ? max : lo + 1;
  const clean = marks.filter((mark) => Number.isFinite(mark));
  return { kind: "number-line", min: lo, max: hi, marks: clean, ...(label === undefined ? {} : { label }) };
}

function fractionBar(numerator: number, denominator: number, compare?: FractionCompare): VisualModel {
  return {
    kind: "fraction-bar",
    numerator: Number.isFinite(numerator) ? numerator : 0,
    denominator: whole(denominator, 1),
    ...(compare === undefined ? {} : { compare }),
  };
}

function areaModel(rows: number, cols: number, label?: string): VisualModel {
  return {
    kind: "area-model",
    rows: whole(rows, 1),
    cols: whole(cols, 1),
    ...(label === undefined ? {} : { label }),
  };
}

function placeValueModel(digits: string, highlight?: number): VisualModel {
  return { kind: "place-value", digits, ...(highlight === undefined ? {} : { highlight }) };
}

function coordinateModel(points: GridPoint[], max: number): VisualModel {
  return { kind: "coordinate-grid", points, max: whole(max, 1) };
}

function angleModel(degrees: number): VisualModel {
  const deg = Number.isFinite(degrees) ? Math.min(Math.max(degrees, 0), 360) : 0;
  return { kind: "angle", degrees: deg };
}

function cubesModel(length: number, width: number, height: number): VisualModel {
  return { kind: "unit-cubes", length: whole(length, 1), width: whole(width, 1), height: whole(height, 1) };
}

function polygonModel(sides: number, equalSides?: boolean, label?: string): VisualModel {
  return {
    kind: "polygon",
    sides: Math.min(Math.max(whole(sides, 3), 3), 12),
    ...(equalSides === undefined ? {} : { equalSides }),
    ...(label === undefined ? {} : { label }),
  };
}

function symmetryModel(sides: number, axes: number): VisualModel {
  return { kind: "symmetry", sides: Math.min(Math.max(whole(sides, 3), 3), 12), axes: whole(axes, 0) };
}

function barGraph(values: number[], label: string, unit?: string): VisualModel {
  const safe = values.filter((value) => Number.isFinite(value));
  return {
    kind: "bar-graph",
    values: safe.length > 0 ? safe : [0],
    label,
    ...(unit === undefined ? {} : { unit }),
  };
}

/** The clock shown by a label like "9:45 AM". */
function clockFromLabel(label: string): VisualModel {
  const m = /(\d+):(\d+)\s*(AM|PM)?/.exec(label);
  if (!m) return { kind: "clock", hour: 12, minute: 0 };
  const hour12 = Number(m[1]) % 12;
  const hour = m[3] === "PM" ? (hour12 === 0 ? 12 : hour12 + 12) : hour12;
  return { kind: "clock", hour, minute: Number(m[2]) };
}

/* ---------- step helpers ---------- */

/**
 * The final step hands over to the fresh check problem. Its text is NOT
 * repeated here — TeachView renders `lesson.checkProblem.text` in the answer
 * card, and the body simply sets up the transfer.
 */
function tryItStep(problem: Problem, nums: number[]): LessonStep {
  return {
    title: "Your turn — try it",
    body: `Try it yourself: a brand-new problem of the same kind is waiting below. Use the method you just practised — your answer goes in the box.`,
    visual: null,
    workedNumbers: nums.length ? nums : allNumbers(problem.text + " " + problem.answer),
  };
}

function step(
  title: string,
  body: string,
  visual: VisualModel | null,
  workedNumbers: number[],
): LessonStep {
  return { title, body, visual, workedNumbers };
}

/* ---------- per-skill builders (all deterministic, all from failed numbers) ---------- */

function lessonAdd(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/(\d+)\s*\+\s*(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const b = m ? Number(m[2]) : (nums[1] ?? 0);
  const ao = a % 10;
  const bo = b % 10;
  return [
    step(
      "Split each number by place",
      `Your numbers are ${fmt(a)} and ${fmt(b)}. Write them big: ${fmt(a)} = ${expandedForm(a)}, and ${fmt(b)} = ${expandedForm(b)}. Big numbers are just small piles added together.`,
      chips([a, b]),
      [a, b],
    ),
    step(
      "Add each place, right to left",
      `Start with the ones: ${ao} + ${bo} = ${ao + bo}. Then add the tens, then the hundreds. One small column at a time — never the whole number at once.`,
      placeValueModel(String(a)),
      [a, b, ao + bo],
    ),
    step(
      "Regroup when a column hits 10",
      `Whenever a column makes 10 or more, carry 1 to the next column. For ${fmt(a)} + ${fmt(b)}, keep moving left and carrying until every column is done.`,
      numberLine(0, a + b, [a], `${fmt(a)} + ${fmt(b)}`),
      [a, b],
    ),
    tryItStep(p, [a, b]),
  ];
}

function lessonSub(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/(\d+)\s*-\s*(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const b = m ? Number(m[2]) : (nums[1] ?? 0);
  const ao = a % 10;
  const bo = b % 10;
  const needBorrow = ao < bo;
  return [
    step(
      "Line them up, big on top",
      `Your numbers are ${fmt(a)} on top and ${fmt(b)} below. Line up ones under ones, tens under tens. We always start from the ones on the right.`,
      placeValueModel(String(a)),
      [a, b],
    ),
    step(
      "Start with the ones column",
      `Ones: ${ao} − ${bo}. ${needBorrow ? `The top (${ao}) is smaller, so borrow 1 ten from ${fmt(a)} first — then subtract.` : `The top (${ao}) is big enough, so just subtract.`}`,
      chips([a, b]),
      [a, b],
    ),
    step(
      "Work left, borrowing as needed",
      `Move one column left and repeat for ${fmt(a)} − ${fmt(b)}: whenever the top digit is smaller, borrow 1 from the next column, then subtract.`,
      numberLine(0, a, [b, a], `${fmt(a)} − ${fmt(b)}`),
      [a, b],
    ),
    tryItStep(p, [a, b]),
  ];
}

function lessonMultFacts(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\s*×\s*(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const b = m ? Number(m[2]) : (nums[1] ?? 0);
  return [
    step(
      "See it as groups",
      `${a} × ${b} means ${a} groups of ${b}. Picture ${a} plates with ${b} cookies on each — how many cookies is that?`,
      areaModel(a, b, `${a} groups of ${b}`),
      [a, b],
    ),
    step(
      "Use a helper fact",
      `Do ${a} × ${b - 1} = ${a * (b - 1)} first (one less group), then add one more group of ${a}. Facts you know build facts you don't.`,
      areaModel(a, b - 1, `${a} × ${b - 1}, then one more group`),
      [a, b, a * (b - 1)],
    ),
    tryItStep(p, [a, b]),
  ];
}

function lessonMultDigit(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/([\d.]+)\s*×\s*([\d.]+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const b = m ? Number(m[2]) : (nums[1] ?? 0);
  const base = a - (a % 100);
  const rest = a % 100;
  const single = rest === 0 || base === 0;
  const lone = base === 0 ? rest : base;
  return [
    step(
      `Break apart ${fmt(a)}`,
      single
        ? `${fmt(a)} splits into one usable pile here, so there is nothing to break off. The job is a single multiplication.`
        : `${fmt(a)} = ${fmt(base)} + ${rest}. Multiplying one big number is hard — multiplying two small piles is easy.`,
      chips(single ? [a, lone] : [a, base, rest]),
      [a, b, base, rest],
    ),
    step(
      single ? "Multiply the only pile" : "Multiply each part",
      single
        ? `Work out ${b} × ${fmt(lone)}. Keep the whole number together — this single partial product is the whole job.`
        : `First pile: ${b} × ${fmt(base)} = ${fmt(b * base)}. Second pile: ${b} × ${rest} = ${fmt(b * rest)}. Write both partial products down.`,
      barGraph(single ? [b * lone] : [b * base, b * rest], `${b} × ${fmt(lone)}`),
      [a, b, b * base, b * rest],
    ),
    step(
      single ? "No piles to add" : "Add the piles",
      single
        ? `There is no second partial product here, so the one product stands on its own — no column addition needed.`
        : `Add the two partial products — ${fmt(b * base)} and ${fmt(b * rest)} — lining them up by place value. The total of the two piles is the whole product.`,
      chips(single ? [b * lone] : [b * base, b * rest]),
      [a, b, b * base, b * rest],
    ),
    tryItStep(p, [a, b]),
  ];
}

function lessonDivFacts(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/(\d+)\s*÷\s*(\d+)/);
  const nums = allNumbers(p.text);
  const n = m ? Number(m[1]) : (nums[0] ?? 0);
  const d = m ? Number(m[2]) : (nums[1] ?? 1);
  const jumps: number[] = [];
  for (let v = d; v <= n && jumps.length < 12; v += d) jumps.push(v);
  return [
    step(
      "Flip it into multiplication",
      `${n} ÷ ${d} asks: ${d} times WHAT equals ${n}? Division is just multiplication with a missing piece.`,
      chips([n, d]),
      [n, d],
    ),
    step(
      `Count up by ${d}`,
      `Skip-count: ${d}, ${2 * d}, ${3 * d} … until you land on ${n}. How many jumps did that take? That count is your answer.`,
      numberLine(0, n, jumps.length ? jumps : [d, n], `counting up by ${d}`),
      [n, d],
    ),
    tryItStep(p, [n, d]),
  ];
}

function lessonDivRemainder(p: Problem): LessonStep[] {
  const mt = p.text.replace(/,/g, "").match(/Divide\s+(\d+)\s+by\s+(\d+)/);
  const ma = p.answer.match(/(\d+)\s*R\s*(\d+)/);
  const nums = allNumbers(p.text);
  const n = mt ? Number(mt[1]) : (nums[0] ?? 0);
  const d = mt ? Number(mt[2]) : (nums[1] ?? 1);
  const q = ma ? Number(ma[1]) : Math.floor(n / d);
  const r = ma ? Number(ma[2]) : n % d;
  const big = d * q;
  return [
    step(
      "Find the biggest full multiple",
      `How many full groups of ${d} fit inside ${fmt(n)}? Build the biggest multiple of ${d} that stays below ${fmt(n)}: keep adding ${d} until one more would overshoot.`,
      numberLine(0, n, [big], `${fmt(n)} ÷ ${d}`),
      [n, d, big],
    ),
    step(
      "Subtract to find the leftover",
      `Take that biggest multiple away from ${fmt(n)}. Whatever is left is the remainder — the pieces that could not fill another whole group of ${d}.`,
      barGraph([big, r], `${fmt(big)} used in whole groups, plus the leftover`),
      [n, d, big, r],
    ),
    step(
      "Check: remainder must be smaller",
      `A remainder must always be less than the divisor: yours has to come out below ${d}. If it were ${d} or more, you could fill one more group.`,
      chips([n, d, r]),
      [n, d, r],
    ),
    tryItStep(p, [n, d]),
  ];
}

function lessonEquiv(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\/(\d+)\s*=\s*\?\/(\d+)/);
  const nums = allNumbers(p.text);
  const n = m ? Number(m[1]) : (nums[0] ?? 0);
  const d = m ? Number(m[2]) : (nums[1] ?? 1);
  const D = m ? Number(m[3]) : (nums[2] ?? d);
  const k = d > 0 ? D / d : 1;
  const scaled = Number.isInteger(k) ? n * k : undefined;
  return [
    step(
      "What changed on the bottom?",
      `Your fraction is ${n}/${d} and the new bottom is ${D}. The bottom was scaled up — find the number that multiplies ${d} to make ${D}.`,
      fractionBar(n, d),
      [n, d, D],
    ),
    step(
      "Do the exact same thing on top",
      `Equivalent fractions scale top and bottom equally. Whatever number multiplied the bottom (${d}) to reach ${D} must multiply the top (${n}) too — work out new bottom ÷ ${d} first.`,
      fractionBar(n, d, scaled === undefined ? undefined : { numerator: scaled, denominator: D }),
      [n, d, D],
    ),
    step(
      "Picture the slices",
      `Cutting each of the ${d} slices of ${n}/${d} into smaller equal pieces gives ${D} tiny slices — but it is still the same amount of pie. Same pie, more slices.`,
      fractionBar(n * (Number.isInteger(k) ? k : 1), D),
      [n, d, D],
    ),
    tryItStep(p, [n, d, D]),
  ];
}

function lessonAddLike(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\/(\d+)\s*\+\s*(\d+)\/(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const d = m ? Number(m[2]) : (nums[1] ?? 1);
  const b = m ? Number(m[3]) : (nums[2] ?? 0);
  return [
    step(
      "Same bottom? Keep it",
      `Your problem is ${a}/${d} + ${b}/${d}. Same denominator (${d}) means same-size slices — so the bottom stays ${d}. Never add the bottoms.`,
      fractionBar(a, d, { numerator: b, denominator: d }),
      [a, b, d],
    ),
    step(
      "Add only the tops",
      `Count the slices: ${a} slices plus ${b} slices. Add the top numbers (${a} + ${b}) and keep ${d} underneath.`,
      fractionBar(a, d, { numerator: b, denominator: d }),
      [a, b, d],
    ),
    step(
      "Simplify if you can",
      `Look at your new fraction's top and bottom. If they share a factor, divide both by it. If not, it is already finished.`,
      fractionBar(a + b, d),
      [a, b, d, a + b],
    ),
    tryItStep(p, [a, b, d]),
  ];
}

function lessonSubLike(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\/(\d+)\s*-\s*(\d+)\/(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const d = m ? Number(m[2]) : (nums[1] ?? 1);
  const b = m ? Number(m[3]) : (nums[2] ?? 0);
  return [
    step(
      "Same bottom? Keep it",
      `Your problem is ${a}/${d} − ${b}/${d}. Same denominator (${d}) means same-size slices — so the bottom stays ${d}.`,
      fractionBar(a, d, { numerator: b, denominator: d }),
      [a, b, d],
    ),
    step(
      "Subtract only the tops",
      `Take away ${b} slices from ${a} slices: subtract the top numbers (${a} − ${b}) and keep ${d} underneath.`,
      fractionBar(a, d, { numerator: b, denominator: d }),
      [a, b, d],
    ),
    step(
      "Simplify if you can",
      `Look at the top and bottom of your answer. If they share a factor, divide both by it. Otherwise it is done.`,
      fractionBar(Math.max(a - b, 0), d),
      [a, b, d, a - b],
    ),
    tryItStep(p, [a, b, d]),
  ];
}

function lessonCompareDecimals(p: Problem): LessonStep[] {
  const m = p.text.match(/([\d.]+)\s*or\s*([\d.]+)/);
  const nums = allNumbers(p.text);
  const x = m ? Number(m[1]) : (nums[0] ?? 0);
  const y = m ? Number(m[2]) : (nums[1] ?? 0);
  const xt = Math.floor(x * 10);
  const yt = Math.floor(y * 10);
  return [
    step(
      "Line up the decimal points",
      `Your numbers are ${x} and ${y}. Write them with the dots stacked — ones under ones, tenths under tenths. Lined-up dots make the real sizes visible.`,
      numberLine(Math.min(x, y), Math.max(x, y), [x, y]),
      [x, y],
    ),
    step(
      "Compare the tenths first",
      `Tenths: ${x} has ${xt}, ${y} has ${yt}. ${xt === yt ? "They tie — so the tenths round decides nothing and you must look further right." : `Bigger tenths digit wins right here, no matter what comes after.`}`,
      placeValueModel(String(x), String(x).indexOf(".") + 1),
      [x, y],
    ),
    step(
      "Break ties with the hundredths",
      `If the tenths tie, compare the hundredths column of ${x} and ${y}. The first column from the left that differs decides the whole number.`,
      placeValueModel(String(y), String(y).indexOf(".") + 1),
      [x, y],
    ),
    tryItStep(p, [x, y]),
  ];
}

function lessonArea(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\s*cm long and (\d+)\s*cm wide/);
  const nums = allNumbers(p.text);
  const l = m ? Number(m[1]) : (nums[0] ?? 0);
  const w = m ? Number(m[2]) : (nums[1] ?? 0);
  return [
    step(
      "Area counts squares",
      `Your rectangle is ${l} cm by ${w} cm. Area asks: how many 1-cm squares cover it? Each row holds ${l} squares.`,
      areaModel(l, w, `${l} cm by ${w} cm`),
      [l, w],
    ),
    step(
      "Stack the rows",
      `There are ${w} rows of ${l}. Skip-count by ${l}, ${w} times: that repeated addition is the same as multiplying.`,
      areaModel(w, l, `${w} rows of ${l}`),
      [l, w],
    ),
    step(
      "Multiply length × width",
      `Area = length × width: multiply your two measurements together. Label the answer in square centimeters — squares, not plain cm.`,
      areaModel(l, w),
      [l, w],
    ),
    tryItStep(p, [l, w]),
  ];
}

function lessonPerimeter(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\s*cm long and (\d+)\s*cm wide/);
  const nums = allNumbers(p.text);
  const l = m ? Number(m[1]) : (nums[0] ?? 0);
  const w = m ? Number(m[2]) : (nums[1] ?? 0);
  return [
    step(
      "Walk all four edges",
      `Your rectangle is ${l} cm by ${w} cm. Perimeter is the walk around: ${l} + ${w} + ${l} + ${w}. Every side counts once.`,
      polygonModel(4, false, `${l} + ${w} + ${l} + ${w}`),
      [l, w],
    ),
    step(
      "Opposite sides match",
      `Add one long and one short side first: ${l} + ${w} = ${l + w}. The other pair is identical, so double it: 2 × ${l + w}.`,
      polygonModel(4, false, `2 × (${l} + ${w})`),
      [l, w, l + w],
    ),
    tryItStep(p, [l, w]),
  ];
}

function lessonPlaceValue(p: Problem): LessonStep[] {
  const mn = p.text.replace(/,/g, "").match(/number\s+(\d+)/);
  const mp = p.text.match(/in the ([\w-]+) place/);
  const nums = allNumbers(p.text);
  const n = mn ? Number(mn[1]) : (nums[0] ?? 0);
  const place = mp ? mp[1] : "tens";
  const expMap: Record<string, number> = {
    ones: 0, tens: 1, hundreds: 2, thousands: 3, "ten-thousands": 4, "hundred-thousands": 5,
  };
  const exp = expMap[place] ?? 1;
  const digit = Math.floor(n / 10 ** exp) % 10;
  const value = digit * 10 ** exp;
  const digits = String(n);
  return [
    step(
      "Label digits from the right",
      `Your number is ${fmt(n)}. Starting at the right, label: ones, tens, hundreds, thousands … Each step left is 10× bigger.`,
      placeValueModel(digits),
      [n, digit],
    ),
    step(
      `Zoom into the ${place} place`,
      `Count ${exp} step(s) left from the ones digit of ${fmt(n)}. Circle whatever digit sits in the ${place} place.`,
      placeValueModel(digits, digits.length - 1 - exp),
      [n, digit],
    ),
    step(
      "What is that digit worth?",
      `A digit in the ${place} place is worth that digit times ${fmt(10 ** exp)}. The position gives the digit its power — say the value, not just the digit.`,
      placeValueModel(digits, digits.length - 1 - exp),
      [n, digit, value],
    ),
    tryItStep(p, [n, digit]),
  ];
}

function lessonRounding(p: Problem): LessonStep[] {
  const mn = p.text.replace(/,/g, "").match(/Round\s+([\d.]+)/);
  const mp = p.text.match(/nearest (\w+)/);
  const fMap: Record<string, number> = { ten: 10, hundred: 100, thousand: 1000 };
  const nums = allNumbers(p.text);
  const n = mn ? Number(mn[1]) : (nums[0] ?? 0);
  const place = mp ? mp[1] : "ten";
  const f = fMap[place] ?? 10;
  const lo = Math.floor(n / f) * f;
  const hi = Math.ceil(n / f) * f;
  const deciding = Math.floor((n % f) / (f / 10));
  return [
    step(
      "Find the two neighbors",
      `${fmt(n)} sits between ${fmt(lo)} and ${fmt(hi)} (the nearest ${place}s below and above). It must round to one of these two — nothing else.`,
      numberLine(lo, hi, [n], `nearest ${place} to ${fmt(n)}`),
      [n, lo, hi],
    ),
    step(
      "Look at the digit next door",
      `The digit just right of the ${place}s place is ${deciding}. Rule: 5 or more rounds UP, 4 or less rounds DOWN.`,
      numberLine(lo, hi, [n], `deciding digit: ${deciding}`),
      [n, lo, hi],
    ),
    step(
      "Pick the closer neighbor",
      `Is ${fmt(n)} closer to ${fmt(lo)} or ${fmt(hi)}? Walk it on the number line — the shorter walk wins.`,
      numberLine(lo, hi, [n]),
      [n, lo, hi],
    ),
    tryItStep(p, [n, lo, hi]),
  ];
}

function lessonAddUnlike(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\/(\d+)\s*\+\s*(\d+)\/(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const d1 = m ? Number(m[2]) : (nums[1] ?? 1);
  const b = m ? Number(m[3]) : (nums[2] ?? 0);
  const d2 = m ? Number(m[4]) : (nums[3] ?? 1);
  const den = d1 * d2;
  const t1 = a * d2;
  const t2 = b * d1;
  return [
    step(
      "Different bottoms can't add yet",
      `Your problem is ${a}/${d1} + ${b}/${d2}. The slices are different sizes (${d1}ths vs ${d2}ths), so first rebuild both with one shared bottom: ${d1} × ${d2} = ${den}.`,
      fractionBar(a, d1, { numerator: b, denominator: d2 }),
      [a, d1, b, d2],
    ),
    step(
      "Rebuild each fraction",
      `${a}/${d1} = ${t1}/${den} (top and bottom both × ${d2}) and ${b}/${d2} = ${t2}/${den} (top and bottom both × ${d1}). Same amount of pie, new slice sizes.`,
      fractionBar(t1, den, { numerator: t2, denominator: den }),
      [a, d1, b, d2, den],
    ),
    step(
      "Add only the new tops",
      `Add the new top numbers: ${t1} + ${t2}. The shared bottom (${den}) stays — never add the bottoms. Simplify if top and bottom share a factor.`,
      fractionBar(t1, den, { numerator: t2, denominator: den }),
      [a, b, den, t1 + t2],
    ),
    tryItStep(p, [a, d1, b, d2]),
  ];
}

function lessonSubUnlike(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\/(\d+)\s*-\s*(\d+)\/(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const d1 = m ? Number(m[2]) : (nums[1] ?? 1);
  const b = m ? Number(m[3]) : (nums[2] ?? 0);
  const d2 = m ? Number(m[4]) : (nums[3] ?? 1);
  const den = d1 * d2;
  const t1 = a * d2;
  const t2 = b * d1;
  return [
    step(
      "Different bottoms can't subtract yet",
      `Your problem is ${a}/${d1} − ${b}/${d2}. The slices are different sizes (${d1}ths vs ${d2}ths), so first rebuild both with one shared bottom: ${d1} × ${d2} = ${den}.`,
      fractionBar(a, d1, { numerator: b, denominator: d2 }),
      [a, d1, b, d2],
    ),
    step(
      "Rebuild each fraction",
      `${a}/${d1} = ${t1}/${den} (top and bottom both × ${d2}) and ${b}/${d2} = ${t2}/${den} (top and bottom both × ${d1}). Same amount of pie, new slice sizes.`,
      fractionBar(t1, den, { numerator: t2, denominator: den }),
      [a, d1, b, d2, den],
    ),
    step(
      "Subtract only the new tops",
      `Subtract the new top numbers: ${t1} − ${t2}. The shared bottom (${den}) stays — never subtract the bottoms. Simplify if top and bottom share a factor.`,
      fractionBar(t1, den, { numerator: t2, denominator: den }),
      [a, b, den, t1 - t2],
    ),
    tryItStep(p, [a, d1, b, d2]),
  ];
}

function lessonMultWholeAdv(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\/(\d+)\s*×\s*(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const d = m ? Number(m[2]) : (nums[1] ?? 1);
  const w = m ? Number(m[3]) : (nums[2] ?? 0);
  const top = a * w;
  return [
    step(
      "See it as copies",
      `${a}/${d} × ${w} means ${w} copies of ${a}/${d}. Picture ${w} plates, each holding ${a} out of ${d} slices — how many slices is that altogether?`,
      fractionBar(a, d, { numerator: top, denominator: d }),
      [a, d, w],
    ),
    step(
      "Multiply only the top",
      `Copies pile up slices but never change the slice size: (${a} × ${w})/${d}. The bottom stays ${d} — only the top grows.`,
      fractionBar(a, d),
      [a, d, w, top],
    ),
    step(
      "Simplify, and spill past one whole if you can",
      `Look at your new fraction: if the top is as big as the bottom, that is a whole or more. Divide top and bottom by any shared factor to finish.`,
      fractionBar(top, d),
      [a, d, w, top],
    ),
    tryItStep(p, [a, d, w]),
  ];
}

function lessonDecAddSub(p: Problem): LessonStep[] {
  const m = p.text.match(/([\d.]+)\s*([+-])\s*([\d.]+)/);
  const nums = allNumbers(p.text);
  const x = m ? Number(m[1]) : (nums[0] ?? 0);
  const op = m ? m[2] : "+";
  const y = m ? Number(m[3]) : (nums[1] ?? 0);
  const plus = op === "+";
  const cx = Math.round(x * 100);
  const cy = Math.round(y * 100);
  return [
    step(
      "Line up the dots",
      `Your numbers are ${x} and ${y}. Stack them with the decimal points lined up — tenths under tenths, hundredths under hundredths. Lined-up dots keep every place value honest.`,
      placeValueModel(String(x), String(x).indexOf(".") + 1),
      [x, y],
    ),
    step(
      plus ? "Add hundredths, then tenths" : "Subtract hundredths, then tenths",
      `Think in hundredths: ${x} is ${cx} hundredths and ${y} is ${cy} hundredths. Combine the columns one at a time, exactly like whole numbers, ${plus ? "carrying" : "borrowing"} when a column needs it.`,
      chips([cx, cy]),
      [x, y, cx, cy],
    ),
    step(
      "Drop the point straight down",
      `The answer's decimal point sits exactly under the lined-up points of ${x} and ${y}. Finish the columns, then place the point.`,
      placeValueModel(String(y), String(y).indexOf(".") + 1),
      [x, y],
    ),
    tryItStep(p, [x, y]),
  ];
}

function lessonDecMultPow10(p: Problem): LessonStep[] {
  const m = p.text.match(/([\d.]+)\s*×\s*(\d+)/);
  const nums = allNumbers(p.text);
  const x = m ? Number(m[1]) : (nums[0] ?? 0);
  const k = m ? Number(m[2]) : (nums[1] ?? 10);
  const zeros = Math.max(String(k).length - 1, 1);
  const places = zeros === 1 ? "one place" : `${zeros} places`;
  const cents = Math.round(x * 100);
  return [
    step(
      `Multiplying by ${k} shifts every digit`,
      `Your problem is ${x} × ${k}. Multiplying by ${k} makes every digit bigger, so the point slides ${places} to the right. No column work needed — just shift.`,
      chips([x, k]),
      [x, k],
    ),
    step(
      "See it in hundredths",
      `Rewrite ${x} as a whole number of hundredths by sliding the point two places to the right. Multiply that whole number by ${k}, then slide the point back two places — the digits never get lost.`,
      chips([x, k]),
      [x, k, cents],
    ),
    step(
      "Shift the point and read it",
      `Slide each digit of ${x} ${places} to the left, so the point lands ${places} to the right. Read the new number — that shift IS the multiplication by ${k}.`,
      numberLine(0, Math.max(x * k, 1), [x], `${x} × ${k}`),
      [x, k],
    ),
    tryItStep(p, [x, k]),
  ];
}

function lessonVolume(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\s*cm long,\s*(\d+)\s*cm wide,\s*and\s*(\d+)\s*cm tall/);
  const nums = allNumbers(p.text);
  const l = m ? Number(m[1]) : (nums[0] ?? 0);
  const w = m ? Number(m[2]) : (nums[1] ?? 0);
  const h = m ? Number(m[3]) : (nums[2] ?? 0);
  const base = l * w;
  return [
    step(
      "Volume counts cubes",
      `Your box is ${l} cm by ${w} cm by ${h} cm. Volume asks: how many 1-cm cubes fill it? Start with the flat bottom layer.`,
      cubesModel(l, w, h),
      [l, w, h],
    ),
    step(
      "Cover the bottom layer",
      `One layer holds ${l} × ${w} = ${base} cubes — a full rectangle of cubes, one cube tall. Count that flat layer first.`,
      cubesModel(l, w, 1),
      [l, w, h, base],
    ),
    step(
      "Stack the layers",
      `There are ${h} layers of ${base}. Multiply the layer by the height — and the answer is in cubic centimeters (cubes, not flat squares).`,
      cubesModel(l, w, h),
      [l, w, h, base],
    ),
    tryItStep(p, [l, w, h]),
  ];
}

function lessonOrderOps(p: Problem): LessonStep[] {
  const mp = p.text.match(/\((\d+)\s*\+\s*(\d+)\)\s*×\s*(\d+)/);
  if (mp) {
    const a = Number(mp[1]);
    const b = Number(mp[2]);
    const c = Number(mp[3]);
    const s = a + b;
    return [
      step(
        "Parentheses always go first",
        `Your problem is (${a} + ${b}) × ${c}. The parentheses are a "do me first" box — nothing outside the box may jump the line.`,
        chips([a, b, c]),
        [a, b, c],
      ),
      step(
        "Solve inside the box",
        `(${a} + ${b}) = ${s}. Cover the box with ${s} and the problem shrinks to just ${s} × ${c}.`,
        chips([a, b, c, s]),
        [a, b, c, s],
      ),
      step(
        "Finish the multiplication",
        `Now multiply ${s} × ${c} to finish — that last product is the whole answer. Parentheses first, then ×.`,
        chips([s, c]),
        [a, b, c, s],
      ),
      tryItStep(p, [a, b, c]),
    ];
  }
  const m = p.text.match(/(\d+)\s*\+\s*(\d+)\s*×\s*(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const b = m ? Number(m[2]) : (nums[1] ?? 0);
  const c = m ? Number(m[3]) : (nums[2] ?? 0);
  const prod = b * c;
  return [
    step(
      "Multiplication outranks addition",
      `Your problem is ${a} + ${b} × ${c}. × beats + — the multiplication owns its neighbors first, no matter that + comes first on the page.`,
      chips([a, b, c]),
      [a, b, c],
    ),
    step(
      "Do the × part first",
      `${b} × ${c} = ${prod}. Cover that with ${prod} and the problem shrinks to ${a} + ${prod} — one easy addition left.`,
      chips([a, b, c, prod]),
      [a, b, c, prod],
    ),
    step(
      "Add last",
      `Finish with ${a} + ${prod}. Adding first would give the wrong answer — order matters, so × always goes before +.`,
      chips([a, prod]),
      [a, b, c, prod],
    ),
    tryItStep(p, [a, b, c]),
  ];
}

function lessonCoordPlane(p: Problem): LessonStep[] {
  const m = p.text.match(/is\s+(\d+)\s+units to the right and\s+(\d+)\s+units up/);
  const nums = allNumbers(p.text);
  const x = m ? Number(m[1]) : (nums[0] ?? 0);
  const y = m ? Number(m[2]) : (nums[1] ?? 0);
  return [
    step(
      "x counts the walk right",
      `Point A is ${x} right and ${y} up from (0, 0). The FIRST number (x) always counts steps right along the floor — so the first coordinate is the rightward walk.`,
      coordinateModel([{ x, y }], Math.max(x, y, 1)),
      [x, y],
    ),
    step(
      "y counts the climb up",
      `The SECOND number (y) counts steps up the wall. Right first, up second — that order never swaps.`,
      coordinateModel([{ x, y }], Math.max(x, y, 1)),
      [x, y],
    ),
    step(
      "Walk it from the origin",
      `Start at (0, 0): march right along the floor, then climb up the wall. When you stop, write the rightward count first and the upward count second, separated by a comma.`,
      coordinateModel([{ x, y }], Math.max(x, y, 1)),
      [x, y],
    ),
    tryItStep(p, [x, y]),
  ];
}

function lessonAngleTypes(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\s*degrees/);
  const nums = allNumbers(p.text);
  const deg = m ? Number(m[1]) : (nums[0] ?? 0);
  return [
    step(
      "A square corner is the dividing line",
      `Your angle is ${deg} degrees. Hold it against a square corner (exactly 90 degrees): is yours sharper and smaller, exactly the same, or wider? That one comparison decides everything.`,
      angleModel(deg),
      [deg],
    ),
    step(
      "Sort it into three boxes",
      `Smaller than 90 is acute (sharp), exactly 90 is right (square corner), between 90 and 180 is obtuse (wide). Compare ${deg} with 90 to choose the box.`,
      angleModel(90),
      [deg, 90],
    ),
    step(
      "Say why in one sentence",
      `Name the type, then justify it with the comparison: "it is ___ because ___ is less than 90 / exactly 90 / more than 90". One number, one comparison, one word.`,
      angleModel(deg),
      [deg, 90],
    ),
    tryItStep(p, [deg]),
  ];
}

function lessonTriangles(p: Problem): LessonStep[] {
  const ms = p.text.match(/side lengths (\d+) cm, (\d+) cm, and (\d+) cm/);
  if (ms) {
    const a = Number(ms[1]);
    const b = Number(ms[2]);
    const c = Number(ms[3]);
    const kind = p.answer.toLowerCase();
    const equal = kind === "scalene" ? false : true;
    return [
      step(
        "List the three sides",
        `Your sides are ${a} cm, ${b} cm, and ${c} cm. Write them in a row and draw lines between the ones that are equal.`,
        polygonModel(3, equal, `${a} cm, ${b} cm, ${c} cm`),
        [a, b, c],
      ),
      step(
        "Count the matches",
        `Compare ${a} vs ${b} vs ${c}. How many of the three are the same length? That count is the only thing the name depends on.`,
        chips([a, b, c]),
        [a, b, c],
      ),
      step(
        "Name it",
        `Three matching sides is equilateral, exactly two is isosceles, none is scalene. Count the matches, then pick the word.`,
        polygonModel(3, equal, `${a} cm, ${b} cm, ${c} cm`),
        [a, b, c],
      ),
      tryItStep(p, [a, b, c]),
    ];
  }
  const ma = p.text.match(/angles (\d+)°, (\d+)°, and (\d+)°/);
  const nums = allNumbers(p.text);
  const x = ma ? Number(ma[1]) : (nums[0] ?? 0);
  const y = ma ? Number(ma[2]) : (nums[1] ?? 0);
  const z = ma ? Number(ma[3]) : (nums[2] ?? 0);
  const big = Math.max(x, y, z);
  return [
    step(
      "Find the biggest angle",
      `Your angles are ${x}°, ${y}°, and ${z}°. The biggest one decides the triangle's type all by itself — find it first.`,
      polygonModel(3, undefined, `${x}°, ${y}°, ${z}°`),
      [x, y, z, big],
    ),
    step(
      "Compare the biggest to 90",
      `Is ${big}° below 90 (acute), exactly 90 (right), or above 90 (obtuse)? The whole triangle takes the name of its biggest angle.`,
      angleModel(big),
      [x, y, z, big],
    ),
    step(
      "Name it",
      `Name the triangle after that comparison: below 90 is acute, exactly 90 is right, above 90 is obtuse. One comparison, one word — done.`,
      angleModel(big),
      [x, y, z],
    ),
    tryItStep(p, [x, y, z]),
  ];
}

function lessonSymmetry(p: Problem): LessonStep[] {
  const m = p.text.match(/does a (.+) have\?/);
  const shape = m ? m[1] : "shape";
  const lines = Number(p.answer);
  const wn = Number.isFinite(lines) ? [lines] : [0];
  const sides = shapeSides(shape);
  return [
    step(
      "Fold it in your head",
      `Your shape is a ${shape}. Imagine folding it: a line of symmetry is a fold where both halves land exactly on top of each other.`,
      symmetryModel(sides, lines),
      [...wn],
    ),
    step(
      "Count every matching fold",
      `Keep folding the ${shape} a different way each time. Count only the folds where both halves land exactly on top of each other. No matching fold is possible too — a count of zero is a real answer.`,
      symmetryModel(sides, lines),
      [...wn],
    ),
    step(
      "Say the count",
      `Count the folds that matched — that count is the answer. Two halves landing exactly on top of each other is what makes a fold count.`,
      symmetryModel(sides, lines),
      [...wn],
    ),
    tryItStep(p, [...wn]),
  ];
}

function lessonElapsedTime(p: Problem): LessonStep[] {
  const m = p.text.match(/starts at (.+?) and ends at (.+?)\./);
  const startLabel = m ? m[1] : "";
  const endLabel = m ? m[2] : "";
  const dur = Number(p.answer);
  const nums = allNumbers(p.text);
  const wn = [...nums.slice(0, 4), dur];
  return [
    step(
      "Hop to the next hour first",
      `Class runs ${startLabel} to ${endLabel}. First hop from ${startLabel} up to the next whole hour — write down those minutes.`,
      clockFromLabel(startLabel),
      [...wn],
    ),
    step(
      "Add the rest of the ride",
      `From that whole hour, count forward to ${endLabel} and add both hops together. Hours turn into 60 minutes each, so count the leftover minutes too.`,
      clockFromLabel(endLabel),
      [...wn],
    ),
    step(
      "Check by counting back",
      `Check it: from the end time, count back to the start. If the end minutes look smaller than the start minutes, borrow 1 hour as 60 minutes first.`,
      clockFromLabel(startLabel),
      [...wn],
    ),
    tryItStep(p, [...wn]),
  ];
}

function lessonFractionNumberLine(p: Problem): LessonStep[] {
  const m = p.text.match(/from 0 to (\d+) is split into \w+ \(each whole cut into (\d+) equal parts\)\. A dot sits at tick (\d+)/);
  const nums = allNumbers(p.text);
  const N = m ? Number(m[1]) : (nums[0] ?? 1);
  const d = m ? Number(m[2]) : (nums[1] ?? 2);
  const t = m ? Number(m[3]) : (nums[2] ?? 1);
  const dot = d > 0 ? t / d : 0;
  return [
    step(
      "Name one jump",
      `Each whole from 0 to ${N} is cut into ${d} equal parts, so one tick-jump is 1/${d}. The number line is just ${d}ths marching from 0.`,
      numberLine(0, N, [0, N], `every jump is 1/${d}`),
      [N, d, t],
    ),
    step(
      "Count the jumps",
      `The dot sits at tick ${t}, so count ${t} jumps of 1/${d} from 0. Ticks count jumps, and jumps name the fraction.`,
      numberLine(0, N, [0, dot, N], `${t} jumps of 1/${d}`),
      [N, d, t],
    ),
    step(
      "Simplify if you can",
      `Look at the fraction you landed on: if its top and bottom share a factor, divide both by it. If not, it is already finished.`,
      numberLine(0, N, [0, dot, N]),
      [N, d, t],
    ),
    tryItStep(p, [N, d, t]),
  ];
}

function lessonDecimalPlaceValue(p: Problem): LessonStep[] {
  const m = p.text.match(/In the number ([\d.]+), what is the value of the digit in the (\w+) place/);
  const nums = allNumbers(p.text);
  const x = m ? Number(m[1]) : (nums[0] ?? 0);
  const place = m ? m[2] : "tenths";
  const val = Number(p.answer);
  const digits = m ? m[1] : String(x);
  const dot = digits.indexOf(".");
  const index = dot === -1 ? 0 : dot + (place === "tenths" ? 1 : 2);
  return [
    step(
      "Point at the address",
      `Your number is ${digits}. The first digit after the point lives in tenths, the second in hundredths — find the ${place} digit and circle it.`,
      placeValueModel(digits, index),
      [x, val],
    ),
    step(
      "The address sets the worth",
      `A digit in the ${place} place is worth that digit times ${place === "tenths" ? "1/10" : "1/100"}. Position is power — the place, not the digit, sets the size.`,
      placeValueModel(digits, index),
      [x, val],
    ),
    step(
      "Say value, not digit",
      `The digit and its value are different things: read the ${place} digit, multiply it by its fraction, and report the value, not just the digit.`,
      placeValueModel(digits, index),
      [x, val],
    ),
    tryItStep(p, [x, val]),
  ];
}

function lessonCompositePerimeter(p: Problem): LessonStep[] {
  const m = p.text.match(/from a (\d+) m by (\d+) m rectangle with a (\d+) m by (\d+) m/);
  const nums = allNumbers(p.text);
  const W = m ? Number(m[1]) : (nums[0] ?? 0);
  const H = m ? Number(m[2]) : (nums[1] ?? 0);
  const a = m ? Number(m[3]) : (nums[2] ?? 0);
  const b = m ? Number(m[4]) : (nums[3] ?? 0);
  const total = 2 * (W + H);
  return [
    step(
      "Walk the whole edge",
      `Your patio starts as a ${W} m by ${H} m rectangle with a ${a} m by ${b} m corner cut out. Perimeter means walking every edge — outer AND the inner notch walls.`,
      polygonModel(6, false, `${W} m by ${H} m, with a ${a} m by ${b} m notch`),
      [W, H, a, b],
    ),
    step(
      "The notch gives back what it takes",
      `The cut removes ${a} m of outer edge but adds ${a} m of inner wall (and the same for ${b} m). So the L-shape walks exactly as far as the full rectangle: 2 × (${W} + ${H}).`,
      polygonModel(6, false, `2 × (${W} + ${H})`),
      [W, H, a, b, total],
    ),
    tryItStep(p, [W, H, a, b]),
  ];
}

function lessonMultistepWord(p: Problem): LessonStep[] {
  const nums = allNumbers(p.text);
  const ans = Number(p.answer);
  const shown = nums.length ? nums : [ans];
  const first = shown.slice(0, 2);
  const rest = shown.slice(2);
  return [
    step(
      "Underline the two steps",
      `Your story says: “${p.text}” Underline the numbers (${shown.join(", ")}) and mark the two jobs: first find a hidden amount, then use it for the final question.`,
      chips(shown),
      [...shown],
    ),
    step(
      "Do the hidden step first",
      `Combine ${first.join(" and ")} first — that hidden amount (${first.length > 1 ? "add, subtract, or multiply them as the story says" : "work it out"}) unlocks the rest of the problem.`,
      chips([...first]),
      [...first, ...rest.slice(0, 1)],
    ),
    step(
      "Finish with the second step",
      `Take that hidden amount and ${rest.length ? `combine it with ${rest.join(" and ")}` : "finish the story"} to land on the final answer. Two small steps beat one big leap.`,
      chips([...(rest.length ? rest : first)]),
      [...(rest.length ? rest : first), ans],
    ),
    tryItStep(p, [...shown, ans]),
  ];
}

function lessonCompareFractions(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\/(\d+) or (\d+)\/(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const d1 = m ? Number(m[2]) : (nums[1] ?? 1);
  const b = m ? Number(m[3]) : (nums[2] ?? 0);
  const d2 = m ? Number(m[4]) : (nums[3] ?? 1);
  const left = a * d2;
  const right = b * d1;
  return [
    step(
      "Picture two same-size pies",
      `Your fractions are ${a}/${d1} and ${b}/${d2}. Same-size pies, different cuts: ${d1} slices vs ${d2} slices. Bigger slices can beat more slices.`,
      fractionBar(a, d1, { numerator: b, denominator: d2 }),
      [a, d1, b, d2],
    ),
    step(
      "Ask each half: are you past it?",
      `Benchmark against 1/2: is ${a}/${d1} more or less than half? Is ${b}/${d2}? If one passes half and the other does not, you are done already.`,
      numberLine(0, 1, [0.5, a / d1, b / d2], "half-way mark"),
      [a, d1, b, d2],
    ),
    step(
      "Cross-multiply to be sure",
      `${a} × ${d2} = ${left} versus ${b} × ${d1} = ${right}. The side with the bigger product holds the bigger fraction — no guessing.`,
      chips([left, right]),
      [a, d1, b, d2, left, right],
    ),
    tryItStep(p, [a, d1, b, d2]),
  ];
}

function lessonFallback(p: Problem): LessonStep[] {
  const nums = allNumbers(p.text + " " + p.answer);
  const shown = nums.length ? nums : [0];
  const first = shown[0];
  return [
    step(
      "Read the problem slowly",
      `Your problem says: “${p.text}” Underline the numbers (${shown.join(", ")}) and circle what it is asking for.`,
      chips(shown),
      [...shown],
    ),
    step(
      "Break it into tiny pieces",
      `Take the first number, ${first}, and ask: what do I know about it? Solve one tiny piece at a time instead of the whole thing at once.`,
      chips(shown),
      [...shown],
    ),
    step(
      "Estimate, then solve exactly",
      `Guess roughly first using ${first}, then work it out exactly and check: does your answer feel close to the guess?`,
      numberLine(0, Math.max(first, 1), [first]),
      [...shown],
    ),
    tryItStep(p, [...shown]),
  ];
}

/* ---------- builders for the newly generated skills ---------- *
 * Shared deliberately where the prompt shape is identical: both
 * `fr-mult-whole-adv` and `fr-mult-fraction-whole` ask `a/d × w`, and both
 * `md-length-convert` and `md-mass-capacity` ask a unit-conversion question.
 */

function lessonMultTwoDigit(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/(\d+)\s*×\s*(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const b = m ? Number(m[2]) : (nums[1] ?? 0);
  const tens = Math.floor(b / 10) * 10;
  const ones = b - tens;
  const first = a * tens;
  const second = a * ones;
  const round = ones === 0;
  return [
    step(
      "Break one factor apart",
      `${a} × ${b} is heavy, but ${b} = ${tens} + ${ones}. Split one factor and the big multiplication becomes two small ones you already know.`,
      barGraph([tens, ones], `${b} = ${tens} + ${ones}`),
      [a, b, tens, ones],
    ),
    step(
      round ? "Multiply by the multiple of ten" : "Multiply by the tens first",
      round
        ? `${a} × ${tens} only adds a zero: keep the digits of ${a} and put one zero on the end. Multiplying by ${tens} is that easy.`
        : `Work out ${a} × ${tens} = ${fmt(first)}. Multiplying by a multiple of ten is easy: multiply by ${tens / 10} first, then add the zero.`,
      barGraph(round ? [first] : [first, second], `${a} × ${tens}${round ? "" : ` and ${a} × ${ones}`}`),
      [a, b, tens, first],
    ),
    step(
      round ? "Nothing left to add" : "Add the two partial products",
      round
        ? `The ones part is zero, so there is no second partial product — the tens product stands as the whole answer.`
        : `Line up ${fmt(first)} and ${fmt(second)} by place value — ones under ones, tens under tens — then add the columns. The two partial products make the whole answer.`,
      chips(round ? [first] : [first, second]),
      [a, b, first, second],
    ),
    tryItStep(p, [a, b]),
  ];
}

function lessonFactorPairs(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/number\s+(\d+)\s+can be written as\s+(\d+)/);
  const nums = allNumbers(p.text);
  const n = m ? Number(m[1]) : (nums[0] ?? 0);
  const d = m ? Number(m[2]) : (nums[1] ?? 1);
  const pair = d > 0 && n % d === 0 ? n / d : n / (d || 1);
  const jumps: number[] = [];
  for (let v = d; v <= n && jumps.length < 12; v += d) jumps.push(v);
  return [
    step(
      "A factor pair multiplies to the number",
      `${n} is built from equal groups of ${d}. Ask: ${d} times WHAT makes ${n}? That missing piece is the whole question.`,
      numberLine(0, n, jumps.length ? jumps : [d, n], `count up by ${d}`),
      [n, d],
    ),
    step(
      "Divide to find the partner",
      `Multiplication and division are partners: if ${d} × ? = ${n}, then ? is ${n} ÷ ${d}. Skip-count by ${d} until you land exactly on ${n}, or use the fact you know.`,
      chips([n, d]),
      [n, d],
    ),
    step(
      "Check by multiplying back",
      `Multiply your missing factor by ${d} and see whether it lands on ${n}. If it does, you have found the partner factor.`,
      areaModel(d, pair, `${d} equal groups`),
      [n, d],
    ),
    tryItStep(p, [n, d]),
  ];
}

function lessonMultiplesPrime(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/Is\s+(\d+)\s+prime or composite/);
  const n = m ? Number(m[1]) : (allNumbers(p.text)[0] ?? 0);
  const divisor = firstDivisor(n);
  return [
    step(
      "Test the small divisors",
      `Try to divide ${n} by 2, then 3, then 5, then 7 … Keep going while the divisor is no bigger than the square root of ${n}. One clean hit means it has a factor pair.`,
      chips([n, 2, 3, 5]),
      [n, 2, 3, 5],
    ),
    step(
      "Every number has 1 and itself",
      `1 × ${n} = ${n} always works, so those two factors never decide anything. What matters is whether any OTHER whole number divides ${n} evenly.`,
      chips([1, n]),
      [n, 1],
    ),
    step(
      "Two factors only? It's prime. More? Composite",
      `If no divisor up to the square root divides ${n}, the number is prime. If you found even one factor pair like ${divisor} × ${n / divisor}, it is composite.`,
      barGraph([1, n], `factor pairs of ${n}`),
      [n, divisor],
    ),
    tryItStep(p, [n]),
  ];
}

function lessonPatterns(p: Problem): LessonStep[] {
  const seqM = p.text.match(/pattern\?\s*([^?]+)\?/);
  const seq = seqM ? allNumbers(seqM[1]) : allNumbers(p.text);
  const first = seq[0] ?? 0;
  const last = seq.length ? seq[seq.length - 1] : 0;
  const diffs = seq.slice(1).map((v, i) => v - seq[i]);
  const jump = diffs[0] ?? 0;
  const constantJump = diffs.length > 0 && diffs.every((d) => d === jump);
  const ratio = first !== 0 && seq.length > 1 ? seq[1] / first : 0;
  const constantRatio = ratio !== 0 && seq.slice(1).every((v, i) => v === seq[i] * ratio);
  const rule = constantJump
    ? `add ${jump} each time`
    : constantRatio
      ? `multiply by ${ratio} each time`
      : `the jump changes every step (start with +${jump})`;
  return [
    step(
      "Find the jump between terms",
      `Look at ${seq.join(", ")}. From ${seq[0]} to ${seq[1]} the jump is ${jump}. Check the next jump too: ${seq[1]} to ${seq[2]}.`,
      numberLine(first, last, seq, "find the rule"),
      seq.length ? [...seq] : [first],
    ),
    step(
      "Say the rule out loud",
      `The rule here is: ${rule}. A rule you can say in words is a rule you can keep using.`,
      chips(seq.length ? seq.slice(0, 5) : [first]),
      seq.length ? [...seq] : [first],
    ),
    step(
      "Apply the rule one more time",
      `Start at the last term, ${last}, and apply the same rule once more. The number you land on is the next term.`,
      numberLine(first, last, seq.slice(-3)),
      seq.length ? [last, jump] : [first],
    ),
    tryItStep(p, seq.length ? seq.slice(0, 4) : [first]),
  ];
}

function lessonRemainders(p: Problem): LessonStep[] {
  const nums = allNumbers(p.text);
  const n = nums[0] ?? 0;
  const d = nums[1] ?? 1;
  const q = d > 0 ? Math.floor(n / d) : 0;
  const big = d * q;
  const wantsTotal = /are needed\?/.test(p.text);
  const wantsLeftover = /left over\?/.test(p.text);
  return [
    step(
      "Make full groups first",
      `Keep making groups of ${d} from ${n} until you cannot fill another whole group. The leftover must be smaller than ${d} — that rule never breaks.`,
      numberLine(0, n, [big], `${n} split into groups of ${d}`),
      [n, d, big],
    ),
    step(
      "Write the division fact",
      `${n} ÷ ${d} gives a quotient (how many whole groups you filled) and a remainder (the pieces left over). The leftover is always smaller than ${d}.`,
      barGraph([big, n - big], `${n} ÷ ${d}: whole groups plus the leftover`),
      [n, d, big],
    ),
    step(
      "Read the story to pick your answer",
      wantsTotal
        ? `The leftover pieces still need a container, so round the number of groups UP by one. That extra group is not waste — it is needed.`
        : wantsLeftover
          ? `The story asks only for what did not fit, so the remainder itself is the answer. Do not round it away.`
          : `The story asks how many each person gets, so the quotient is the answer. The leftover is too small to share, so it is dropped.`,
      chips([n, d]),
      [n, d],
    ),
    tryItStep(p, [n, d]),
  ];
}

function lessonMultistepFrac(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\/(\d+) cup of sugar for each batch\. \w+ makes (\d+) batches, starting with (\d+) cups/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const d = m ? Number(m[2]) : (nums[1] ?? 1);
  const batches = m ? Number(m[3]) : (nums[2] ?? 0);
  const start = m ? Number(m[4]) : (nums[3] ?? 0);
  const used = a * batches;
  return [
    step(
      "Find the sugar used first",
      `Each batch uses ${a}/${d} cup. ${batches} batches means ${batches} copies of that fraction — picture ${batches} identical measuring cups.`,
      fractionBar(a, d, { numerator: used, denominator: d }),
      [a, d, batches, start],
    ),
    step(
      "Multiply to get the amount used",
      `Multiply only the top: ${a} × ${batches} over ${d}. That gives the fraction of a cup used by all the batches together.`,
      fractionBar(used, d),
      [a, d, batches, used],
    ),
    step(
      "Subtract from what you started with",
      `Rewrite the starting amount ${start} as ${start} × ${d} over ${d} — same value, matching slices. Then subtract the used top from it and simplify.`,
      fractionBar(start * d, d, { numerator: used, denominator: d }),
      [a, d, batches, start],
    ),
    tryItStep(p, [a, d, batches, start]),
  ];
}

function lessonExpressions(p: Problem): LessonStep[] {
  const words = p.text.match(/^Write the expression for "(.+?)" and evaluate it/);
  const phrase = words ? words[1] : p.text;
  const nums = allNumbers(phrase);
  const sum = phrase.match(/sum of (\d+) and (\d+)/);
  const diff = phrase.match(/difference of (\d+) and (\d+)/);
  const inner = sum
    ? Number(sum[1]) + Number(sum[2])
    : diff
      ? Number(diff[1]) - Number(diff[2])
      : (nums[0] ?? 0);
  const factorM = phrase.match(/multiplied by (\d+)/) ?? phrase.match(/product of (\d+)/);
  const factor = factorM ? Number(factorM[1]) : 1;
  const incM = phrase.match(/increased by (\d+)/);
  const decM = phrase.match(/decreased by (\d+)/);
  const tail = incM ? `then add ${incM[1]}` : decM ? `then subtract ${decM[1]}` : "nothing more";
  return [
    step(
      "Underline the operation words",
      `In “${phrase}”, the words tell you the order: "sum"/"difference" build a group, "multiplied by"/"product" wraps it, and "increased"/"decreased" finishes it. The numbers are ${nums.join(", ")}.`,
      chips(nums.length ? nums : [inner]),
      nums.length ? [...nums] : [inner],
    ),
    step(
      "Build the group first",
      `${sum ? `${sum[1]} + ${sum[2]} = ${inner}` : diff ? `${diff[1]} − ${diff[2]} = ${inner}` : `${inner}`} is the grouped amount. In symbols it sits inside parentheses, so it happens first.`,
      chips([inner, factor]),
      [inner, factor, ...nums.slice(0, 2)],
    ),
    step(
      "Apply the outer operation last",
      `Take the grouped amount and multiply it by ${factor}, then ${tail}. Work left to right through the operations you underlined.`,
      barGraph([inner, factor], `grouped amount × ${factor}`),
      [inner, factor],
    ),
    tryItStep(p, nums.length ? nums : [inner]),
  ];
}

function lessonAddSubWord(p: Problem): LessonStep[] {
  const nums = allNumbers(p.text);
  const a = nums[0] ?? 0;
  const b = nums[1] ?? 0;
  const subtract = /gives away|are left\?/.test(p.text);
  return [
    step(
      "Joining or taking away?",
      `Read for the verb: “gives away … left” means take away (subtract); “in all” means join together (add). Your story uses ${subtract ? "taking away" : "joining"}.`,
      chips([a, b]),
      [a, b],
    ),
    step(
      subtract ? "Subtract the part that leaves" : "Add the two groups",
      subtract
        ? `Line up ${fmt(a)} and ${fmt(b)} and subtract, borrowing whenever the top digit in a column is smaller.`
        : `Line up ${fmt(a)} and ${fmt(b)} and add, carrying whenever a column reaches 10.`,
      numberLine(0, subtract ? a : a + b, [a]),
      [a, b],
    ),
    step(
      "Sense-check the size",
      `The answer should be ${subtract ? "smaller than" : "bigger than"} ${fmt(a)}. If it is not, re-read the story — the operation is probably flipped.`,
      chips([a, b]),
      [a, b],
    ),
    tryItStep(p, [a, b]),
  ];
}

function lessonMultiply10s(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/(\d+)\s*×\s*(\d+)/);
  const nums = allNumbers(p.text);
  const n = m ? Number(m[1]) : (nums[0] ?? 0);
  const k = m ? Number(m[2]) : (nums[1] ?? 10);
  const zeros = Math.max(String(k).length - 1, 1);
  return [
    step(
      `Multiplying by ${k} shifts every digit`,
      `${n} × ${k}: every digit of ${n} becomes ${k} times bigger, so each one slides ${zeros} place${zeros === 1 ? "" : "s"} to the left. A zero appears at the end.`,
      chips([n, k]),
      [n, k],
    ),
    step(
      "Do the easy multiplication first",
      `Multiply ${n} by ${k / 10} — that part is quick — then shift one more place left to finish. Multiplying by a power of ten never changes the digits, only their place.`,
      chips([n, k / 10]),
      [n, k],
    ),
    step(
      "Write the digits, then the zeros",
      `Write the digits of ${n}, then add ${zeros} zero${zeros === 1 ? "" : "s"} on the end. Check with an estimate: a number times ${k} should be about ${k} times bigger.`,
      numberLine(0, Math.max(n * k, n + 1), [n], `${n} × ${k}`),
      [n, k],
    ),
    tryItStep(p, [n, k]),
  ];
}

function lessonEstimate(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/Estimate\s+(\d+)\s*\+\s*(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const b = m ? Number(m[2]) : (nums[1] ?? 0);
  const ra = Math.round(a / 10) * 10;
  const rb = Math.round(b / 10) * 10;
  return [
    step(
      "Round each number to the nearest ten",
      `Look at the ones digit of ${a} and of ${b}. Five or more rounds up, four or less rounds down — that turns ${a} and ${b} into two easy tens.`,
      chips([a, b, ra, rb]),
      [a, b, ra, rb],
    ),
    step(
      "Add the friendly numbers",
      `Add the two rounded numbers: ${ra} + ${rb}. Tens are easy to add in your head — no carrying, no columns.`,
      numberLine(0, ra + rb, [ra, rb], `estimated sum`),
      [a, b, ra, rb],
    ),
    step(
      "Remember it is an estimate",
      `An estimate is close to the real sum, not exact. The true answer sits near your rounded total — use it to check that a later exact calculation makes sense.`,
      chips([ra, rb]),
      [a, b, ra, rb],
    ),
    tryItStep(p, [a, b]),
  ];
}

function lessonCompareOrder(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/Compare:\s*(\d+)\s*\?\s*(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const b = m ? Number(m[2]) : (nums[1] ?? 0);
  const da = String(a);
  const db = String(b);
  return [
    step(
      "Count the digits first",
      `${fmt(a)} has ${da.length} digits and ${fmt(b)} has ${db.length}. More digits always means a bigger number — check this before anything else.`,
      placeValueModel(da),
      [a, b],
    ),
    step(
      "If the count matches, walk left to right",
      `When both have the same number of digits, compare the leftmost place first: ${da[0]} against ${db[0]}. The first column that differs decides the whole comparison.`,
      placeValueModel(db),
      [a, b],
    ),
    step(
      "Say it with the right symbol",
      `The wide open side of the symbol faces the bigger number; the arrow points at the smaller one. Use = only when every digit matches.`,
      chips([a, b]),
      [a, b],
    ),
    tryItStep(p, [a, b]),
  ];
}

function lessonExpandedForm(p: Problem): LessonStep[] {
  const flat = p.text.replace(/,/g, "");
  const forward = flat.match(/Write (\d+) in expanded form/);
  const reverse = flat.match(/What number is ([\d +]+)\?/);
  if (reverse) {
    const parts = allNumbers(reverse[1]);
    const combined = Number(p.answer);
    return [
      step(
        "Read each part as a place value",
        `The parts are ${parts.join(", ")} — each one is a single digit sitting in its own place: ones, tens, hundreds, thousands … Read them largest first.`,
        chips(parts),
        [...parts, combined],
      ),
      step(
        "Line them up by place",
        `Write the parts in columns so that the ones land under the ones, the tens under the tens, and so on. The biggest part tells you how many digits the answer has.`,
        placeValueModel(String(combined)),
        [...parts, combined],
      ),
      step(
        "Add the parts together",
        `Add the columns from the right, carrying when a column passes 9. The single number you build is the standard form.`,
        chips(parts),
        [...parts, combined],
      ),
      tryItStep(p, [...parts, combined]),
    ];
  }
  const n = forward ? Number(forward[1]) : (allNumbers(p.text)[0] ?? 0);
  const digits = String(n);
  return [
    step(
      "Every digit has a place",
      `Your number is ${fmt(n)}. Each digit's position names its value: rightmost is ones, then tens, then hundreds, then thousands.`,
      placeValueModel(digits),
      [n],
    ),
    step(
      "Turn each digit into its value",
      `Multiply every digit by its place: digit × 1, digit × 10, digit × 100, digit × 1,000 … A digit in the thousands place is worth thousands.`,
      placeValueModel(digits, 0),
      [n],
    ),
    step(
      "Write the parts with + signs",
      `List the values from largest to smallest, joined by + signs, and skip any zero digits — a zero contributes nothing. That list is the expanded form.`,
      placeValueModel(digits),
      [n],
    ),
    tryItStep(p, [n]),
  ];
}

function lessonAddTenthsHundredths(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\/(\d+)\s*\+\s*(\d+)\/(\d+)/);
  const nums = allNumbers(p.text);
  const a = m ? Number(m[1]) : (nums[0] ?? 0);
  const d1 = m ? Number(m[2]) : (nums[1] ?? 10);
  const b = m ? Number(m[3]) : (nums[2] ?? 0);
  const d2 = m ? Number(m[4]) : (nums[3] ?? 100);
  const den = Math.max(d1, d2);
  const t1 = den === d1 ? a : a * (den / d1);
  const t2 = den === d2 ? b : b * (den / d2);
  return [
    step(
      "Tenths and hundredths are related",
      `One tenth splits into ten hundredths: 1/10 = 10/100. So ${d1}ths and ${d2}ths can be rewritten in the same units — the smaller one (${den}ths).`,
      fractionBar(a, d1, { numerator: b, denominator: d2 }),
      [a, d1, b, d2],
    ),
    step(
      `Rewrite the ${d1}ths as ${den}ths`,
      `${a}/${d1} = ${t1}/${den}: multiply top and bottom by ${den / d1}. The value does not change — only the slice size does.`,
      fractionBar(t1, den),
      [a, d1, b, d2, den],
    ),
    step(
      "Add only the tops",
      `Now both fractions have the same bottom: add ${t1} + ${t2} and keep ${den} underneath. Simplify the result if top and bottom share a factor.`,
      fractionBar(t1, den, { numerator: t2, denominator: den }),
      [a, b, den, t1 + t2],
    ),
    tryItStep(p, [a, d1, b, d2]),
  ];
}

function lessonFractionWord(p: Problem): LessonStep[] {
  const fracs = (p.text.match(/(\d+)\/(\d+)/g) ?? []).map((f) => f.split("/").map(Number));
  const nums = allNumbers(p.text);
  const a = fracs[0] ? fracs[0][0] : (nums[0] ?? 0);
  const d = fracs[0] ? fracs[0][1] : (nums[1] ?? 1);
  const b = fracs[1] ? fracs[1][0] : (nums[2] ?? 0);
  const sameBottom = fracs.length > 1 && fracs[0][1] === fracs[1][1];
  const subtract = /is cut off|is eaten|are left\?|left\?/.test(p.text);
  return [
    step(
      "Match the slices",
      `Both fractions in the story use ${sameBottom ? `the same bottom (${d})` : "the bottom you can see"}. Same bottom means same-size slices, so the bottom never changes.`,
      fractionBar(a, d, { numerator: b, denominator: d }),
      [a, d, b],
    ),
    step(
      subtract ? "Subtract only the tops" : "Add only the tops",
      `Work with the top numbers: ${a} ${subtract ? "−" : "+"} ${b}. Keep ${d} underneath — the slice size does not change when you combine amounts.`,
      fractionBar(a, d, { numerator: b, denominator: d }),
      [a, d, b],
    ),
    step(
      "Simplify and answer in the story's units",
      `Simplify the fraction if top and bottom share a factor, then label it with the story's unit (miles, cups, metres). Two questions, one clean answer.`,
      fractionBar(a + (subtract ? -b : b), d),
      [a, d, b, a + (subtract ? -b : b)],
    ),
    tryItStep(p, [a, d, b]),
  ];
}

function lessonUnitConvert(p: Problem): LessonStep[] {
  const flat = p.text.replace(/,/g, "");
  const simple = flat.match(/How many (.+?) are in (\d+) (.+?)\?/);
  const twoPart = flat.match(/(\d+) (.+?) and (\d+) (.+?) is how many (.+?) in all\?/);
  const nums = allNumbers(p.text);
  const n = simple ? Number(simple[2]) : twoPart ? Number(twoPart[1]) : (nums[0] ?? 0);
  const extra = twoPart ? Number(twoPart[3]) : 0;
  const to = simple ? simple[1] : twoPart ? twoPart[5] : "the smaller unit";
  const from = simple ? simple[3] : twoPart ? twoPart[2] : "the bigger unit";
  const total = Number(p.answer);
  const factor = n > 0 ? Math.round((total - extra) / n) : 0;
  return [
    step(
      "Bigger unit or smaller unit?",
      `You are given ${n} ${from} and asked for ${to}. Going from a bigger unit to a smaller unit ALWAYS means multiplying — many small units fit inside one big one.`,
      chips(extra > 0 ? [n, extra] : [n]),
      extra > 0 ? [n, extra] : [n],
    ),
    step(
      "Find the conversion fact",
      `Every one of those ${from} is worth ${factor} ${to}. That fact — 1 of the bigger unit = ${factor} of the smaller — is the key you multiply by.`,
      chips([factor]),
      [n, factor],
    ),
    step(
      extra > 0 ? "Multiply, then add the extra" : "Multiply to convert",
      extra > 0
        ? `Multiply ${n} by ${factor} to convert the first part, then add the ${extra} ${to} that were already there. Both parts are now in ${to}.`
        : `Multiply ${n} by ${factor} — that many ${to} fit inside ${n} ${from}. The conversion fact does all the work.`,
      numberLine(0, Math.max(total, 1), [n], `${n} ${from} in ${to}`),
      extra > 0 ? [n, factor, extra] : [n, factor],
    ),
    tryItStep(p, extra > 0 ? [n, extra] : [n]),
  ];
}

function lessonMoney(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/buys (\d+) .+? for \$([\d.]+) each/);
  const nums = allNumbers(p.text);
  const qty = m ? Number(m[1]) : (nums[0] ?? 0);
  const price = m ? Number(m[2]) : (nums[1] ?? 0);
  const cents = Math.round(price * 100);
  const rounded = Math.round(price);
  return [
    step(
      "Same price, several times",
      `${qty} items at $${price} each is repeated addition: $${price} added ${qty} times. Multiplying gets there much faster.`,
      chips([qty, price]),
      [qty, price],
    ),
    step(
      "Multiply with the point ignored",
      `Treat $${price} as ${cents} cents. Work out ${qty} × ${cents} as a whole-number multiplication, then give the answer two decimal places.`,
      chips([qty, cents]),
      [qty, price, cents],
    ),
    step(
      "Place the point and check the size",
      `Count two places from the right and drop the decimal point in. Sanity-check: $${price} is about $${rounded} each, so the total should be near ${qty} × $${rounded} — bigger, not smaller.`,
      barGraph([cents, qty], `${qty} × ${cents} cents`),
      [qty, price, cents],
    ),
    tryItStep(p, [qty, price]),
  ];
}

function lessonLinePlots(p: Problem): LessonStep[] {
  const entries: { count: number; raw: string; value: number }[] = [];
  const entry = /(\d+) at ([\d/]+)/g;
  for (let hit = entry.exec(p.text); hit; hit = entry.exec(p.text)) {
    entries.push({ count: Number(hit[1]), raw: hit[2], value: fractionValue(hit[2]) });
  }
  const counts = entries.map((e) => e.count);
  const nums = allNumbers(p.text);
  const unit = p.text.includes("centimeters") ? "cm" : "inches";
  return [
    step(
      "Read the stacks on the line plot",
      `Each entry says "how many at which length": ${entries.map((e) => `${e.count} at ${e.raw}`).join(", ")}. The length is the position; the count is the height of the stack.`,
      barGraph(counts, `how many items at each length`, unit),
      nums.length ? [...nums] : counts,
    ),
    step(
      "Each stack is repeated addition",
      `A stack of ${entries[0] ? entries[0].count : 0} items at ${entries[0] ? entries[0].raw : "one length"} means that length added that many times — the same as multiplying the count by the length.`,
      barGraph(counts, `count × length for each stack`, unit),
      nums.length ? [...nums] : counts,
    ),
    step(
      "Add the stacks over a common denominator",
      `Rewrite every length with the same denominator, add the tops, then simplify. The total is the sum of all the measurements in the plot.`,
      numberLine(0, 1, [0.5], `every length lives here`),
      nums.length ? [...nums] : counts,
    ),
    tryItStep(p, nums.length ? nums : counts),
  ];
}

function lessonAngles(p: Problem): LessonStep[] {
  const sub = p.text.match(/A (\d+)° angle is split into two parts\. One part measures (\d+)°/);
  const add = p.text.match(/An angle is split into (\d+) parts measuring (\d+)° \+ (\d+)°/);
  const nums = allNumbers(p.text);
  const whole = sub ? Number(sub[1]) : (nums[0] ?? 0);
  const part = sub ? Number(sub[2]) : add ? Number(add[2]) : (nums[1] ?? 0);
  const second = add ? Number(add[3]) : 0;
  const marked = sub ? [whole, part] : add ? [part, second] : [...nums];
  return [
    step(
      "Parts make the whole angle",
      sub
        ? `Angles that share a vertex and a side snap together: the two parts add up to the whole ${whole}°, and one part measures ${part}°.`
        : `Angles that share a vertex and a side snap together: these parts measure ${part}° and ${second}°, and together they make the whole angle.`,
      angleModel(sub ? whole : part),
      [...marked],
    ),
    step(
      sub ? "Subtract to find the missing part" : "Add the parts together",
      sub
        ? `Take the known part away from the whole: ${whole}° − ${part}°. The difference is the part you could not see.`
        : `Add the parts: ${part}° + ${second}°. The total is the whole angle at the vertex.`,
      chips(sub ? [whole, part] : [part, second]),
      [...marked],
    ),
    step(
      "Check the parts rebuild the whole",
      sub
        ? `Add your answer back to ${part}° — it must land exactly on ${whole}°. If it does not, the subtraction slipped a column.`
        : `Compare your total with a right angle (90°) and a straight angle (180°) to sense-check the size.`,
      angleModel(90),
      [...marked],
    ),
    tryItStep(p, [...marked]),
  ];
}

function lessonAreaPerimeterWord(p: Problem): LessonStep[] {
  const m = p.text.replace(/,/g, "").match(/rectangular \w+ is (\d+) meters long and (\d+) meters wide/);
  const nums = allNumbers(p.text);
  const l = m ? Number(m[1]) : (nums[0] ?? 0);
  const w = m ? Number(m[2]) : (nums[1] ?? 0);
  const perimeter = /fence|around it|go all the way around/.test(p.text);
  return [
    step(
      "Read what the question wants",
      `Fence around the outside asks for perimeter (plain meters). Covering the inside asks for area (square meters). Your story asks for ${perimeter ? "the distance around" : "the space inside"}.`,
      perimeter ? polygonModel(4, false, `${l} m by ${w} m`) : areaModel(l, w, `${l} m by ${w} m`),
      [l, w],
    ),
    step(
      perimeter ? "Walk the four sides" : "Count the square meters",
      perimeter
        ? `Walk the edge: ${l} + ${w} + ${l} + ${w}. Opposite sides match, so it is 2 × (${l} + ${w}).`
        : `The rectangle is ${l} squares long and ${w} squares wide, so it holds ${l} rows of ${w} squares.`,
      perimeter ? polygonModel(4, false, `2 × (${l} + ${w})`) : areaModel(l, w),
      [l, w],
    ),
    step(
      perimeter ? "Add, then double" : "Multiply length by width",
      perimeter
        ? `Add one long and one short side, then double it. The answer is a length: plain meters.`
        : `Multiply length × width to count every square. The answer is in square meters.`,
      perimeter ? polygonModel(4, false) : areaModel(l, w),
      [l, w],
    ),
    tryItStep(p, [l, w]),
  ];
}

function lessonPointsLines(p: Problem): LessonStep[] {
  return [
    step(
      "Picture each figure",
      `A point is a location with no size. A line goes on forever both ways. A ray has one endpoint and goes on forever one way. A line segment has two endpoints and can be measured.`,
      null,
      [],
    ),
    step(
      "Hunt for the clue words",
      `Read the clue and pick out two things: how many endpoints it has, and whether it ends at all. "Forever" rules out measuring; "two endpoints" rules out rays.`,
      null,
      [],
    ),
    step(
      "Match the clue to the name",
      `No endpoints and no end = line. One endpoint going one way = ray. Two endpoints you can measure = line segment. No size at all = point.`,
      null,
      [],
    ),
    tryItStep(p, []),
  ];
}

function lessonQuadrilaterals(p: Problem): LessonStep[] {
  return [
    step(
      "Every quadrilateral has 4 sides",
      `"Quad" means four: a quadrilateral always has 4 sides and 4 angles. The shape's name comes from what is special about those sides and angles.`,
      polygonModel(4, false, "4 sides, 4 angles"),
      allNumbers(p.text),
    ),
    step(
      "Read the clues: angles and parallel sides",
      `Look for two clues: are the angles square corners (right angles), and how many pairs of opposite sides run parallel without meeting? Clues like "all four equal" or "exactly one pair" are the giveaway.`,
      polygonModel(4, false, "count right angles and parallel pairs"),
      allNumbers(p.text),
    ),
    step(
      "Match the clue to the name",
      `4 right angles + all sides equal = square. 4 right angles with only opposite sides equal = rectangle. Exactly one pair of parallel sides = trapezoid. Both pairs parallel with no right angles = parallelogram.`,
      polygonModel(4, false),
      allNumbers(p.text),
    ),
    tryItStep(p, allNumbers(p.text)),
  ];
}

function lessonCoordinateIntro(p: Problem): LessonStep[] {
  const m = p.text.match(/is\s+(\d+)\s+units to the right and\s+(\d+)\s+units up/);
  const nums = allNumbers(p.text);
  const x = m ? Number(m[1]) : (nums[0] ?? 0);
  const y = m ? Number(m[2]) : (nums[1] ?? 0);
  const points: GridPoint[] = [{ x, y }];
  const max = Math.max(x, y, 1);
  return [
    step(
      "x comes first: count right",
      `The first number of a coordinate counts steps RIGHT along the floor from the origin (0, 0). That is the "right" part of the clue.`,
      coordinateModel(points, max),
      [x, y],
    ),
    step(
      "y comes second: count up",
      `The second number counts steps UP the wall. Right first, up second — the order never swaps, and the origin is where you start.`,
      coordinateModel(points, max),
      [x, y],
    ),
    step(
      "Write the pair in order",
      `Walk the floor, then the wall. Write the rightward count first, a comma, then the upward count — (x, y) is just "across, then up" in symbols.`,
      coordinateModel(points, max),
      [x, y],
    ),
    tryItStep(p, [x, y]),
  ];
}

function lessonQuadHierarchy(p: Problem): LessonStep[] {
  return [
    step(
      "Start with the biggest family",
      `Parallelograms are the big family: both pairs of opposite sides are parallel. Squares, rectangles, and rhombuses all have that property, so they all belong inside it.`,
      polygonModel(4, false, "both pairs of sides parallel"),
      allNumbers(p.text),
    ),
    step(
      "Extra rules make smaller families",
      `A rectangle adds "4 right angles". A rhombus adds "4 equal sides". A square adds BOTH rules, so a square is a rectangle AND a rhombus at the same time.`,
      polygonModel(4, false, "extra rules shrink the family"),
      allNumbers(p.text),
    ),
    step(
      "Check both directions",
      `For "is every A a B?", ask whether A has everything B requires. Every square has four right angles, so yes — but not every rectangle has four equal sides, so no. One counterexample makes the answer no.`,
      polygonModel(4, false),
      allNumbers(p.text),
    ),
    tryItStep(p, allNumbers(p.text)),
  ];
}

/* ---------- registry ---------- */

const BUILDERS: Record<string, (p: Problem) => LessonStep[]> = {
  "bt-add-multidigit": lessonAdd,
  "bt-sub-multidigit": lessonSub,
  "oa-mult-1digit": lessonMultFacts,
  "oa-mult-digit-1digit": lessonMultDigit,
  "oa-div-facts": lessonDivFacts,
  "oa-div-1digit-divisor": lessonDivRemainder,
  "fr-equiv": lessonEquiv,
  "fr-add-like": lessonAddLike,
  "fr-sub-like": lessonSubLike,
  "fr-compare-decimals": lessonCompareDecimals,
  "md-area": lessonArea,
  "md-perimeter": lessonPerimeter,
  "bt-place-value": lessonPlaceValue,
  "bt-rounding": lessonRounding,
  "fr-add-unlike-5": lessonAddUnlike,
  "fr-sub-unlike-5": lessonSubUnlike,
  "fr-mult-whole-adv": lessonMultWholeAdv,
  "bt-dec-add-sub": lessonDecAddSub,
  "bt-dec-mult-pow10": lessonDecMultPow10,
  "md-volume": lessonVolume,
  "oa-order-ops": lessonOrderOps,
  "geo-coord-plane": lessonCoordPlane,
  "geo-angles-types": lessonAngleTypes,
  "geo-triangles": lessonTriangles,
  "geo-symmetry": lessonSymmetry,
  "md-time": lessonElapsedTime,
  "fr-mixed-numbers": lessonFractionNumberLine,
  "fr-decimals-tenths": lessonDecimalPlaceValue,
  "geo-composite-shapes": lessonCompositePerimeter,
  "oa-multistep-word": lessonMultistepWord,
  "fr-compare": lessonCompareFractions,
  "oa-mult-2digit-2digit": lessonMultTwoDigit,
  "oa-factor-pairs": lessonFactorPairs,
  "oa-multiples-prime": lessonMultiplesPrime,
  "oa-patterns": lessonPatterns,
  "oa-remainders": lessonRemainders,
  "oa-multistep-frac": lessonMultistepFrac,
  "oa-expressions": lessonExpressions,
  "bt-add-sub-word": lessonAddSubWord,
  "bt-multiply-10s": lessonMultiply10s,
  "bt-estimate": lessonEstimate,
  "bt-compare-order": lessonCompareOrder,
  "bt-expanded-form": lessonExpandedForm,
  "fr-add-unlike-10-100": lessonAddTenthsHundredths,
  "fr-mult-fraction-whole": lessonMultWholeAdv,
  "fr-fraction-word": lessonFractionWord,
  "md-length-convert": lessonUnitConvert,
  "md-mass-capacity": lessonUnitConvert,
  "md-money": lessonMoney,
  "md-line-plots": lessonLinePlots,
  "md-angles": lessonAngles,
  "md-area-perimeter-word": lessonAreaPerimeterWord,
  "geo-points-lines": lessonPointsLines,
  "geo-quadrilaterals": lessonQuadrilaterals,
  "geo-coordinate-intro": lessonCoordinateIntro,
  "geo-quad-hierarchy": lessonQuadHierarchy,
};

const TITLES: Record<string, string> = {
  "bt-add-multidigit": "Adding big numbers, one column at a time",
  "bt-sub-multidigit": "Subtracting big numbers with borrowing",
  "oa-mult-1digit": "Multiplication facts from groups",
  "oa-mult-digit-1digit": "Breaking big multiplications apart",
  "oa-div-facts": "Division facts from multiplication",
  "oa-div-1digit-divisor": "Division with remainders",
  "fr-equiv": "Equivalent fractions that scale together",
  "fr-add-like": "Adding fractions with the same bottom",
  "fr-sub-like": "Subtracting fractions with the same bottom",
  "fr-compare-decimals": "Comparing decimals digit by digit",
  "md-area": "Area: counting squares",
  "md-perimeter": "Perimeter: walking the edges",
  "bt-place-value": "Place value: every digit has an address",
  "bt-rounding": "Rounding to the nearest neighbor",
  "fr-add-unlike-5": "Adding fractions with different bottoms",
  "oa-order-ops": "Order of operations: what goes first",
  "geo-coord-plane": "Coordinates: right first, then up",
  "geo-angles-types": "Angle types: acute, right, or obtuse",
  "geo-triangles": "Classifying triangles by sides and angles",
  "geo-symmetry": "Lines of symmetry",
  "md-time": "Elapsed time in minutes",
  "fr-mixed-numbers": "Fractions on the number line",
  "fr-decimals-tenths": "Decimal place value: what each digit is worth",
  "geo-composite-shapes": "Perimeter of L-shapes",
  "oa-multistep-word": "Two-step word problems",
  "fr-compare": "Comparing fractions with pictures",
  "fr-sub-unlike-5": "Subtracting fractions with different bottoms",
  "fr-mult-whole-adv": "Multiplying a fraction by a whole number",
  "bt-dec-add-sub": "Adding and subtracting decimals",
  "bt-dec-mult-pow10": "Multiplying decimals by 10, 100, 1000",
  "md-volume": "Volume: counting cubes",
  "oa-mult-2digit-2digit": "Multiplying two-digit numbers in two easy steps",
  "oa-factor-pairs": "Factor pairs: finding the missing factor",
  "oa-multiples-prime": "Prime or composite? Testing the divisors",
  "oa-patterns": "Number patterns: find the rule, then jump again",
  "oa-remainders": "Remainders in real stories",
  "oa-multistep-frac": "Two-step problems with fractions",
  "oa-expressions": "Turning words into expressions",
  "bt-add-sub-word": "Add or subtract? Reading the story",
  "bt-multiply-10s": "Multiplying by 10, 100, and 1000",
  "bt-estimate": "Estimating by rounding first",
  "bt-compare-order": "Comparing big numbers place by place",
  "bt-expanded-form": "Expanded form: every digit's value",
  "fr-add-unlike-10-100": "Adding tenths and hundredths",
  "fr-mult-fraction-whole": "Multiplying a fraction by a whole number",
  "fr-fraction-word": "Fraction stories with matching slices",
  "md-length-convert": "Converting units of length",
  "md-mass-capacity": "Grams, kilograms, liters, and milliliters",
  "md-money": "Money: multiply, then place the point",
  "md-line-plots": "Reading a line plot",
  "md-angles": "Angles joined and split apart",
  "md-area-perimeter-word": "Area or perimeter? Read the question",
  "geo-points-lines": "Points, lines, rays, and segments",
  "geo-quadrilaterals": "Naming quadrilaterals from their clues",
  "geo-coordinate-intro": "Plotting a point in the first quadrant",
  "geo-quad-hierarchy": "The quadrilateral family tree",
};

export const LESSON_SKILLS: string[] = Object.keys(BUILDERS);

export function isLessonSupported(skill: string): boolean {
  return skill in BUILDERS;
}

/** Stable 32-bit hash of the failed problem — the seed for its fresh check. */
function seedFrom(problem: Problem): number {
  const key = `${problem.skill}|${problem.text}|${problem.answer}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  }
  return (hash >>> 0) || 1;
}

/**
 * A DIFFERENT problem of the same skill, minted deterministically. The student
 * must transfer the method to new numbers instead of copying an answer out of
 * the teaching steps. Unknown skills (no generator) keep the failed problem.
 */
function freshCheckProblem(problem: Problem): Problem {
  if (!ALL_SKILLS.includes(problem.skill)) return problem;
  const base = seedFrom(problem);
  let candidate = generateProblem(problem.skill, base, DEFAULT_LEVEL);
  for (let attempt = 1; attempt <= 8 && candidate.text === problem.text; attempt++) {
    candidate = generateProblem(problem.skill, (base + attempt * 7919) >>> 0, DEFAULT_LEVEL);
  }
  return candidate;
}

/**
 * Build a deterministic worked lesson from the ACTUAL failed problem.
 * Pure function of `problem` — no randomness, JSON-serializable output.
 * Steps teach the method on the failed numbers; the final step hands the
 * student a fresh problem of the same skill to prove the transfer.
 */
export function buildLesson(problem: Problem): Lesson {
  const builder = BUILDERS[problem.skill] ?? lessonFallback;
  const steps = builder(problem);
  return {
    skill: problem.skill,
    title: TITLES[problem.skill] ?? "Let's work through it together",
    problemText: problem.text,
    steps,
    checkProblem: freshCheckProblem(problem),
  };
}
