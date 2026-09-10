import { DEFAULT_LEVEL, levelToDifficulty } from "./types";
import type { AnswerType, Level, Problem, SkillRef } from "./types";
import { EXTRA_GENERATORS, EXTRA_GRADES } from "./generators-extra";

export type Rng = () => number;

/** Deterministic seeded PRNG (mulberry32). Same seed -> same problem stream. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Generator = (rng: Rng, level: Level) => Problem;

function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * The single level-scaling convention: `ranges[level - 1]` is the [lo, hi] the
 * drawn value comes from. Every generator routes its operands, digit counts,
 * denominator sizes, and drawn-value ranges through this table, so "one rung
 * higher" always means one predictable step up in size — never an ad-hoc rule.
 */
function pickByLevel(
  rng: Rng,
  level: Level,
  ranges: readonly (readonly [number, number])[],
): number {
  const [lo, hi] = ranges[level - 1];
  return int(rng, lo, hi);
}

/** Same convention for choosing one item out of a per-level pool. */
function oneByLevel<T>(rng: Rng, level: Level, pools: readonly (readonly T[])[]): T {
  const pool = pools[level - 1];
  return pool[int(rng, 0, pool.length - 1)];
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1;
}

/** Thousands-separated display; answers stay canonical (commas stripped at grade time). */
export function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function build(
  rng: Rng,
  skill: SkillRef,
  level: Level,
  answerType: AnswerType,
  text: string,
  answer: string,
  hint1: string,
  hint2: string,
  explanation: string,
): Problem {
  return {
    id: `${skill}-${Math.floor(rng() * 1e9).toString(36)}`,
    skill,
    difficulty: levelToDifficulty(level),
    answerType,
    text,
    answer,
    hint1,
    hint2,
    explanation,
  };
}

/* 1. Multi-digit addition */
function genAddMulti(rng: Rng, level: Level): Problem {
  const a = pickByLevel(rng, level, [
    [10, 99],
    [100, 999],
    [1000, 9999],
    [10000, 99999],
    [100000, 999999],
  ]);
  const b = pickByLevel(rng, level, [
    [1, 9],
    [10, 99],
    [100, 999],
    [1000, 9999],
    [100000, 999999],
  ]);
  const sum = a + b;
  return build(
    rng, "bt-add-multidigit", level, "integer",
    `What is ${fmt(a)} + ${fmt(b)}?`,
    String(sum),
    `Add the ones column first: ${a % 10} + ${b % 10}.`,
    "Work column by column from right to left, carrying whenever a column sums to 10 or more.",
    `${fmt(a)} + ${fmt(b)} = ${fmt(sum)}. Add each place-value column from right to left, regrouping tens as needed.`,
  );
}

/* 2. Multi-digit subtraction */
function genSubMulti(rng: Rng, level: Level): Problem {
  const bLo = pickByLevel(rng, level, [
    [1, 9],
    [10, 99],
    [100, 999],
    [1000, 9999],
    [10000, 99999],
  ]);
  const a = pickByLevel(rng, level, [
    [20, 99],
    [1000, 9999],
    [1000, 99999],
    [10000, 999999],
    [100000, 9999999],
  ]);
  const b = int(rng, bLo, a - 1);
  const diff = a - b;
  return build(
    rng, "bt-sub-multidigit", level, "integer",
    `What is ${fmt(a)} - ${fmt(b)}?`,
    String(diff),
    `Subtract the ones column first: ${a % 10} - ${b % 10}${a % 10 < b % 10 ? " (borrow 1 ten first)" : ""}.`,
    "Work right to left, borrowing from the next column whenever the top digit is smaller.",
    `${fmt(a)} - ${fmt(b)} = ${fmt(diff)}. Subtract column by column from right to left, borrowing as needed.`,
  );
}

/* 3. Single-digit multiplication facts */
function genMultFacts(rng: Rng, level: Level): Problem {
  const a = pickByLevel(rng, level, [
    [2, 5],
    [2, 9],
    [2, 9],
    [2, 9],
    [2, 9],
  ]);
  const b = pickByLevel(rng, level, [
    [2, 5],
    [2, 9],
    [2, 10],
    [2, 11],
    [2, 12],
  ]);
  return build(
    rng, "oa-mult-1digit", level, "integer",
    `What is ${a} × ${b}?`,
    String(a * b),
    `Think of it as adding ${a} to itself ${b} times.`,
    `Use a fact you know: ${a} × ${b - 1} = ${a * (b - 1)}, then add one more ${a}.`,
    `${a} × ${b} = ${a * b}.`,
  );
}

/* 4. 1-digit × multi-digit */
function genMultDigit(rng: Rng, level: Level): Problem {
  const a = pickByLevel(rng, level, [
    [12, 49],
    [13, 199],
    [13, 999],
    [100, 4999],
    [1000, 9999],
  ]);
  const b = pickByLevel(rng, level, [
    [2, 5],
    [3, 9],
    [4, 9],
    [4, 9],
    [6, 9],
  ]);
  return build(
    rng, "oa-mult-digit-1digit", level, "integer",
    `What is ${fmt(a)} × ${b}?`,
    String(a * b),
    `Multiply ${b} by the ones digit of ${fmt(a)} first, then carry.`,
    `Break it apart: ${b} × ${fmt(a - (a % 100))} plus ${b} × ${a % 100} (partial products).`,
    `${fmt(a)} × ${b} = ${fmt(a * b)}. Multiply each place value by ${b} from right to left, carrying as needed.`,
  );
}

/* 5. Division facts */
function genDivFacts(rng: Rng, level: Level): Problem {
  const d = pickByLevel(rng, level, [
    [2, 5],
    [2, 9],
    [2, 9],
    [3, 9],
    [4, 9],
  ]);
  const q = pickByLevel(rng, level, [
    [2, 5],
    [2, 9],
    [2, 10],
    [2, 11],
    [2, 12],
  ]);
  const n = d * q;
  return build(
    rng, "oa-div-facts", level, "integer",
    `What is ${n} ÷ ${d}?`,
    String(q),
    `Ask: ${d} times what equals ${n}?`,
    `Use the related multiplication fact: ${d} × ${q} = ${n}.`,
    `${n} ÷ ${d} = ${q} because ${d} × ${q} = ${n}.`,
  );
}

