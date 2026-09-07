import type { AnswerType, Difficulty, Problem, SkillRef } from "./types";

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

export type Generator = (rng: Rng) => Problem;

function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
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
  difficulty: Difficulty,
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
    difficulty,
    answerType,
    text,
    answer,
    hint1,
    hint2,
    explanation,
  };
}

/* 1. Multi-digit addition */
function genAddMulti(rng: Rng): Problem {
  const a = int(rng, 250, 9999);
  const b = int(rng, 250, 9999);
  const sum = a + b;
  const difficulty: Difficulty = sum >= 10000 ? "challenge" : sum >= 2000 ? "medium" : "easy";
  return build(
    rng, "bt-add-multidigit", difficulty, "integer",
    `What is ${fmt(a)} + ${fmt(b)}?`,
    String(sum),
    `Add the ones column first: ${a % 10} + ${b % 10}.`,
    "Work column by column from right to left, carrying whenever a column sums to 10 or more.",
    `${fmt(a)} + ${fmt(b)} = ${fmt(sum)}. Add each place-value column from right to left, regrouping tens as needed.`,
  );
}

/* 2. Multi-digit subtraction */
function genSubMulti(rng: Rng): Problem {
  const a = int(rng, 1000, 9999);
  const b = int(rng, 100, a - 1);
  const diff = a - b;
  const difficulty: Difficulty = a >= 5000 ? "medium" : "easy";
  return build(
    rng, "bt-sub-multidigit", difficulty, "integer",
    `What is ${fmt(a)} - ${fmt(b)}?`,
    String(diff),
    `Subtract the ones column first: ${a % 10} - ${b % 10}${a % 10 < b % 10 ? " (borrow 1 ten first)" : ""}.`,
    "Work right to left, borrowing from the next column whenever the top digit is smaller.",
    `${fmt(a)} - ${fmt(b)} = ${fmt(diff)}. Subtract column by column from right to left, borrowing as needed.`,
  );
}

/* 3. Single-digit multiplication facts */
function genMultFacts(rng: Rng): Problem {
  const a = int(rng, 2, 9);
  const b = int(rng, 2, 9);
  return build(
    rng, "oa-mult-1digit", "easy", "integer",
    `What is ${a} × ${b}?`,
    String(a * b),
    `Think of it as adding ${a} to itself ${b} times.`,
    `Use a fact you know: ${a} × ${b - 1} = ${a * (b - 1)}, then add one more ${a}.`,
    `${a} × ${b} = ${a * b}.`,
  );
}

/* 4. 1-digit × multi-digit */
function genMultDigit(rng: Rng): Problem {
  const a = int(rng, 13, 999);
  const b = int(rng, 3, 9);
  const difficulty: Difficulty = a >= 500 ? "challenge" : "medium";
  return build(
    rng, "oa-mult-digit-1digit", difficulty, "integer",
    `What is ${fmt(a)} × ${b}?`,
    String(a * b),
    `Multiply ${b} by the ones digit of ${fmt(a)} first, then carry.`,
    `Break it apart: ${b} × ${fmt(a - (a % 100))} plus ${b} × ${a % 100} (partial products).`,
    `${fmt(a)} × ${b} = ${fmt(a * b)}. Multiply each place value by ${b} from right to left, carrying as needed.`,
  );
}

/* 5. Division facts */
function genDivFacts(rng: Rng): Problem {
  const d = int(rng, 2, 9);
  const q = int(rng, 2, 9);
  const n = d * q;
  return build(
    rng, "oa-div-facts", "easy", "integer",
    `What is ${n} ÷ ${d}?`,
    String(q),
    `Ask: ${d} times what equals ${n}?`,
    `Use the related multiplication fact: ${d} × ${q} = ${n}.`,
    `${n} ÷ ${d} = ${q} because ${d} × ${q} = ${n}.`,
  );
}

/* 6. Division with remainders (1-digit divisor) */
function genDivRemainder(rng: Rng): Problem {
  const d = int(rng, 2, 9);
  const q = int(rng, 11, 99);
  const r = int(rng, 1, d - 1);
  const n = d * q + r;
  return build(
    rng, "oa-div-1digit-divisor", "medium", "text",
    `Divide ${fmt(n)} by ${d}. Give the quotient and remainder like this: Q R R.`,
    `${q} R ${r}`,
    `Find the largest multiple of ${d} that is still below ${fmt(n)} (try ${d} × ${q} = ${fmt(d * q)}).`,
    `Subtract that multiple from ${fmt(n)}; what is left over is the remainder (it must be less than ${d}).`,
    `${fmt(n)} ÷ ${d} = ${q} R ${r}, because ${d} × ${q} = ${fmt(d * q)} and ${fmt(n)} - ${fmt(d * q)} = ${r}.`,
  );
}

/* 7. Equivalent fractions (fill in the missing numerator) */
function genEquiv(rng: Rng): Problem {
  let n = int(rng, 1, 11);
  let d = int(rng, 2, 12);
  const g = gcd(n, d);
  n /= g;
  d /= g;
  if (n >= d) {
    n = 1;
    d = 2;
  }
  const k = int(rng, 2, 5);
  return build(
    rng, "fr-equiv", "easy", "integer",
    `Fill in the missing number: ${n}/${d} = ?/${d * k}`,
    String(n * k),
    `Whatever you multiply the bottom by (${d} × ${k}), multiply the top by the same.`,
    `Equivalent fractions scale top and bottom equally: ? = ${n} × ${k}.`,
    `${n}/${d} = ${n * k}/${d * k} because both parts were multiplied by ${k}.`,
  );
}

