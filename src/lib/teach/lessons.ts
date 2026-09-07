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
      "text",
      [a, d1, b, d2],
    ),
    step(
      "Rebuild each fraction",
      `${a}/${d1} = ${t1}/${den} (top and bottom both × ${d2}) and ${b}/${d2} = ${t2}/${den} (top and bottom both × ${d1}). Same amount of pie, new slice sizes.`,
      "break-apart",
      [a, d1, b, d2, den],
    ),
    step(
      "Add only the new tops",
      `${t1} + ${t2} = ${t1 + t2}, so you get ${t1 + t2}/${den}. The shared bottom (${den}) stays — never add the bottoms. Simplify if top and bottom share a factor.`,
      "break-apart",
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
      "text",
      [a, d1, b, d2],
    ),
    step(
      "Rebuild each fraction",
      `${a}/${d1} = ${t1}/${den} (top and bottom both × ${d2}) and ${b}/${d2} = ${t2}/${den} (top and bottom both × ${d1}). Same amount of pie, new slice sizes.`,
      "break-apart",
      [a, d1, b, d2, den],
    ),
    step(
      "Subtract only the new tops",
      `${t1} − ${t2} = ${t1 - t2}, so you get ${t1 - t2}/${den}. The shared bottom (${den}) stays — never subtract the bottoms. Simplify if top and bottom share a factor.`,
      "break-apart",
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
      "text",
      [a, d, w],
    ),
    step(
      "Multiply only the top",
      `Copies pile up slices but never change the slice size: (${a} × ${w})/${d} = ${top}/${d}. The bottom stays ${d} — only the top grows.`,
      "break-apart",
      [a, d, w, top],
    ),
    step(
      "Simplify, and spill past one whole if you can",
      `Look at ${top}/${d}: if the top is as big as the bottom, that is a whole or more. Divide top and bottom by any shared factor to finish.`,
      "text",
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
      "number-line",
      [x, y],
    ),
    step(
      plus ? "Add hundredths, then tenths" : "Subtract hundredths, then tenths",
      `Think in hundredths: ${x} is ${cx} hundredths and ${y} is ${cy} hundredths. ${cx} ${op} ${cy} = ${plus ? cx + cy : cx - cy} hundredths — plain whole-number work once the dots line up.`,
      "break-apart",
      [x, y, cx, cy],
    ),
    step(
      "Drop the point straight down",
      `The answer's decimal point sits exactly under the lined-up points of ${x} and ${y}. ${plus ? "Carry" : "Borrow"} between columns exactly like whole numbers, then place the point.`,
      "number-line",
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
  const zeros = String(k).length - 1;
  const places = zeros === 1 ? "one place" : `${zeros} places`;
  const cents = Math.round(x * 100);
  return [
    step(
      `Multiplying by ${k} shifts every digit`,
      `Your problem is ${x} × ${k}. Multiplying by ${k} makes every digit ${k}× bigger, so the point slides ${places} to the right. No column work needed — just shift.`,
      "text",
      [x, k],
    ),
    step(
      "See it as hundredths",
      `${x} is ${cents} hundredths. ${cents} × ${k} = ${cents * k} hundredths — whole-number multiplication with no point to lose track of.`,
      "break-apart",
      [x, k, cents],
    ),
    step(
      "Shift the point and read it",
      `Slide each digit of ${x} left by ${places}: the point lands ${places} to the right. Read the new number — that shift IS the multiplication by ${k}.`,
      "number-line",
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
      "text",
      [l, w, h],
    ),
    step(
      "Cover the bottom layer",
      `One layer holds ${l} × ${w} = ${base} cubes — a full rectangle of cubes, one cube tall. Count that flat layer first.`,
      "break-apart",
      [l, w, h, base],
    ),
    step(
      "Stack the layers",
      `There are ${h} layers of ${base}. Volume = ${base} × ${h} — and the answer is in cubic centimeters (cubes, not flat squares).`,
      "break-apart",
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
        "text",
        [a, b, c],
      ),
      step(
        "Solve inside the box",
        `(${a} + ${b}) = ${s}. Cover the box with ${s} and the problem shrinks to just ${s} × ${c}.`,
        "break-apart",
        [a, b, c, s],
      ),
      step(
        "Finish the multiplication",
        `Now multiply ${s} × ${c} to finish — that last product is the whole answer. Parentheses first, then ×.`,
        "text",
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
      "text",
      [a, b, c],
    ),
    step(
      "Do the × part first",
      `${b} × ${c} = ${prod}. Cover that with ${prod} and the problem shrinks to ${a} + ${prod} — one easy addition left.`,
      "break-apart",
      [a, b, c, prod],
    ),
    step(
      "Add last",
      `Finish with ${a} + ${prod}. Adding first would give the wrong answer — order matters, so × always goes before +.`,
      "text",
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
      `Point A is ${x} right and ${y} up from (0, 0). The FIRST number (x) always counts steps right along the floor — so x = ${x}.`,
      "text",
      [x, y],
    ),
    step(
      "y counts the climb up",
      `The SECOND number (y) counts steps up the wall: ${y} up means y = ${y}. Right first, up second — that order never swaps.`,
      "number-line",
      [x, y],
    ),
    step(
      "Walk it from the origin",
      `Start at (0, 0): march right ${x} to (${x}, 0), then climb up ${y} to (${x}, ${y}). Coordinates are written x, y — floor steps, then wall steps.`,
      "break-apart",
      [x, y],
    ),
    tryItStep(p, [x, y]),
  ];
}

