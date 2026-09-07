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

/* ---------- Grade 5 ---------- */

/* 15. Add fractions, unlike denominators */
function genAddUnlike(rng: Rng): Problem {
  let d1 = int(rng, 2, 8);
  let d2 = int(rng, 2, 8);
  if (d2 === d1) d2 = (d1 % 8) + 1;
  const a = int(rng, 1, d1 - 1);
  const b = int(rng, 1, d2 - 1);
  const num = a * d2 + b * d1;
  const den = d1 * d2;
  const g = gcd(num, den);
  const answer = g > 1 ? `${num / g}/${den / g}` : `${num}/${den}`;
  return build(
    rng, "fr-add-unlike-5", "medium", "fraction",
    `What is ${a}/${d1} + ${b}/${d2}? Give your answer as a fraction.`,
    answer,
    `First make the bottoms match: use ${den} as a common denominator (${d1} × ${d2}).`,
    `Convert: ${a}/${d1} = ${a * d2}/${den} and ${b}/${d2} = ${b * d1}/${den}, then add the tops.`,
    `${a}/${d1} + ${b}/${d2} = ${a * d2}/${den} + ${b * d1}/${den} = ${num}/${den} = ${answer}. Rewrite with common denominator ${den}, add numerators${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 16. Subtract fractions, unlike denominators */
function genSubUnlike(rng: Rng): Problem {
  let d1 = int(rng, 2, 8);
  let d2 = int(rng, 2, 8);
  if (d2 === d1) d2 = (d1 % 8) + 1;
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
    rng, "fr-sub-unlike-5", "medium", "fraction",
    `What is ${a}/${d1} - ${b}/${d2}? Give your answer as a fraction.`,
    answer,
    `First make the bottoms match: use ${den} as a common denominator (${d1} × ${d2}).`,
    `Convert: ${a}/${d1} = ${a * d2}/${den} and ${b}/${d2} = ${b * d1}/${den}, then subtract the tops.`,
    `${a}/${d1} - ${b}/${d2} = ${a * d2}/${den} - ${b * d1}/${den} = ${num}/${den} = ${answer}. Rewrite with common denominator ${den}, subtract numerators${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 17. Multiply fraction by whole number (grade-5 range, may scale past one whole) */
function genMultWholeAdv(rng: Rng): Problem {
  const d = int(rng, 2, 8);
  const a = int(rng, 1, d - 1);
  const w = int(rng, 3, 9);
  const num = a * w;
  const g = gcd(num, d);
  const rn = num / g;
  const rd = d / g;
  const answer = rd === 1 ? String(rn) : `${rn}/${rd}`;
  return build(
    rng, "fr-mult-whole-adv", "medium", "fraction",
    `What is ${a}/${d} × ${w}? Give your answer as a fraction (a whole number is fine).`,
    answer,
    `Multiply the top by ${w} and keep the bottom: (${a} × ${w})/${d}.`,
    `That gives ${num}/${d}${g > 1 ? `, then simplify by dividing top and bottom by ${g}` : ""}.`,
    `${a}/${d} × ${w} = ${num}/${d} = ${answer}. Multiply the numerator by ${w}, keep the denominator${g > 1 ? ", and simplify" : ""}.`,
  );
}

/* 18. Add & subtract decimals to hundredths */
function genDecAddSub(rng: Rng): Problem {
  const c1 = int(rng, 101, 9999);
  const c2 = int(rng, 101, 9999);
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
    rng, "bt-dec-add-sub", "medium", "decimal",
    `What is ${top} ${op} ${bottom}?`,
    answer,
    `Line up the decimal points, then ${plus ? "add" : "subtract"} as if they were whole numbers.`,
    `${plus ? "Add hundredths, then tenths, carrying as needed" : "Subtract hundredths, then tenths, borrowing as needed"}; keep the decimal point lined up.`,
    `${top} ${op} ${bottom} = ${answer}. Line up the decimal points and ${plus ? "add" : "subtract"} column by column.`,
  );
}

/* 19. Multiply decimals by powers of 10 */
const DEC_POW10 = [10, 100, 1000];

function genDecMultPow10(rng: Rng): Problem {
  const cents = int(rng, 101, 9999);
  const k = DEC_POW10[int(rng, 0, DEC_POW10.length - 1)];
  const x = (cents / 100).toString();
  const answer = ((cents * k) / 100).toString();
  const places = k === 10 ? "one place" : k === 100 ? "two places" : "three places";
  return build(
    rng, "bt-dec-mult-pow10", "easy", "decimal",
    `What is ${x} × ${k}?`,
    answer,
    `Multiplying by ${k} shifts every digit left; the point moves ${places} to the right.`,
    `Drop the point-shift view: ${x} is ${cents} hundredths, and ${cents} × ${k} = ${cents * k} hundredths.`,
    `${x} × ${k} = ${answer}. The decimal point moves ${places} to the right.`,
  );
}

/* 20. Volume of rectangular prisms */
function genVolume(rng: Rng): Problem {
  const l = int(rng, 2, 9);
  const w = int(rng, 2, 9);
  const h = int(rng, 2, 9);
  const difficulty: Difficulty = l * w * h > 200 ? "medium" : "easy";
  return build(
    rng, "md-volume", difficulty, "integer",
    `A box is ${l} cm long, ${w} cm wide, and ${h} cm tall. What is its volume in cubic centimeters?`,
    String(l * w * h),
    `Volume of a box = length × width × height. Start with ${l} × ${w}.`,
    `First ${l} × ${w} = ${l * w}, then multiply by the height: ${l * w} × ${h}.`,
    `Volume = ${l} × ${w} × ${h} = ${l * w * h} cubic centimeters. Count unit cubes or multiply the three edges.`,
  );
}

/* 21. Order of operations basics */
function genOrderOps(rng: Rng): Problem {
  const a = int(rng, 2, 9);
  const b = int(rng, 2, 9);
  const c = int(rng, 2, 9);
  const paren = rng() < 0.5;
  const text = paren ? `What is (${a} + ${b}) × ${c}?` : `What is ${a} + ${b} × ${c}?`;
  const answer = paren ? (a + b) * c : a + b * c;
  return build(
    rng, "oa-order-ops", "medium", "integer",
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
function genCoordPlane(rng: Rng): Problem {
  const x = int(rng, 1, 9);
  const y = int(rng, 1, 9);
  return build(
    rng, "geo-coord-plane", "easy", "text",
    `Point A is ${x} units to the right and ${y} units up from the origin (0, 0). What are its coordinates? Write them like this: x, y.`,
    `${x}, ${y}`,
    "The first number counts steps right (x), the second counts steps up (y).",
    `Right ${x} means x = ${x}; up ${y} means y = ${y}.`,
    `Start at (0, 0), move right ${x} and up ${y}: point A is (${x}, ${y}).`,
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
  "fr-add-unlike-5": genAddUnlike,
  "fr-sub-unlike-5": genSubUnlike,
  "fr-mult-whole-adv": genMultWholeAdv,
  "bt-dec-add-sub": genDecAddSub,
  "bt-dec-mult-pow10": genDecMultPow10,
  "md-volume": genVolume,
  "oa-order-ops": genOrderOps,
  "geo-coord-plane": genCoordPlane,
};
export const ALL_SKILLS: string[] = Object.keys(GENERATORS);

/** Grade band per generator skill: grade-4 skills map to 4, new skills map to 5. */
export const GENERATOR_GRADES: Record<string, 4 | 5> = {
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
  "md-volume": 5,
  "oa-order-ops": 5,
  "geo-coord-plane": 5,
};

/** Grade band for a generator skill id (defaults to 4 for unknown ids). */
export function generatorGradeFor(skillId: string): 4 | 5 {
  return GENERATOR_GRADES[skillId] ?? 4;
}

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