/* 6. Division with remainders (1-digit divisor) */
function genDivRemainder(rng: Rng, level: Level): Problem {
  const d = pickByLevel(rng, level, [
    [2, 5],
    [2, 9],
    [3, 9],
    [4, 9],
    [6, 9],
  ]);
  const q = pickByLevel(rng, level, [
    [2, 9],
    [11, 99],
    [20, 199],
    [50, 499],
    [100, 999],
  ]);
  const r = int(rng, 1, d - 1);
  const n = d * q + r;
  return build(
    rng, "oa-div-1digit-divisor", level, "text",
    `Divide ${fmt(n)} by ${d}. Give the quotient and remainder like this: Q R R.`,
    `${q} R ${r}`,
    `Find the largest multiple of ${d} that is still below ${fmt(n)} (try ${d} × ${q} = ${fmt(d * q)}).`,
    `Subtract that multiple from ${fmt(n)}; what is left over is the remainder (it must be less than ${d}).`,
    `${fmt(n)} ÷ ${d} = ${q} R ${r}, because ${d} × ${q} = ${fmt(d * q)} and ${fmt(n)} - ${fmt(d * q)} = ${r}.`,
  );
}

/* 7. Equivalent fractions (fill in the missing numerator) */
function genEquiv(rng: Rng, level: Level): Problem {
  let n = pickByLevel(rng, level, [
    [1, 4],
    [1, 11],
    [1, 15],
    [1, 19],
    [1, 23],
  ]);
  let d = pickByLevel(rng, level, [
    [2, 6],
    [2, 12],
    [2, 16],
    [2, 20],
    [2, 24],
  ]);
  const g = gcd(n, d);
  n /= g;
  d /= g;
  if (n >= d) {
    n = 1;
    d = 2;
  }
  const k = pickByLevel(rng, level, [
    [2, 3],
    [2, 5],
    [2, 7],
    [2, 9],
    [3, 12],
  ]);
  return build(
    rng, "fr-equiv", level, "integer",
    `Fill in the missing number: ${n}/${d} = ?/${d * k}`,
    String(n * k),
    `Whatever you multiply the bottom by (${d} × ${k}), multiply the top by the same.`,
    `Equivalent fractions scale top and bottom equally: ? = ${n} × ${k}.`,
    `${n}/${d} = ${n * k}/${d * k} because both parts were multiplied by ${k}.`,
  );
}