function lessonAngleTypes(p: Problem): LessonStep[] {
  const m = p.text.match(/(\d+)\s*degrees/);
  const nums = allNumbers(p.text);
  const deg = m ? Number(m[1]) : (nums[0] ?? 0);
  const kind = p.answer.toLowerCase();
  return [
    step(
      "A square corner is the dividing line",
      `Your angle is ${deg} degrees. Hold it against a square corner (exactly 90 degrees): is yours sharper and smaller, exactly the same, or wider? That one comparison decides everything.`,
      "text",
      [deg],
    ),
    step(
      "Sort it into three boxes",
      `Smaller than 90 is acute (sharp), exactly 90 is right (square corner), between 90 and 180 is obtuse (wide). Your ${deg} degrees lands in the ${kind} box.`,
      "number-line",
      [deg, 90],
    ),
    step(
      "Say why in one sentence",
      `${deg} degrees is ${kind} because ${deg === 90 ? "it equals 90 exactly" : deg < 90 ? `${deg} is less than 90` : `${deg} is more than 90 but less than 180`}. One number, one comparison, one word.`,
      "text",
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
    const matchDesc =
      kind === "equilateral" ? "all three match" : kind === "isosceles" ? "exactly two match" : "none match";
    return [
      step(
        "List the three sides",
        `Your sides are ${a} cm, ${b} cm, and ${c} cm. Write them in a row and draw lines between the ones that are equal.`,
        "text",
        [a, b, c],
      ),
      step(
        "Count the matches",
        `Compare ${a} vs ${b} vs ${c}: ${matchDesc}. All 3 equal is equilateral, exactly 2 equal is isosceles, none equal is scalene.`,
        "break-apart",
        [a, b, c],
      ),
      step(
        "Name it",
        `Since ${matchDesc}, this triangle is ${kind}. Side lengths decide: count matches, then pick the word.`,
        "text",
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
  const kind = p.answer.toLowerCase();
  return [
    step(
      "Find the biggest angle",
      `Your angles are ${x}°, ${y}°, and ${z}°. The biggest one is ${big}° — it decides the triangle's type all by itself.`,
      "text",
      [x, y, z, big],
    ),
    step(
      "Compare the biggest to 90",
      `Is ${big}° below 90 (acute), exactly 90 (right), or above 90 (obtuse)? The whole triangle takes the name of its biggest angle.`,
      "number-line",
      [x, y, z, big],
    ),
    step(
      "Name it",
      `The biggest angle is ${big}°, so this triangle is ${kind}. One comparison, one word — done.`,
      "text",
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
  return [
    step(
      "Fold it in your head",
      `Your shape is a ${shape}. Imagine folding it: a line of symmetry is a fold where both halves land exactly on top of each other.`,
      "text",
      [...wn],
    ),
    step(
      "Count every matching fold",
      lines === 0
        ? `Try every fold of the ${shape} — none makes the halves match, so the count stops at 0. Zero is a real answer.`
        : `Keep folding the ${shape} different ways. Each fold that matches counts once — this shape has ${lines} in all.`,
      "break-apart",
      [...wn],
    ),
    step(
      "Say the count",
      `A ${shape} has ${lines} line${lines === 1 ? "" : "s"} of symmetry. Folds that match: count them, and that count is the answer.`,
      "text",
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
      "number-line",
      [...wn],
    ),
    step(
      "Add the rest of the ride",
      `From that whole hour, count forward to ${endLabel} and add both hops together. Hours turn into 60 minutes each: the total is ${dur} minutes.`,
      "number-line",
      [...wn],
    ),
    step(
      "Check by subtracting",
      `Check it: end minutes minus start minutes equals ${dur}. If the end minutes look smaller, borrow 1 hour as 60 minutes first.`,
      "text",
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
  return [
    step(
      "Name one jump",
      `Each whole from 0 to ${N} is cut into ${d} equal parts, so one tick-jump is 1/${d}. The number line is just ${d}ths marching from 0.`,
      "number-line",
      [N, d, t],
    ),
    step(
      "Count the jumps",
      `The dot sits at tick ${t}, so count ${t} jumps of 1/${d}: that is ${t}/${d}. Ticks count jumps, and jumps name the fraction.`,
      "number-line",
      [N, d, t],
    ),
    step(
      "Simplify if you can",
      `Look at ${t}/${d}: if top and bottom share a factor, divide both by it. If not, ${t}/${d} is already finished.`,
      "text",
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
  return [
    step(
      "Point at the address",
      `Your number is ${m ? m[1] : x}. The first digit after the point lives in tenths, the second in hundredths — find the ${place} digit and circle it.`,
      "text",
      [x, val],
    ),
    step(
      "The address sets the worth",
      `A digit in the ${place} place is worth that digit times ${place === "tenths" ? "1/10" : "1/100"}. Here that works out to ${p.answer}. Position is power.`,
      "break-apart",
      [x, val],
    ),
    step(
      "Say value, not digit",
      `The digit and its value are different things: in ${m ? m[1] : x} the ${place} digit is worth ${p.answer}, not just the digit by itself.`,
      "text",
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
      "text",
      [W, H, a, b],
    ),
    step(
      "The notch gives back what it takes",
      `The cut removes ${a} m of outer edge but adds ${a} m of inner wall (same for ${b} m). So the L-shape walks exactly as far as the full rectangle: 2 × (${W} + ${H}) = ${total} m.`,
      "break-apart",
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
      "text",
      [...shown],
    ),
    step(
      "Do the hidden step first",
      `Combine ${first.join(" and ")} first — that hidden amount (${first.length > 1 ? "add, subtract, or multiply them as the story says" : "work it out"}) unlocks the rest of the problem.`,
      "break-apart",
      [...first, ...rest.slice(0, 1)],
    ),
    step(
      "Finish with the second step",
      `Take that hidden amount and ${rest.length ? `combine it with ${rest.join(" and ")}` : "finish the story"} to land on ${ans}. Two small steps beat one big leap.`,
      "text",
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
      "text",
      [a, d1, b, d2],
    ),
    step(
      "Ask each half: are you past it?",
      `Benchmark against 1/2: is ${a}/${d1} more or less than half? Is ${b}/${d2}? If one passes half and the other does not, you are done already.`,
      "number-line",
      [a, d1, b, d2],
    ),
    step(
      "Cross-multiply to be sure",
      `${a} × ${d2} = ${left} versus ${b} × ${d1} = ${right}. The side with the bigger product holds the bigger fraction — no guessing.`,
      "break-apart",
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
