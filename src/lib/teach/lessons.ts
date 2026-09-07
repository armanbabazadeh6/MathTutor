import type { Problem } from "../math/types";

/** Visual scaffold for a step. Rendered by TeachView; plain data only. */
export type LessonVisual = "text" | "number-line" | "break-apart";

export interface LessonStep {
  title: string;
  body: string;
  visual: LessonVisual;
  /** Numbers from the ACTUAL failed problem used in this step. */
  workedNumbers: number[];
}

export interface Lesson {
  skill: string;
  title: string;
  problemText: string;
  steps: LessonStep[];
  /** The check problem the student answers in the final Try-it step. */
  checkProblem: Problem;
}

/** Thousands-separated display; matches generator fmt. */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function num(tok: string): number {
  return Number(tok.replace(/,/g, ""));
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

function tryItStep(problem: Problem, nums: number[], prompt?: string): LessonStep {
  return {
    title: "Your turn — try it",
    body: prompt ?? `Now you finish it: ${problem.text}`,
    visual: "text",
    workedNumbers: nums.length ? nums : allNumbers(problem.text + " " + problem.answer),
  };
}

function step(title: string, body: string, visual: LessonVisual, workedNumbers: number[]): LessonStep {
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
      "break-apart",
      [a, b],
    ),
    step(
      "Add each place, right to left",
      `Start with the ones: ${ao} + ${bo} = ${ao + bo}. Then add the tens, then the hundreds. One small column at a time — never the whole number at once.`,
      "break-apart",
      [a, b, ao + bo],
    ),
    step(
      "Regroup when a column hits 10",
      `Whenever a column makes 10 or more, carry 1 to the next column. For ${fmt(a)} + ${fmt(b)}, keep moving left and carrying until every column is done.`,
      "text",
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
      "text",
      [a, b],
    ),
    step(
      "Start with the ones column",
      `Ones: ${ao} − ${bo}. ${needBorrow ? `The top (${ao}) is smaller, so borrow 1 ten from ${fmt(a)} first — then subtract.` : `The top (${ao}) is big enough, so just subtract.`}`,
      "break-apart",
      [a, b],
    ),
    step(
      "Work left, borrowing as needed",
      `Move one column left and repeat for ${fmt(a)} − ${fmt(b)}: whenever the top digit is smaller, borrow 1 from the next column, then subtract.`,
      "text",
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
      "text",
      [a, b],
    ),
    step(
      "Use a helper fact",
      `Do ${a} × ${b - 1} = ${a * (b - 1)} first (one less group), then add one more group of ${a}. Facts you know build facts you don't.`,
      "number-line",
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
  return [
    step(
      `Break apart ${fmt(a)}`,
      `${fmt(a)} = ${fmt(base)} + ${rest}. Multiplying one big number is hard — multiplying two small piles is easy.`,
      "break-apart",
      [a, b, base, rest],
    ),
    step(
      "Multiply each part",
      `First pile: ${b} × ${fmt(base)} = ${fmt(b * base)}. Second pile: ${b} × ${rest} = ${fmt(b * rest)}. Write both partial products down.`,
      "break-apart",
      [a, b, b * base, b * rest],
    ),
    step(
      "Add the piles",
      `${fmt(b * base)} + ${fmt(b * rest)} = ${fmt(a * b)}. Add the two partial products and the big multiplication is done.`,
      "text",
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
  return [
    step(
      "Flip it into multiplication",
      `${n} ÷ ${d} asks: ${d} times WHAT equals ${n}? Division is just multiplication with a missing piece.`,
      "text",
      [n, d],
    ),
    step(
      `Count up by ${d}`,
      `Skip-count: ${d}, ${2 * d}, ${3 * d} … until you land on ${n}. How many jumps did that take? That count is your answer.`,
      "number-line",
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
      `How many full groups of ${d} fit inside ${fmt(n)}? Try ${d} × ${q} = ${fmt(big)}. That is the biggest multiple still below ${fmt(n)}.`,
      "text",
      [n, d, big],
    ),
    step(
      "Subtract to find the leftover",
      `${fmt(n)} − ${fmt(big)} = ${r}. After filling ${q} full groups of ${d}, ${r} is left over — that leftover is the remainder.`,
      "break-apart",
      [n, d, big, r],
    ),
    step(
      "Check: remainder must be smaller",
      `A remainder must always be less than the divisor: ${r} < ${d}. If it were ${d} or more, you could fill one more group.`,
      "text",
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
  const k = D / d;
  return [
    step(
      "What changed on the bottom?",
      `Your fraction is ${n}/${d} and the new bottom is ${D}. Since ${d} × ${Number.isInteger(k) ? k : "?"} = ${D}, the bottom was scaled up.`,
      "text",
      [n, d, D],
    ),
    step(
      "Do the exact same thing on top",
      `Equivalent fractions scale top and bottom equally: ? = ${n} × ${Number.isInteger(k) ? k : `(new bottom ÷ ${d})`}. Whatever multiplies the bottom must multiply the top.`,
      "break-apart",
      [n, d, D],
    ),
    step(
      "Picture the slices",
      `Cutting each of the ${d} slices of ${n}/${d} into smaller equal pieces gives ${D} tiny slices — but it is still the same amount of pie. Same pie, more slices.`,
      "text",
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
      "text",
      [a, b, d],
    ),
    step(
      "Add only the tops",
      `${a} + ${b} = ${a + b}, so you get ${a + b}/${d}. Count the slices: ${a} slices plus ${b} slices.`,
      "break-apart",
      [a, b, d, a + b],
    ),
    step(
      "Simplify if you can",
      `Can ${a + b}/${d} simplify? If top and bottom share a factor, divide both by it. If not, ${a + b}/${d} is already finished.`,
      "text",
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
      "text",
      [a, b, d],
    ),
    step(
      "Subtract only the tops",
      `${a} − ${b} = ${a - b}, so you get ${a - b}/${d}. Take away ${b} slices from ${a} slices.`,
      "break-apart",
      [a, b, d, a - b],
    ),
    step(
      "Simplify if you can",
      `Can ${a - b}/${d} simplify? If top and bottom share a factor, divide both by it. Otherwise ${a - b}/${d} is done.`,
      "text",
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
      "number-line",
      [x, y],
    ),
    step(
      "Compare the tenths first",
      `Tenths: ${x} has ${xt}, ${y} has ${yt}. ${xt === yt ? "They tie — so the tenths round decides nothing and you must look further right." : `Bigger tenths digit wins right here, no matter what comes after.`}`,
      "number-line",
      [x, y],
    ),
    step(
      "Break ties with the hundredths",
      `If the tenths tie, compare the hundredths column of ${x} and ${y}. The first column from the left that differs decides the whole number.`,
      "number-line",
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
      "text",
      [l, w],
    ),
    step(
      "Stack the rows",
      `There are ${w} rows of ${l}. Skip-count by ${l}, ${w} times: that repeated addition is the same as ${l} × ${w}.`,
      "break-apart",
      [l, w],
    ),
    step(
      "Multiply length × width",
      `Area = length × width, so ${l} × ${w}. Answer in square centimeters — squares, not plain cm.`,
      "text",
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
      "text",
      [l, w],
    ),
    step(
      "Opposite sides match",
      `Add one long and one short side first: ${l} + ${w} = ${l + w}. The other pair is identical, so double it: 2 × ${l + w}.`,
      "break-apart",
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
  return [
    step(
      "Label digits from the right",
      `Your number is ${fmt(n)}. Starting at the right, label: ones, tens, hundreds, thousands … Each step left is 10× bigger.`,
      "text",
      [n, digit],
    ),
    step(
      `Zoom into the ${place} place`,
      `Count ${exp} step(s) left from the ones digit of ${fmt(n)}. The digit sitting there is ${digit} — circle it.`,
      "break-apart",
      [n, digit],
    ),
    step(
      "What is that digit worth?",
      `A ${digit} in the ${place} place is really worth ${fmt(value)}. The position gives the digit its power.`,
      "text",
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
      "number-line",
      [n, lo, hi],
    ),
    step(
      "Look at the digit next door",
      `The digit just right of the ${place}s place is ${deciding}. Rule: 5 or more rounds UP, 4 or less rounds DOWN.`,
      "number-line",
      [n, lo, hi],
    ),
    step(
      "Pick the closer neighbor",
      `Is ${fmt(n)} closer to ${fmt(lo)} or ${fmt(hi)}? Walk it on the number line — the shorter walk wins.`,
      "number-line",
      [n, lo, hi],
    ),
    tryItStep(p, [n, lo, hi]),
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
      "text",
      [...shown],
    ),
    step(
      "Break it into tiny pieces",
      `Take the first number, ${first}, and ask: what do I know about it? Solve one tiny piece at a time instead of the whole thing at once.`,
      "break-apart",
      [...shown],
    ),
    step(
      "Estimate, then solve exactly",
      `Guess roughly first using ${first}, then work it out exactly and check: does your answer feel close to the guess?`,
      "number-line",
      [...shown],
    ),
    tryItStep(p, [...shown]),
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
};

export const LESSON_SKILLS: string[] = Object.keys(BUILDERS);

export function isLessonSupported(skill: string): boolean {
  return skill in BUILDERS;
}

/**
 * Build a deterministic worked lesson from the ACTUAL failed problem.
 * Pure function of `problem` — no randomness, JSON-serializable output.
 * Steps teach toward the answer; the final step asks the student to finish.
 */
export function buildLesson(problem: Problem): Lesson {
  const builder = BUILDERS[problem.skill] ?? lessonFallback;
  const steps = builder(problem);
  return {
    skill: problem.skill,
    title: TITLES[problem.skill] ?? "Let's work through it together",
    problemText: problem.text,
    steps,
    checkProblem: problem,
  };
}