/* 8. Add fractions, like denominators */
function genAddLike(rng: Rng, level: Level): Problem {
  const d = pickByLevel(rng, level, [
    [3, 6],
    [3, 12],
    [4, 16],
    [6, 20],
    [8, 24],
  ]);
  const a = int(rng, 1, d - 2);
  const b = int(rng, 1, d - a - 1);
  const s = a + b;
  const g = gcd(s, d);
  const answer = g > 1 ? `${s / g}/${d / g}` : `${s}/${d}`;
  return build(
    rng, "fr-add-like", level, "fraction",
    `What is ${a}/${d} + ${b}/${d}? Give your answer as a fraction.`,
    answer,
    "Same denominator? Just add the tops and keep the bottom.",
    `${a} + ${b} = ${s}, so you get ${s}/${d}${g > 1 ? `, then simplify by dividing top and bottom by ${g}` : ""}.`,
    `${a}/${d} + ${b}/${d} = ${s}/${d} = ${answer}. Add numerators, keep the denominator${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 9. Subtract fractions, like denominators */
function genSubLike(rng: Rng, level: Level): Problem {
  const d = pickByLevel(rng, level, [
    [3, 6],
    [3, 12],
    [4, 16],
    [6, 20],
    [8, 24],
  ]);
  const a = int(rng, 2, d - 1);
  const b = int(rng, 1, a - 1);
  const s = a - b;
  const g = gcd(s, d);
  const answer = g > 1 ? `${s / g}/${d / g}` : `${s}/${d}`;
  return build(
    rng, "fr-sub-like", level, "fraction",
    `What is ${a}/${d} - ${b}/${d}? Give your answer as a fraction.`,
    answer,
    "Same denominator? Just subtract the tops and keep the bottom.",
    `${a} - ${b} = ${s}, so you get ${s}/${d}${g > 1 ? `, then simplify by dividing top and bottom by ${g}` : ""}.`,
    `${a}/${d} - ${b}/${d} = ${s}/${d} = ${answer}. Subtract numerators, keep the denominator${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 10. Comparing decimals */
function genCompareDecimals(rng: Rng, level: Level): Problem {
  const cap = Math.max(2, pickByLevel(rng, level, [
    [1, 99],
    [1, 999],
    [10, 9999],
    [100, 99999],
    [1000, 999999],
  ]));
  const x = int(rng, 1, cap) / 100;
  let y = int(rng, 1, cap) / 100;
  let guard = 0;
  while (x === y && guard++ < 100) y = int(rng, 1, cap) / 100;
  if (x === y) y = x === 0.01 ? 0.02 : 0.01;
  const big = Math.max(x, y);
  return build(
    rng, "fr-compare-decimals", level, "decimal",
    `Which is greater: ${x} or ${y}?`,
    String(big),
    "Line up the decimal points and compare the tenths place first.",
    `Tenths: ${Math.floor(x * 10)} vs ${Math.floor(y * 10)}. If those tie, compare the hundredths.`,
    `${big} is greater: compare tenths first, then hundredths. ${x} ${x > y ? ">" : "<"} ${y}.`,
  );
}

/* 11. Area of rectangles */
function genArea(rng: Rng, level: Level): Problem {
  const l = pickByLevel(rng, level, [
    [2, 5],
    [2, 12],
    [3, 20],
    [4, 30],
    [6, 60],
  ]);
  const w = pickByLevel(rng, level, [
    [2, 5],
    [2, 12],
    [3, 20],
    [4, 30],
    [6, 60],
  ]);
  return build(
    rng, "md-area", level, "integer",
    `A rectangle is ${l} cm long and ${w} cm wide. What is its area in square centimeters?`,
    String(l * w),
    "Area of a rectangle = length × width.",
    `Multiply: ${l} × ${w}. (You can skip-count by ${l}, ${w} times.)`,
    `Area = ${l} × ${w} = ${l * w} square centimeters.`,
  );
}

/* 12. Perimeter of rectangles */
function genPerimeter(rng: Rng, level: Level): Problem {
  const l = pickByLevel(rng, level, [
    [2, 5],
    [2, 12],
    [3, 20],
    [4, 30],
    [6, 60],
  ]);
  const w = pickByLevel(rng, level, [
    [2, 5],
    [2, 12],
    [3, 20],
    [4, 30],
    [6, 60],
  ]);
  return build(
    rng, "md-perimeter", level, "integer",
    `A rectangle is ${l} cm long and ${w} cm wide. What is its perimeter in centimeters?`,
    String(2 * (l + w)),
    "Perimeter adds up all four sides: long + wide + long + wide.",
    `Add: ${l} + ${w} = ${l + w}, then double it for both pairs of sides.`,
    `Perimeter = 2 × (${l} + ${w}) = ${2 * (l + w)} centimeters.`,
  );
}

/* 13. Place value */
const PLACES: { name: string; exp: number }[] = [
  { name: "ones", exp: 0 },
  { name: "tens", exp: 1 },
  { name: "hundreds", exp: 2 },
  { name: "thousands", exp: 3 },
  { name: "ten-thousands", exp: 4 },
  { name: "hundred-thousands", exp: 5 },
  { name: "millions", exp: 6 },
];

function genPlaceValue(rng: Rng, level: Level): Problem {
  const n = pickByLevel(rng, level, [
    [100, 999],
    [1000, 9999],
    [1000, 99999],
    [10000, 999999],
    [100000, 9999999],
  ]);
  const digits = String(n).length;
  const p = PLACES[int(rng, 0, digits - 1)];
  const digit = Math.floor(n / 10 ** p.exp) % 10;
  return build(
    rng, "bt-place-value", level, "integer",
    `In the number ${fmt(n)}, which digit is in the ${p.name} place?`,
    String(digit),
    `Write the number and label each digit starting from the right: ones, tens, hundreds, …`,
    `The ${p.name} place is ${p.exp} step(s) left of the ones digit.`,
    `In ${fmt(n)} the ${p.name} place holds ${digit}.`,
  );
}

/* 14. Rounding */
const ROUND_PLACES: { name: string; f: number }[] = [
  { name: "ten", f: 10 },
  { name: "hundred", f: 100 },
  { name: "thousand", f: 1000 },
];

function genRounding(rng: Rng, level: Level): Problem {
  const p = ROUND_PLACES[pickByLevel(rng, level, [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ])];
  const n = pickByLevel(rng, level, [
    [11, 99],
    [100, 9999],
    [1000, 99999],
    [10000, 999999],
    [100000, 9999999],
  ]);
  const answer = Math.round(n / p.f) * p.f;
  return build(
    rng, "bt-rounding", level, "integer",
    `Round ${fmt(n)} to the nearest ${p.name}.`,
    String(answer),
    `Look at the digit just right of the ${p.name}s place: 5 or more rounds up.`,
    `The next lower and higher ${p.name}s are ${fmt(Math.floor(n / p.f) * p.f)} and ${fmt(Math.ceil(n / p.f) * p.f)} — which is closer?`,
    `${fmt(n)} rounds to ${fmt(answer)}: the deciding digit ${Math.round(n / p.f) === Math.floor(n / p.f) ? "is below 5, so round down" : "is 5 or more, so round up"}.`,
  );
}

/* ---------- Grade 5 ---------- */

/* 15. Add fractions, unlike denominators */
function genAddUnlike(rng: Rng, level: Level): Problem {
  let d1 = pickByLevel(rng, level, [
    [2, 4],
    [2, 8],
    [3, 10],
    [4, 12],
    [6, 12],
  ]);
  let d2 = pickByLevel(rng, level, [
    [2, 4],
    [2, 8],
    [3, 10],
    [4, 12],
    [6, 12],
  ]);
  if (d2 === d1) d2 = d1 + 1;
  const a = int(rng, 1, d1 - 1);
  const b = int(rng, 1, d2 - 1);
  const num = a * d2 + b * d1;
  const den = d1 * d2;
  const g = gcd(num, den);
  const answer = g > 1 ? `${num / g}/${den / g}` : `${num}/${den}`;
  return build(
    rng, "fr-add-unlike-5", level, "fraction",
    `What is ${a}/${d1} + ${b}/${d2}? Give your answer as a fraction.`,
    answer,
    `First make the bottoms match: use ${den} as a common denominator (${d1} × ${d2}).`,
    `Convert: ${a}/${d1} = ${a * d2}/${den} and ${b}/${d2} = ${b * d1}/${den}, then add the tops.`,
    `${a}/${d1} + ${b}/${d2} = ${a * d2}/${den} + ${b * d1}/${den} = ${num}/${den} = ${answer}. Rewrite with common denominator ${den}, add numerators${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 16. Subtract fractions, unlike denominators */
function genSubUnlike(rng: Rng, level: Level): Problem {
  let d1 = pickByLevel(rng, level, [
    [2, 4],
    [2, 8],
    [3, 10],
    [4, 12],
    [6, 12],
  ]);
  let d2 = pickByLevel(rng, level, [
    [2, 4],
    [2, 8],
    [3, 10],
    [4, 12],
    [6, 12],
  ]);
  if (d2 === d1) d2 = d1 + 1;
  let a = int(rng, 1, d1 - 1);
  let b = int(rng, 1, d2 - 1);
  // Keep the result positive: ensure a/d1 >= b/d2, swapping when needed.
  if (a * d2 < b * d1) {
    [a, b] = [b, a];
    [d1, d2] = [d2, d1];
  }
  if (a * d2 === b * d1) {
    a = d1 - 1;
    b = 1;
    if (a * d2 < b * d1) {
      [a, b] = [b, a];
      [d1, d2] = [d2, d1];
    }
  }
  const num = a * d2 - b * d1;
  const den = d1 * d2;
  const g = gcd(num, den);
  const answer = g > 1 ? `${num / g}/${den / g}` : `${num}/${den}`;
  return build(
    rng, "fr-sub-unlike-5", level, "fraction",
    `What is ${a}/${d1} - ${b}/${d2}? Give your answer as a fraction.`,
    answer,
    `First make the bottoms match: use ${den} as a common denominator (${d1} × ${d2}).`,
    `Convert: ${a}/${d1} = ${a * d2}/${den} and ${b}/${d2} = ${b * d1}/${den}, then subtract the tops.`,
    `${a}/${d1} - ${b}/${d2} = ${a * d2}/${den} - ${b * d1}/${den} = ${num}/${den} = ${answer}. Rewrite with common denominator ${den}, subtract numerators${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 17. Multiply fraction by whole number (grade-5 range, may scale past one whole) */
function genMultWholeAdv(rng: Rng, level: Level): Problem {
  const d = pickByLevel(rng, level, [
    [2, 4],
    [2, 8],
    [3, 10],
    [4, 12],
    [6, 12],
  ]);
  const a = int(rng, 1, d - 1);
  const w = pickByLevel(rng, level, [
    [2, 4],
    [3, 9],
    [4, 12],
    [6, 15],
    [8, 20],
  ]);
  const num = a * w;
  const g = gcd(num, d);
  const rn = num / g;
  const rd = d / g;
  const answer = rd === 1 ? String(rn) : `${rn}/${rd}`;
  return build(
    rng, "fr-mult-whole-adv", level, "fraction",
    `What is ${a}/${d} × ${w}? Give your answer as a fraction (a whole number is fine).`,
    answer,
    `Multiply the top by ${w} and keep the bottom: (${a} × ${w})/${d}.`,
    `That gives ${num}/${d}${g > 1 ? `, then simplify by dividing top and bottom by ${g}` : ""}.`,
    `${a}/${d} × ${w} = ${num}/${d} = ${answer}. Multiply the numerator by ${w}, keep the denominator${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 18. Add & subtract decimals to hundredths */
function genDecAddSub(rng: Rng, level: Level): Problem {
  const c1 = pickByLevel(rng, level, [
    [101, 999],
    [101, 9999],
    [1001, 99999],
    [10000, 999999],
    [100000, 9999999],
  ]);
  const c2 = pickByLevel(rng, level, [
    [101, 999],
    [101, 9999],
    [1001, 99999],
    [10000, 999999],
    [100000, 9999999],
  ]);
  const plus = rng() < 0.5;
  const hi = Math.max(c1, c2);
  const lo = Math.min(c1, c2);
  const cents = plus ? c1 + c2 : hi - lo;
  const x = (c1 / 100).toString();
  const y = plus ? (c2 / 100).toString() : (c1 >= c2 ? (c2 / 100).toString() : (c1 / 100).toString());
  const top = plus ? x : (hi / 100).toString();
  const bottom = plus ? y : (lo / 100).toString();
  const op = plus ? "+" : "-";
  const answer = (cents / 100).toString();
  return build(
    rng, "bt-dec-add-sub", level, "decimal",
    `What is ${top} ${op} ${bottom}?`,
    answer,
    `Line up the decimal points, then ${plus ? "add" : "subtract"} as if they were whole numbers.`,
    `${plus ? "Add hundredths, then tenths, carrying as needed" : "Subtract hundredths, then tenths, borrowing as needed"}; keep the decimal point lined up.`,
    `${top} ${op} ${bottom} = ${answer}. Line up the decimal points and ${plus ? "add" : "subtract"} column by column.`,
  );
}

/* 19. Multiply decimals by powers of 10 */
const DEC_POW10 = [10, 100, 1000];

function genDecMultPow10(rng: Rng, level: Level): Problem {
  const cents = pickByLevel(rng, level, [
    [101, 999],
    [101, 9999],
    [101, 9999],
    [1001, 99999],
    [10001, 999999],
  ]);
  const k = DEC_POW10[pickByLevel(rng, level, [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
    [1, 2],
  ])];
  const x = (cents / 100).toString();
  const answer = ((cents * k) / 100).toString();
  const places = k === 10 ? "one place" : k === 100 ? "two places" : "three places";
  return build(
    rng, "bt-dec-mult-pow10", level, "decimal",
    `What is ${x} × ${k}?`,
    answer,
    `Multiplying by ${k} shifts every digit left; the point moves ${places} to the right.`,
    `Drop the point-shift view: ${x} is ${cents} hundredths, and ${cents} × ${k} = ${cents * k} hundredths.`,
    `${x} × ${k} = ${answer}. The decimal point moves ${places} to the right.`,
  );
}

/* 20. Volume of rectangular prisms */
function genVolume(rng: Rng, level: Level): Problem {
  const l = pickByLevel(rng, level, [
    [2, 4],
    [2, 9],
    [3, 12],
    [4, 16],
    [5, 25],
  ]);
  const w = pickByLevel(rng, level, [
    [2, 4],
    [2, 9],
    [3, 12],
    [4, 16],
    [5, 25],
  ]);
  const h = pickByLevel(rng, level, [
    [2, 4],
    [2, 9],
    [3, 12],
    [4, 16],
    [5, 25],
  ]);
  return build(
    rng, "md-volume", level, "integer",
    `A box is ${l} cm long, ${w} cm wide, and ${h} cm tall. What is its volume in cubic centimeters?`,
    String(l * w * h),
    `Volume of a box = length × width × height. Start with ${l} × ${w}.`,
    `First ${l} × ${w} = ${l * w}, then multiply by the height: ${l * w} × ${h}.`,
    `Volume = ${l} × ${w} × ${h} = ${l * w * h} cubic centimeters. Count unit cubes or multiply the three edges.`,
  );
}

/* 21. Order of operations basics */
function genOrderOps(rng: Rng, level: Level): Problem {
  const a = pickByLevel(rng, level, [
    [2, 5],
    [2, 9],
    [3, 12],
    [4, 15],
    [5, 20],
  ]);
  const b = pickByLevel(rng, level, [
    [2, 5],
    [2, 9],
    [3, 12],
    [4, 15],
    [5, 20],
  ]);
  const c = pickByLevel(rng, level, [
    [2, 5],
    [2, 9],
    [3, 12],
    [4, 15],
    [5, 20],
  ]);
  const paren = rng() < 0.5;
  const text = paren ? `What is (${a} + ${b}) × ${c}?` : `What is ${a} + ${b} × ${c}?`;
  const answer = paren ? (a + b) * c : a + b * c;
  return build(
    rng, "oa-order-ops", level, "integer",
    text,
    String(answer),
    paren ? "Parentheses first: solve inside them before multiplying." : "Multiply before adding: do the × step first.",
    paren ? `(${a} + ${b}) = ${a + b}, then × ${c}.` : `${b} × ${c} = ${b * c}, then + ${a}.`,
    paren
      ? `(${a} + ${b}) × ${c} = ${a + b} × ${c} = ${answer}. Parentheses come first.`
      : `${a} + ${b} × ${c} = ${a} + ${b * c} = ${answer}. Multiplication comes before addition.`,
  );
}

/* 22. Coordinate plane basics (first quadrant) */
function genCoordPlane(rng: Rng, level: Level): Problem {
  const x = pickByLevel(rng, level, [
    [1, 3],
    [1, 9],
    [2, 12],
    [3, 15],
    [5, 20],
  ]);
  const y = pickByLevel(rng, level, [
    [1, 3],
    [1, 9],
    [2, 12],
    [3, 15],
    [5, 20],
  ]);
  return build(
    rng, "geo-coord-plane", level, "text",
    `Point A is ${x} units to the right and ${y} units up from the origin (0, 0). What are its coordinates? Write them like this: x, y.`,
    `${x}, ${y}`,
    "The first number counts steps right (x), the second counts steps up (y).",
    `Right ${x} means x = ${x}; up ${y} means y = ${y}.`,
    `Start at (0, 0), move right ${x} and up ${y}: point A is (${x}, ${y}).`,
  );
}
/* ---------- Grade 4, batch 2: broader curriculum ---------- */

/* 23. Angle types from degrees.
   Difficulty scales by crowding the 90° boundary: at low levels the angle sits
   far from a right angle, at high levels it lands within a few degrees of it. */
function genAngleTypes(rng: Rng, level: Level): Problem {
  const deg = pickByLevel(rng, level, [
    [20, 160],
    [1, 179],
    [1, 179],
    [50, 130],
    [75, 105],
  ]);
  const name = deg === 90 ? "right" : deg < 90 ? "acute" : "obtuse";
  return build(
    rng, "geo-angles-types", level, "text",
    `An angle measures ${deg} degrees. Is it acute, right, or obtuse?`,
    name,
    deg === 90
      ? "A square corner is exactly 90 degrees — that is the dividing line."
      : deg < 90
        ? "Compare it to a square corner (90 degrees): is it sharper and smaller?"
        : "Compare it to a square corner (90 degrees): does it open wider?",
    "Acute angles are smaller than 90 degrees, right angles are exactly 90 degrees, and obtuse angles are between 90 and 180 degrees.",
    deg === 90
      ? `An angle of 90 degrees is right: it makes a perfect square corner.`
      : deg < 90
        ? `An angle of ${deg} degrees is acute: ${deg} is less than 90, so it is sharp and narrow.`
        : `An angle of ${deg} degrees is obtuse: ${deg} is more than 90 (but less than 180), so it is wide.`,
  );
}

/* 24. Classify triangles by sides or by angles */
function genTriangles(rng: Rng, level: Level): Problem {
  if (rng() < 0.5) {
    const sideMax = pickByLevel(rng, level, [
      [6, 6],
      [12, 12],
      [16, 16],
      [22, 22],
      [30, 30],
    ]);
    const kind = int(rng, 0, 2);
    let a = 0;
    let b = 0;
    let c = 0;
    let name = "";
    if (kind === 0) {
      const s = int(rng, 3, sideMax);
      a = s;
      b = s;
      c = s;
      name = "equilateral";
    } else if (kind === 1) {
      const s = int(rng, 4, sideMax);
      let base = int(rng, 3, sideMax);
      let guard = 0;
      while ((base === s || base >= 2 * s) && guard++ < 50) base = int(rng, 3, sideMax);
      if (base === s || base >= 2 * s) base = s === 4 ? 3 : s - 1;
      a = s;
      b = s;
      c = base;
      name = "isosceles";
    } else {
      let guard = 0;
      a = 4;
      b = 5;
      c = 6;
      do {
        a = int(rng, 3, sideMax - 2);
        b = int(rng, a + 1, sideMax - 1);
        c = int(rng, b + 1, sideMax);
        guard++;
      } while (a + b <= c && guard < 100);
      if (a + b <= c) {
        a = 4;
        b = 5;
        c = 6;
      }
      name = "scalene";
    }
    return build(
      rng, "geo-triangles", level, "text",
      `A triangle has side lengths ${a} cm, ${b} cm, and ${c} cm. Is it equilateral, isosceles, or scalene?`,
      name,
      "Count how many of the three sides match: all three, exactly two, or none.",
      "Equilateral means all 3 sides equal, isosceles means exactly 2 sides equal, scalene means no sides equal.",
      `Sides ${a}, ${b}, and ${c}: ${name === "equilateral" ? "all three match, so it is equilateral" : name === "isosceles" ? "exactly two match, so it is isosceles" : "no two match, so it is scalene"}.`,
    );
  }
  const kind = int(rng, 0, 2);
  let x = 60;
  let y = 60;
  let z = 60;
  let name = "acute";
  if (kind === 0) {
    x = 90;
    y = pickByLevel(rng, level, [
      [30, 60],
      [20, 70],
      [20, 70],
      [15, 75],
      [10, 80],
    ]);
    z = 90 - y;
    name = "right";
  } else if (kind === 1) {
    const max = pickByLevel(rng, level, [
      [56, 64],
      [70, 70],
      [70, 70],
      [75, 75],
      [80, 80],
    ]);
    const px = int(rng, Math.max(30, 180 - max - 1), max);
    const py = int(rng, Math.max(30, 180 - max - 1), max);
    const pz = 180 - px - py;
    if (pz > 0 && pz < 90 && px + py > 90) {
      x = px;
      y = py;
      z = pz;
    }
    name = "acute";
  } else {
    const px = pickByLevel(rng, level, [
      [100, 130],
      [95, 150],
      [95, 150],
      [100, 155],
      [110, 160],
    ]);
    const py = int(rng, 10, Math.max(10, Math.min(60, 179 - px - 10)));
    const pz = 180 - px - py;
    if (pz > 0 && py < 90 && pz < 90) {
      x = px;
      y = py;
      z = pz;
    } else {
      x = 110;
      y = 30;
      z = 40;
    }
    name = "obtuse";
  }
  return build(
    rng, "geo-triangles", level, "text",
    `A triangle has angles ${x}°, ${y}°, and ${z}°. Is it acute, right, or obtuse?`,
    name,
    "Look for the biggest angle: it decides the triangle's type all by itself.",
    "Acute triangles have every angle below 90°, right triangles have one exactly 90°, obtuse triangles have one above 90°.",
    `Angles ${x}°, ${y}°, and ${z}°: ${name === "right" ? "one angle is exactly 90°, so it is right" : name === "acute" ? "every angle is below 90°, so it is acute" : "one angle is above 90°, so it is obtuse"}.`,
  );
}

/* 25. Symmetry line counts for common shapes */
const SYMMETRY_SHAPES: { name: string; lines: number }[] = [
  { name: "square", lines: 4 },
  { name: "rectangle that is not a square", lines: 2 },
  { name: "equilateral triangle", lines: 3 },
  { name: "isosceles triangle that is not equilateral", lines: 1 },
  { name: "regular pentagon", lines: 5 },
  { name: "regular hexagon", lines: 6 },
  { name: "rhombus that is not a square", lines: 2 },
  { name: "kite", lines: 1 },
  { name: "parallelogram that is neither a rectangle nor a rhombus", lines: 0 },
  { name: "scalene triangle", lines: 0 },
];

function genSymmetry(rng: Rng, level: Level): Problem {
  // Low levels see the familiar, obviously-symmetric shapes; higher levels add
  // the ambiguous zero/one-line figures (kite, rhombus, parallelogram).
  const shape = SYMMETRY_SHAPES[pickByLevel(rng, level, [
    [0, 5],
    [0, 9],
    [0, 9],
    [2, 9],
    [6, 9],
  ])];
  return build(
    rng, "geo-symmetry", level, "integer",
    `How many lines of symmetry does a ${shape.name} have?`,
    String(shape.lines),
    "A line of symmetry folds the shape onto itself with both halves matching exactly.",
    shape.lines === 0
      ? "Try folding it every way you can: no fold makes the halves match, so the answer is 0."
      : `Find one fold that matches, then check for more — this shape has ${shape.lines} in all.`,
    `A ${shape.name} has ${shape.lines} line${shape.lines === 1 ? "" : "s"} of symmetry: every fold that maps the shape onto itself exactly.`,
  );
}

/* 26. Elapsed time (start/end -> duration in minutes; same-day only, never crosses midnight) */
function fmtClock(totalMin: number): string {
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  const suffix = hh < 12 ? "AM" : "PM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

const MINUTE_TICKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const ALL_MINUTES = Array.from({ length: 60 }, (_, i) => i);

function genElapsedTime(rng: Rng, level: Level): Problem {
  const startH = pickByLevel(rng, level, [
    [8, 11],
    [8, 14],
    [7, 15],
    [6, 16],
    [5, 17],
  ]);
  const startM = oneByLevel(rng, level, [
    [0, 30],
    MINUTE_TICKS,
    MINUTE_TICKS,
    ALL_MINUTES,
    ALL_MINUTES,
  ]);
  const start = startH * 60 + startM;
  const dur = pickByLevel(rng, level, [
    [15, 60],
    [15, 180],
    [15, 180],
    [20, 200],
    [25, 240],
  ]);
  const end = start + dur;
  return build(
    rng, "md-time", level, "integer",
    `Class starts at ${fmtClock(start)} and ends at ${fmtClock(end)}. How many minutes long is class?`,
    String(dur),
    `Count forward from ${fmtClock(start)} to ${fmtClock(end)}: first reach the next hour, then add the rest.`,
    "Convert both times to minutes after midnight, then subtract: end minutes minus start minutes. Borrow 1 hour as 60 minutes when the end minutes are smaller.",
    `From ${fmtClock(start)} to ${fmtClock(end)} is ${dur} minutes: ${end} − ${start} = ${dur} counting in minutes after midnight.`,
  );
}

/* 27. Fraction number-line placement (tick -> fraction, may be improper) */
const NL_PARTS: { d: number; word: string }[] = [
  { d: 2, word: "halves" },
  { d: 3, word: "thirds" },
  { d: 4, word: "quarters" },
  { d: 5, word: "fifths" },
  { d: 6, word: "sixths" },
  { d: 8, word: "eighths" },
];

const SIMPLE_PARTS = NL_PARTS.filter((p) => p.d <= 4);

function genFractionNumberLine(rng: Rng, level: Level): Problem {
  const part = oneByLevel(rng, level, [
    SIMPLE_PARTS,
    NL_PARTS,
    NL_PARTS,
    NL_PARTS,
    NL_PARTS,
  ]);
  const d = part.d;
  const N = pickByLevel(rng, level, [
    [1, 1],
    [1, 3],
    [1, 3],
    [2, 4],
    [2, 6],
  ]);
  const t = int(rng, 1, N * d - 1);
  const g = gcd(t, d);
  const answer = d / g === 1 ? String(t / g) : `${t / g}/${d / g}`;
  return build(
    rng, "fr-mixed-numbers", level, "fraction",
    `A number line from 0 to ${N} is split into ${part.word} (each whole cut into ${d} equal parts). A dot sits at tick ${t} counting from 0. What fraction names that point? Give your answer as a fraction (a whole number is fine).`,
    answer,
    `Each tick is one jump of 1/${d}: tick ${t} means ${t} jumps from 0.`,
    `Tick ${t} out of ${d}-per-whole is ${t}/${d}${g > 1 ? `, which simplifies to ${answer} (divide top and bottom by ${g})` : ""}.`,
    `The dot is ${t} jumps of 1/${d} from 0, so it names ${t}/${d} = ${answer} on the number line.`,
  );
}

/* 28. Decimal place value (what is the digit worth?) */
function genDecimalPlaceValue(rng: Rng, level: Level): Problem {
  const cents = pickByLevel(rng, level, [
    [101, 299],
    [101, 999],
    [1001, 9999],
    [1001, 99999],
    [10001, 999999],
  ]);
  const x = (cents / 100).toFixed(2);
  const place = rng() < 0.5 ? "tenths" : "hundredths";
  const digit = place === "tenths" ? Math.floor(cents / 10) % 10 : cents % 10;
  const value = place === "tenths" ? digit / 10 : digit / 100;
  const answer = String(value);
  return build(
    rng, "fr-decimals-tenths", level, "decimal",
    `In the number ${x}, what is the value of the digit in the ${place} place?`,
    answer,
    `The first place after the point is tenths, the second is hundredths — the ${place} place is ${place === "tenths" ? "first" : "second"} after the point.`,
    `A ${digit} in the ${place} place means ${digit} × ${place === "tenths" ? "1/10" : "1/100"} = ${answer}.`,
    `In ${x} the ${place} digit is ${digit}, worth ${answer}. The position gives the digit its value.`,
  );
}

/* 29. Composite perimeter (rectilinear L-shapes: notch walls replace the cut edge) */
function genCompositePerimeter(rng: Rng, level: Level): Problem {
  const W = pickByLevel(rng, level, [
    [5, 8],
    [5, 12],
    [6, 20],
    [8, 30],
    [10, 50],
  ]);
  const H = pickByLevel(rng, level, [
    [5, 8],
    [5, 12],
    [6, 20],
    [8, 30],
    [10, 50],
  ]);
  const a = int(rng, 1, W - 1);
  const b = int(rng, 1, H - 1);
  const answer = 2 * (W + H);
  return build(
    rng, "geo-composite-shapes", level, "integer",
    `An L-shaped patio is made from a ${W} m by ${H} m rectangle with a ${a} m by ${b} m corner piece removed. What is its perimeter in meters?`,
    String(answer),
    `Walk the edge: the missing corner adds two inner walls, but each one matches the outer edge it replaced.`,
    `The notch cuts ${a} m off one side but adds ${a} m of inner wall (same for ${b} m), so the total never changes: 2 × (${W} + ${H}).`,
    `Perimeter = 2 × (${W} + ${H}) = ${answer} meters. The inner notch walls exactly replace the outer edge they cut away.`,
  );
}

/* 30. Multi-step word problems (2 steps, all four ops, validated numbers) */
const WORD_NAMES = ["Maya", "Liam", "Sofia", "Noah", "Ella", "Omar"];

function genMultistepWord(rng: Rng, level: Level): Problem {
  const pattern = int(rng, 0, 5);
  const name = WORD_NAMES[int(rng, 0, WORD_NAMES.length - 1)];
  let text = "";
  let answer = 0;
  let h1 = "";
  let h2 = "";
  let expl = "";
  if (pattern === 0) {
    // (a + b) x c
    const a = pickByLevel(rng, level, [[2, 6], [2, 12], [2, 12], [3, 18], [4, 25]]);
    const b = pickByLevel(rng, level, [[2, 6], [2, 12], [2, 12], [3, 18], [4, 25]]);
    const c = pickByLevel(rng, level, [[1, 3], [2, 6], [2, 6], [3, 9], [4, 12]]);
    answer = (a + b) * c;
    text = `${name} packs party bags. Each bag gets ${a} stickers and ${b} candies. ${name} makes ${c} bags. How many items are used in all?`;
    h1 = `First find what goes in ONE bag: ${a} + ${b}.`;
    h2 = `One bag holds ${a + b} items, and there are ${c} bags: multiply ${a + b} × ${c}.`;
    expl = `Each bag holds ${a} + ${b} = ${a + b} items. ${a + b} × ${c} = ${answer} items in all. Two steps: add first, then multiply.`;
  } else if (pattern === 1) {
    // a x b + c
    const a = pickByLevel(rng, level, [[2, 5], [2, 9], [2, 9], [3, 12], [4, 15]]);
    const b = pickByLevel(rng, level, [[2, 5], [2, 9], [2, 9], [3, 12], [4, 15]]);
    const c = pickByLevel(rng, level, [[5, 20], [5, 50], [5, 50], [20, 100], [50, 200]]);
    answer = a * b + c;
    text = `A shop sells boxes with ${a} muffins each. ${name} buys ${b} boxes plus ${c} extra muffins. How many muffins does ${name} have?`;
    h1 = `First find the muffins inside the boxes: ${a} × ${b}.`;
    h2 = `The boxes hold ${a * b} muffins; add the ${c} extras: ${a * b} + ${c}.`;
    expl = `${a} × ${b} = ${a * b} muffins in boxes, plus ${c} extra = ${answer} muffins. Multiply first, then add.`;
  } else if (pattern === 2) {
    // a - b x c (a validated above b*c so the result stays positive)
    const b = pickByLevel(rng, level, [[2, 5], [2, 9], [2, 9], [3, 12], [4, 15]]);
    const c = pickByLevel(rng, level, [[2, 5], [2, 9], [2, 9], [3, 12], [4, 15]]);
    const a = b * c + pickByLevel(rng, level, [[5, 20], [5, 60], [5, 60], [20, 100], [50, 200]]);
    answer = a - b * c;
    text = `${name} has $${a}. ${name} buys ${c} books for $${b} each. How many dollars are left?`;
    h1 = `First find the total cost: ${c} books × $${b} each.`;
    h2 = `The books cost $${b * c}; subtract from $${a}: ${a} − ${b * c}.`;
    expl = `Books cost ${c} × $${b} = $${b * c}. $${a} − $${b * c} = $${answer} left. Multiply first, then subtract.`;
  } else if (pattern === 3) {
    // (a + b) / c exact (total validated as c*q)
    const c = pickByLevel(rng, level, [[2, 4], [2, 6], [2, 6], [3, 9], [4, 12]]);
    const q = pickByLevel(rng, level, [[3, 6], [3, 12], [3, 12], [5, 20], [6, 30]]);
    const total = c * q;
    const a = int(rng, 1, total - 1);
    const b = total - a;
    answer = q;
    text = `${name} collects ${a} shells on Saturday and ${b} shells on Sunday, then shares all ${total} shells equally among ${c} friends. How many shells does each friend get?`;
    h1 = `First find ALL the shells: ${a} + ${b} = ${total}.`;
    h2 = `Share ${total} shells among ${c} friends: divide ${total} ÷ ${c}.`;
    expl = `${a} + ${b} = ${total} shells. ${total} ÷ ${c} = ${answer} shells per friend. Add first, then divide.`;
  } else if (pattern === 4) {
    // (a - b) / c exact (a validated as b + q*c)
    const c = pickByLevel(rng, level, [[2, 4], [2, 6], [2, 6], [3, 9], [4, 12]]);
    const q = pickByLevel(rng, level, [[3, 8], [3, 15], [3, 15], [6, 25], [8, 40]]);
    const b = pickByLevel(rng, level, [[5, 15], [5, 40], [5, 40], [10, 80], [20, 150]]);
    const a = b + q * c;
    answer = q;
    text = `A baker makes ${a} cookies, sells ${b}, then packs the rest into boxes of ${c}. How many boxes are filled?`;
    h1 = `First find the cookies LEFT: ${a} − ${b} = ${q * c}.`;
    h2 = `Pack ${q * c} cookies into boxes of ${c}: divide ${q * c} ÷ ${c}.`;
    expl = `${a} − ${b} = ${q * c} cookies left. ${q * c} ÷ ${c} = ${answer} boxes. Subtract first, then divide.`;
  } else {
    // a x b - c (c validated below a*b so the result stays positive)
    const a = pickByLevel(rng, level, [[4, 6], [4, 12], [4, 12], [5, 20], [6, 30]]);
    const b = pickByLevel(rng, level, [[4, 6], [4, 12], [4, 12], [5, 20], [6, 30]]);
    const c = int(rng, 5, a * b - 5);
    answer = a * b - c;
    text = `A garden has ${a} rows with ${b} plants each. ${c} plants are moved elsewhere. How many plants remain?`;
    h1 = `First find ALL the plants: ${a} × ${b} = ${a * b}.`;
    h2 = `Take away the ${c} moved plants: ${a * b} − ${c}.`;
    expl = `${a} × ${b} = ${a * b} plants. ${a * b} − ${c} = ${answer} plants remain. Multiply first, then subtract.`;
  }
  return build(rng, "oa-multistep-word", level, "integer", text, String(answer), h1, h2, expl);
}

/* 31. Comparing fractions with visuals (benchmarks, pies, cross-multiplication) */
function genCompareFractions(rng: Rng, level: Level): Problem {
  const dMax = pickByLevel(rng, level, [
    [5, 5],
    [12, 12],
    [15, 15],
    [18, 18],
    [20, 20],
  ]);
  let d1 = 2;
  let d2 = 3;
  let a = 1;
  let b = 2;
  let guard = 0;
  do {
    d1 = int(rng, 2, dMax);
    d2 = int(rng, 2, dMax);
    if (d2 === d1) d2 = d1 === dMax ? dMax - 1 : d1 + 1;
    a = int(rng, 1, d1 - 1);
    b = int(rng, 1, d2 - 1);
    guard++;
  } while (a * d2 === b * d1 && guard < 100);
  if (a * d2 === b * d1) {
    a = 1;
    d1 = 2;
    b = 2;
    d2 = 3;
  }
  const leftBigger = a * d2 > b * d1;
  const answer = leftBigger ? `${a}/${d1}` : `${b}/${d2}`;
  return build(
    rng, "fr-compare", level, "text",
    `Which is greater: ${a}/${d1} or ${b}/${d2}? Write the greater fraction.`,
    answer,
    `Picture two same-size pies: one cut into ${d1} slices with ${a} eaten, the other cut into ${d2} slices with ${b} eaten.`,
    `Benchmark against 1/2, or cross-multiply: ${a} × ${d2} = ${a * d2} versus ${b} × ${d1} = ${b * d1}.`,
    `${answer} is greater: ${a} × ${d2} = ${a * d2} ${leftBigger ? ">" : "<"} ${b} × ${d1} = ${b * d1}, so ${a}/${d1} ${leftBigger ? ">" : "<"} ${b}/${d2}.`,
  );
}

const CORE_GENERATORS: Record<string, Generator> = {
  "bt-add-multidigit": genAddMulti,
  "bt-sub-multidigit": genSubMulti,
  "oa-mult-1digit": genMultFacts,
  "oa-mult-digit-1digit": genMultDigit,
  "oa-div-facts": genDivFacts,
  "oa-div-1digit-divisor": genDivRemainder,
  "fr-equiv": genEquiv,
  "fr-add-like": genAddLike,
  "fr-sub-like": genSubLike,
  "fr-compare-decimals": genCompareDecimals,
  "md-area": genArea,
  "md-perimeter": genPerimeter,
  "bt-place-value": genPlaceValue,
  "bt-rounding": genRounding,
  "fr-add-unlike-5": genAddUnlike,
  "fr-sub-unlike-5": genSubUnlike,
  "fr-mult-whole-adv": genMultWholeAdv,
  "bt-dec-add-sub": genDecAddSub,
  "bt-dec-mult-pow10": genDecMultPow10,
  "md-volume": genVolume,
  "oa-order-ops": genOrderOps,
  "geo-coord-plane": genCoordPlane,
  "geo-angles-types": genAngleTypes,
  "geo-triangles": genTriangles,
  "geo-symmetry": genSymmetry,
  "md-time": genElapsedTime,
  "fr-mixed-numbers": genFractionNumberLine,
  "fr-decimals-tenths": genDecimalPlaceValue,
  "geo-composite-shapes": genCompositePerimeter,
  "oa-multistep-word": genMultistepWord,
  "fr-compare": genCompareFractions,
};

/** Extra generators first so the original core entries win on id conflicts. */
export const GENERATORS: Record<string, Generator> = { ...EXTRA_GENERATORS, ...CORE_GENERATORS };
export const ALL_SKILLS: string[] = Object.keys(GENERATORS);

/** Grade band per core skill: grade-4 skills map to 4, new skills map to 5. */
const CORE_GRADES: Record<string, 4 | 5> = {
  "bt-add-multidigit": 4,
  "bt-sub-multidigit": 4,
  "oa-mult-1digit": 4,
  "oa-mult-digit-1digit": 4,
  "oa-div-facts": 4,
  "oa-div-1digit-divisor": 4,
  "fr-equiv": 4,
  "fr-add-like": 4,
  "fr-sub-like": 4,
  "fr-compare-decimals": 4,
  "md-area": 4,
  "md-perimeter": 4,
  "bt-place-value": 4,
  "bt-rounding": 4,
  "fr-add-unlike-5": 5,
  "fr-sub-unlike-5": 5,
  "fr-mult-whole-adv": 5,
  "bt-dec-add-sub": 5,
  "bt-dec-mult-pow10": 5,
  "oa-order-ops": 5,
  "md-volume": 5,
  "geo-coord-plane": 5,
  "geo-angles-types": 4,
  "geo-triangles": 4,
  "geo-symmetry": 4,
  "md-time": 4,
  "fr-mixed-numbers": 4,
  "fr-decimals-tenths": 4,
  "geo-composite-shapes": 4,
  "oa-multistep-word": 4,
  "fr-compare": 4,
};

/** Extra grade flags first so the original core entries win on id conflicts. */
export const GENERATOR_GRADES: Record<string, 4 | 5> = { ...EXTRA_GRADES, ...CORE_GRADES };

/** Grade band for a generator skill id (defaults to 4 for unknown ids). */
export function generatorGradeFor(skillId: string): 4 | 5 {
  return GENERATOR_GRADES[skillId] ?? 4;
}

/**
 * Generate one problem for a skill from a seed and level. Same
 * (skillId, seed, level) always yields the same problem; the problem's own
 * difficulty is computed by its generator from that level. Throws on unknown
 * skill ids.
 */
export function generateProblem(skillId: string, seed = 1, level: Level = DEFAULT_LEVEL): Problem {
  const gen = GENERATORS[skillId];
  if (!gen) throw new Error(`Unknown skill: ${skillId}`);
  return gen(mulberry32(seed), level);
}