/* 8. Add fractions, like denominators */
function genAddLike(rng: Rng): Problem {
  const d = int(rng, 3, 12);
  const a = int(rng, 1, d - 2);
  const b = int(rng, 1, d - a - 1);
  const s = a + b;
  const g = gcd(s, d);
  const answer = g > 1 ? `${s / g}/${d / g}` : `${s}/${d}`;
  return build(
    rng, "fr-add-like", "medium", "fraction",
    `What is ${a}/${d} + ${b}/${d}? Give your answer as a fraction.`,
    answer,
    "Same denominator? Just add the tops and keep the bottom.",
    `${a} + ${b} = ${s}, so you get ${s}/${d}${g > 1 ? `, then simplify by dividing top and bottom by ${g}` : ""}.`,
    `${a}/${d} + ${b}/${d} = ${s}/${d} = ${answer}. Add numerators, keep the denominator${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 9. Subtract fractions, like denominators */
function genSubLike(rng: Rng): Problem {
  const d = int(rng, 3, 12);
  const a = int(rng, 2, d - 1);
  const b = int(rng, 1, a - 1);
  const s = a - b;
  const g = gcd(s, d);
  const answer = g > 1 ? `${s / g}/${d / g}` : `${s}/${d}`;
  return build(
    rng, "fr-sub-like", "medium", "fraction",
    `What is ${a}/${d} - ${b}/${d}? Give your answer as a fraction.`,
    answer,
    "Same denominator? Just subtract the tops and keep the bottom.",
    `${a} - ${b} = ${s}, so you get ${s}/${d}${g > 1 ? `, then simplify by dividing top and bottom by ${g}` : ""}.`,
    `${a}/${d} - ${b}/${d} = ${s}/${d} = ${answer}. Subtract numerators, keep the denominator${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 10. Comparing decimals */
function genCompareDecimals(rng: Rng): Problem {
  let x = int(rng, 1, 999) / 100;
  let y = int(rng, 1, 999) / 100;
  while (x === y) y = int(rng, 1, 999) / 100;
  const big = Math.max(x, y);
  return build(
    rng, "fr-compare-decimals", "easy", "decimal",
    `Which is greater: ${x} or ${y}?`,
    String(big),
    "Line up the decimal points and compare the tenths place first.",
    `Tenths: ${Math.floor(x * 10)} vs ${Math.floor(y * 10)}. If those tie, compare the hundredths.`,
    `${big} is greater: compare tenths first, then hundredths. ${x} ${x > y ? ">" : "<"} ${y}.`,
  );
}

/* 11. Area of rectangles */
function genArea(rng: Rng): Problem {
  const l = int(rng, 2, 12);
  const w = int(rng, 2, 12);
  const difficulty: Difficulty = l * w > 100 ? "medium" : "easy";
  return build(
    rng, "md-area", difficulty, "integer",
    `A rectangle is ${l} cm long and ${w} cm wide. What is its area in square centimeters?`,
    String(l * w),
    "Area of a rectangle = length × width.",
    `Multiply: ${l} × ${w}. (You can skip-count by ${l}, ${w} times.)`,
    `Area = ${l} × ${w} = ${l * w} square centimeters.`,
  );
}

/* 12. Perimeter of rectangles */
function genPerimeter(rng: Rng): Problem {
  const l = int(rng, 2, 12);
  const w = int(rng, 2, 12);
  return build(
    rng, "md-perimeter", "easy", "integer",
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
];

function genPlaceValue(rng: Rng): Problem {
  const n = int(rng, 1000, 999999);
  const digits = String(n).length;
  const p = PLACES[int(rng, 0, digits - 1)];
  const digit = Math.floor(n / 10 ** p.exp) % 10;
  return build(
    rng, "bt-place-value", "easy", "integer",
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

function genRounding(rng: Rng): Problem {
  const p = ROUND_PLACES[int(rng, 0, 2)];
  const n = p.f === 1000 ? int(rng, 1000, 9999) : int(rng, 100, 9999);
  const answer = Math.round(n / p.f) * p.f;
  return build(
    rng, "bt-rounding", "medium", "integer",
    `Round ${fmt(n)} to the nearest ${p.name}.`,
    String(answer),
    `Look at the digit just right of the ${p.name}s place: 5 or more rounds up.`,
    `The next lower and higher ${p.name}s are ${fmt(Math.floor(n / p.f) * p.f)} and ${fmt(Math.ceil(n / p.f) * p.f)} — which is closer?`,
    `${fmt(n)} rounds to ${fmt(answer)}: the deciding digit ${Math.round(n / p.f) === Math.floor(n / p.f) ? "is below 5, so round down" : "is 5 or more, so round up"}.`,
  );
}

export const GENERATORS: Record<string, Generator> = {
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
};

export const ALL_SKILLS: string[] = Object.keys(GENERATORS);

/**
 * Generate one problem for a skill from a seed. Same (skillId, seed) always
 * yields the same problem. Throws on unknown skill ids.
 */
export function generateProblem(skillId: string, seed = 1, difficulty?: Difficulty): Problem {
  const gen = GENERATORS[skillId];
  if (!gen) throw new Error(`Unknown skill: ${skillId}`);
  const problem = gen(mulberry32(seed));
  if (difficulty !== undefined) problem.difficulty = difficulty;
  return problem;
}
