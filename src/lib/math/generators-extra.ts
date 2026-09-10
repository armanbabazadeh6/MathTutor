/**
 * Extra deterministic, level-aware generators for the skills that the core
 * file (`generators.ts`) does not cover. Same conventions as the core:
 * seeded draws only, canonical answers gradeable by `isCorrectAnswer`,
 * hints that name the actual numbers, and a worked explanation.
 *
 * `generators.ts` spreads these in before its own entries so existing
 * generators win on any id collision.
 */
import type { Generator, Rng } from "./generators";
import type { AnswerType, Difficulty, Level, Problem } from "./types";

/* ---------- shared helpers (mirroring generators.ts conventions) ---------- */

function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick the entry for a level from a 5-slot table (index = level - 1). */
function at<T>(level: Level, table: readonly T[]): T {
  return table[level - 1];
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[int(rng, 0, items.length - 1)];
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

/** Simplified fraction, or a plain integer when the denominator collapses. */
function frac(num: number, den: number): string {
  const g = gcd(num, den);
  const n = num / g;
  const d = den / g;
  return d === 1 ? String(n) : `${n}/${d}`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function money(cents: number): string {
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

function smallestFactor(n: number): number {
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return i;
  return n;
}

function band(level: Level): Difficulty {
  return level <= 2 ? "easy" : level <= 4 ? "medium" : "challenge";
}

function build(
  rng: Rng,
  skill: string,
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

const NAMES = ["Maya", "Liam", "Sofia", "Noah", "Ella", "Omar"];

/* ======================= Operations & Algebraic Thinking ======================= */

/* 2-digit × 2-digit */
const MULT2_RANGES: readonly (readonly [number, number])[] = [
  [10, 19],
  [10, 24],
  [12, 39],
  [15, 59],
  [20, 99],
];

function genMult2x2(rng: Rng, level: Level): Problem {
  const [lo, hi] = at(level, MULT2_RANGES);
  const a = int(rng, lo, hi);
  const b = int(rng, lo, hi);
  const tens = Math.floor(b / 10) * 10;
  const ones = b % 10;
  const product = a * b;
  return build(
    rng,
    "oa-mult-2digit-2digit",
    band(level),
    "integer",
    `What is ${a} × ${b}?`,
    String(product),
    `Split ${b} into ${tens} + ${ones}: first multiply ${a} × ${tens} = ${fmt(a * tens)}.`,
    `Use partial products: multiply ${a} by the tens part and then by the ones part of ${b}, and add the two results.`,
    `${a} × ${b} = ${fmt(a * tens)} + ${fmt(a * ones)} = ${fmt(product)}. Break the 2-digit factor by place value, multiply each part, then add.`,
  );
}

/* Factor pairs (missing-factor form: canonical answer is an integer) */
const FACTOR_DIVISOR_RANGES: readonly (readonly [number, number])[] = [
  [2, 4],
  [2, 6],
  [3, 8],
  [4, 9],
  [4, 9],
];
const FACTOR_MAX: readonly number[] = [6, 8, 9, 10, 12];

function genFactorPairs(rng: Rng, level: Level): Problem {
  const [dlo, dhi] = at(level, FACTOR_DIVISOR_RANGES);
  const d = int(rng, dlo, dhi);
  const cap = Math.max(2, Math.min(at(level, FACTOR_MAX), Math.floor(100 / d)));
  const f = int(rng, 2, cap);
  const n = d * f;
  return build(
    rng,
    "oa-factor-pairs",
    band(level),
    "integer",
    `The number ${n} can be written as ${d} × ?. What is the missing factor?`,
    String(f),
    `Divide ${n} by ${d}, or count up in ${d}s until you reach ${n}.`,
    "A factor pair multiplies to the number. If you know one factor, divide the number by it to find the other.",
    `${n} = ${d} × ${f}, so the missing factor is ${f}.`,
  );
}

/* Multiples, prime & composite (answer is exactly "prime" or "composite") */
const PRIME_RANGES: readonly (readonly [number, number])[] = [
  [2, 20],
  [3, 40],
  [10, 60],
  [20, 90],
  [30, 150],
];

function genMultiplesPrime(rng: Rng, level: Level): Problem {
  const [lo, hi] = at(level, PRIME_RANGES);
  const n = int(rng, lo, hi);
  const prime = isPrime(n);
  const f = prime ? n : smallestFactor(n);
  return build(
    rng,
    "oa-multiples-prime",
    band(level),
    "text",
    `Is ${n} prime or composite?`,
    prime ? "prime" : "composite",
    `Check the small divisors of ${n}: does 2 divide it? 3? 5? Keep going until the divisors pass the square root.`,
    "A prime has exactly two factors, 1 and itself. Test divisors up to the square root; if none divide evenly, the number is prime.",
    prime
      ? `${n} is prime: no whole number other than 1 and ${n} divides it evenly.`
      : `${n} is composite: ${f} × ${n / f} = ${n}, so it has more than two factors.`,
  );
}

/* Number patterns (arithmetic, skip-count, geometric, growing-jump) */
const PATTERN_ARITH_STEP: readonly (readonly [number, number])[] = [
  [2, 5],
  [3, 9],
  [4, 12],
  [5, 12],
  [6, 15],
];
const PATTERN_KINDS: readonly (readonly number[])[] = [
  [0],
  [0, 1],
  [1, 2],
  [2, 3],
  [2, 3],
];

function genPatterns(rng: Rng, level: Level): Problem {
  const kind = pick(rng, at(level, PATTERN_KINDS));
  const terms: number[] = [];
  let next = 0;
  let rule = "";
  let hint1 = "";
  if (kind === 2) {
    const start = int(rng, 1, 3);
    const ratio = int(rng, 2, 3);
    terms.push(start);
    for (let i = 1; i < 5; i++) terms.push(terms[i - 1] * ratio);
    next = terms[4] * ratio;
    rule = `multiply by ${ratio} each time`;
    hint1 = `From ${terms[0]} to ${terms[1]} you multiply by ${ratio}; check that the same factor repeats.`;
  } else if (kind === 3) {
    const start = int(rng, 1, 5);
    const base = int(rng, 1, 3);
    const inc = int(rng, 1, 3);
    terms.push(start);
    for (let i = 1; i < 5; i++) terms.push(terms[i - 1] + base + inc * i);
    next = terms[4] + base + inc * 5;
    rule = `the jump starts at ${base} and grows by ${inc} each time`;
    hint1 = `The jumps grow: ${terms[1] - terms[0]} first, then ${terms[2] - terms[1]}.`;
  } else {
    const [slo, shi] = at(level, PATTERN_ARITH_STEP);
    const step = int(rng, slo, shi);
    const start = kind === 1 ? int(rng, 5, 20) : int(rng, 1, 9);
    terms.push(start);
    for (let i = 1; i < 5; i++) terms.push(terms[i - 1] + step);
    next = terms[4] + step;
    rule = `add ${step} each time`;
    hint1 = `The jump from ${terms[0]} to ${terms[1]} is +${step}; check that the same jump repeats.`;
  }
  return build(
    rng,
    "oa-patterns",
    band(level),
    "integer",
    `What is the next number in this pattern? ${terms.join(", ")}, ?`,
    String(next),
    hint1,
    "Find the rule that turns each term into the next, then apply it one more time.",
    `${terms.join(", ")}, ${next} — the rule is: ${rule}.`,
  );
}

/* Interpreting remainders in context (round up / drop / leftover) */
const REM_DIVISOR: readonly (readonly [number, number])[] = [
  [2, 4],
  [3, 6],
  [4, 8],
  [5, 10],
  [7, 12],
];
const REM_QUOTIENT: readonly (readonly [number, number])[] = [
  [3, 8],
  [4, 10],
  [6, 14],
  [8, 20],
  [10, 30],
];

interface RemContext {
  things: string;
  container: string;
  containerOne: string;
}

const REM_CONTEXTS: readonly RemContext[] = [
  { things: "pencils", container: "boxes", containerOne: "box" },
  { things: "muffins", container: "trays", containerOne: "tray" },
  { things: "books", container: "crates", containerOne: "crate" },
  { things: "stickers", container: "sheets", containerOne: "sheet" },
];

function genRemainders(rng: Rng, level: Level): Problem {
  const [dlo, dhi] = at(level, REM_DIVISOR);
  const [qlo, qhi] = at(level, REM_QUOTIENT);
  const d = int(rng, dlo, dhi);
  const q = int(rng, qlo, qhi);
  const r = int(rng, 1, d - 1);
  const n = d * q + r;
  const ctx = pick(rng, REM_CONTEXTS);
  const kind = pick(rng, level <= 1 ? [0, 1] : [0, 1, 2]);
  let text: string;
  let answer: number;
  let hint1: string;
  let explanation: string;
  if (kind === 0) {
    answer = q + 1;
    text = `${n} ${ctx.things} are packed into ${ctx.container}. Each ${ctx.containerOne} holds no more than ${d} ${ctx.things}. How many ${ctx.container} are needed?`;
    hint1 = `${d} × ${q} = ${d * q}, which leaves ${r} extra — those also need a ${ctx.containerOne}.`;
    explanation = `${n} ÷ ${d} = ${q} remainder ${r}. The ${r} left over still need room, so it takes ${q} + 1 = ${q + 1} ${ctx.container}.`;
  } else if (kind === 1) {
    answer = q;
    text = `${n} ${ctx.things} are shared equally among ${d} friends. How many ${ctx.things} does each friend get?`;
    hint1 = `${d} × ${q} = ${d * q}; the leftover ${r} is fewer than ${d}, so nobody gets another whole one.`;
    explanation = `${n} ÷ ${d} = ${q} remainder ${r}. Each friend gets ${q} whole ${ctx.things}; the ${r} left over cannot be shared evenly, so it is dropped.`;
  } else {
    answer = r;
    text = `${n} ${ctx.things} are shared equally among ${d} friends. How many ${ctx.things} are left over?`;
    hint1 = `Find the largest multiple of ${d} that is not more than ${n}: ${d} × ${q} = ${d * q}.`;
    explanation = `${n} ÷ ${d} = ${q} remainder ${r}: ${n} - ${d * q} = ${r}, so ${r} ${ctx.things} are left over.`;
  }
  return build(
    rng,
    "oa-remainders",
    band(level),
    "integer",
    text,
    String(answer),
    hint1,
    "Compare the leftover with the divisor: sometimes you round up, sometimes you drop it, and sometimes the leftover itself is the answer.",
    explanation,
  );
}

/* Multi-step problems mixing fractions and whole numbers */
const MSF_DEN: readonly (readonly [number, number])[] = [
  [2, 4],
  [2, 5],
  [3, 8],
  [4, 10],
  [5, 10],
];
const MSF_WHOLE: readonly (readonly [number, number])[] = [
  [2, 3],
  [2, 4],
  [3, 6],
  [4, 7],
  [5, 9],
];
const MSF_EXTRA: readonly (readonly [number, number])[] = [
  [1, 2],
  [1, 3],
  [2, 4],
  [3, 6],
  [4, 9],
];

function genMultistepFrac(rng: Rng, level: Level): Problem {
  const [dlo, dhi] = at(level, MSF_DEN);
  const [wlo, whi] = at(level, MSF_WHOLE);
  const [elo, ehi] = at(level, MSF_EXTRA);
  const d = int(rng, dlo, dhi);
  const a = int(rng, 1, d - 1);
  const batches = int(rng, wlo, whi);
  const usedNum = a * batches;
  const start = Math.ceil(usedNum / d) + int(rng, elo, ehi);
  const leftNum = start * d - usedNum;
  const answer = frac(leftNum, d);
  const name = pick(rng, NAMES);
  return build(
    rng,
    "oa-multistep-frac",
    band(level),
    "fraction",
    `A recipe uses ${a}/${d} cup of sugar for each batch. ${name} makes ${batches} batches, starting with ${start} cups of sugar. How much sugar is left? Give your answer as a fraction or whole number.`,
    answer,
    `First find the sugar used: ${a}/${d} × ${batches} = ${frac(usedNum, d)} cup${usedNum > d ? "s" : ""}.`,
    "Multiply to find the amount used, then subtract it from the starting amount. Rewrite the whole number over the same denominator before subtracting.",
    `${a}/${d} × ${batches} = ${frac(usedNum, d)}. Starting with ${start} = ${start * d}/${d}, the sugar left is ${start * d}/${d} - ${usedNum}/${d} = ${leftNum}/${d} = ${answer}.`,
  );
}

/* Write/evaluate numerical expressions (canonical answer is the evaluated value) */
const EXPR_KINDS: readonly (readonly number[])[] = [
  [0],
  [0, 1],
  [0, 1, 2],
  [2, 3],
  [3, 4],
];

function genExpressions(rng: Rng, level: Level): Problem {
  const kind = pick(rng, at(level, EXPR_KINDS));
  const small = level <= 2 ? 9 : 25;
  let words: string;
  let expr: string;
  let answer: number;
  let hint1: string;
  if (kind === 0 || kind === 2) {
    const a = int(rng, 2, small);
    const b = int(rng, 2, small);
    const c = int(rng, 2, 5 + level);
    answer = (a + b) * c;
    words =
      kind === 0
        ? `the sum of ${a} and ${b}, multiplied by ${c}`
        : `the product of ${c} and the sum of ${a} and ${b}`;
    expr = `(${a} + ${b}) × ${c}`;
    hint1 = `The parentheses hold the sum: ${a} + ${b} = ${a + b}, then multiply by ${c}.`;
  } else if (kind === 1) {
    const a = int(rng, 6, small + 6);
    const b = int(rng, 2, a - 1);
    const c = int(rng, 2, 6);
    answer = (a - b) * c;
    words = `the difference of ${a} and ${b}, multiplied by ${c}`;
    expr = `(${a} - ${b}) × ${c}`;
    hint1 = `The parentheses hold the difference: ${a} - ${b} = ${a - b}, then multiply by ${c}.`;
  } else if (kind === 3) {
    const a = int(rng, 2, small);
    const b = int(rng, 2, small);
    const c = int(rng, 2, 5);
    const d = int(rng, 2, small);
    answer = (a + b) * c + d;
    words = `the sum of ${a} and ${b}, multiplied by ${c}, then increased by ${d}`;
    expr = `(${a} + ${b}) × ${c} + ${d}`;
    hint1 = `Parentheses first: ${a} + ${b} = ${a + b}; then multiply by ${c} before adding ${d}.`;
  } else {
    const a = int(rng, 2, small);
    const b = int(rng, 2, small);
    const c = int(rng, 2, 5);
    const d = int(rng, 2, Math.max(2, Math.min(8, c * (a + b) - 1)));
    answer = c * (a + b) - d;
    words = `the product of ${c} and the sum of ${a} and ${b}, then decreased by ${d}`;
    expr = `${c} × (${a} + ${b}) - ${d}`;
    hint1 = `Parentheses first: ${a} + ${b} = ${a + b}; then multiply by ${c} before subtracting ${d}.`;
  }
  const text = `Write the expression for "${words}" and evaluate it. What is the value?`;
  return build(
    rng,
    "oa-expressions",
    band(level),
    "integer",
    text,
    String(answer),
    hint1,
    "Parentheses come first, then multiplication and division, then addition and subtraction.",
    `"${words}" is ${expr} = ${answer}. Work inside the parentheses first, then multiply, then add or subtract.`,
  );
}

/* ============================ Number & Operations in Base Ten ============================ */

/* Multi-digit add/subtract word problems */
const ASW_RANGES: readonly (readonly [number, number])[] = [
  [100, 499],
  [100, 999],
  [1000, 4999],
  [1000, 9999],
  [10000, 99999],
];

function genAddSubWord(rng: Rng, level: Level): Problem {
  const [lo, hi] = at(level, ASW_RANGES);
  let a = int(rng, lo, hi);
  let b = int(rng, lo, hi);
  const add = rng() < 0.5;
  if (!add && a < b) [a, b] = [b, a];
  const name = pick(rng, NAMES);
  const result = add ? a + b : a - b;
  const op = add ? "+" : "-";
  const text = add
    ? `${name} collected ${fmt(a)} bottle caps last year and ${fmt(b)} this year. How many bottle caps is that in all?`
    : `${name} has ${fmt(a)} bottle caps and gives away ${fmt(b)}. How many bottle caps are left?`;
  const hint1 = add
    ? `Add the ones column first: ${a % 10} + ${b % 10}.`
    : `Subtract the ones column first: ${a % 10} - ${b % 10}${a % 10 < b % 10 ? " (borrow 1 ten first)" : ""}.`;
  return build(
    rng,
    "bt-add-sub-word",
    band(level),
    "integer",
    text,
    String(result),
    hint1,
    `Write the numbers under each other and work one column at a time from right to left, ${add ? "carrying" : "borrowing"} when needed.`,
    `${fmt(a)} ${op} ${fmt(b)} = ${fmt(result)}. ${add ? "Add" : "Subtract"} each place-value column from right to left.`,
  );
}

/* Multiply whole numbers by powers of 10 */
const M10_N: readonly (readonly [number, number])[] = [
  [2, 9],
  [3, 12],
  [10, 40],
  [20, 90],
  [100, 999],
];
const M10_K: readonly (readonly number[])[] = [
  [10],
  [10, 100],
  [10, 100, 1000],
  [100, 1000],
  [100, 1000],
];

function genMultiply10s(rng: Rng, level: Level): Problem {
  const [lo, hi] = at(level, M10_N);
  const n = int(rng, lo, hi);
  const k = pick(rng, at(level, M10_K));
  const answer = n * k;
  const zeros = k === 10 ? "one zero" : k === 100 ? "two zeros" : "three zeros";
  const shifts = k === 10 ? 1 : k === 100 ? 2 : 3;
  return build(
    rng,
    "bt-multiply-10s",
    band(level),
    "integer",
    `What is ${fmt(n)} × ${k}?`,
    String(answer),
    `Multiplying by ${k} shifts every digit of ${fmt(n)} left. Write ${fmt(n)} and attach ${zeros}.`,
    "Each factor of 10 moves every digit one place-value to the left, so attach one zero per factor of ten.",
    `${fmt(n)} × ${k} = ${fmt(answer)}. Attaching ${zeros} shifts the digits of ${fmt(n)} ${shifts} place${shifts === 1 ? "" : "s"} to the left.`,
  );
}

/* Estimate by rounding */
function genEstimate(rng: Rng, level: Level): Problem {
  if (level === 5) {
    const a = int(rng, 105, 989);
    const b = int(rng, 12, 88);
    const ra = Math.round(a / 100) * 100;
    const rb = Math.round(b / 10) * 10;
    const answer = ra * rb;
    return build(
      rng,
      "bt-estimate",
      band(level),
      "integer",
      `Estimate ${fmt(a)} × ${b} by rounding ${fmt(a)} to the nearest hundred and ${b} to the nearest ten.`,
      String(answer),
      `${fmt(a)} rounds to ${fmt(ra)} and ${b} rounds to ${fmt(rb)}.`,
      "Round each number to the named place first, then do the easier calculation with the rounded numbers.",
      `${fmt(ra)} × ${fmt(rb)} = ${fmt(answer)}. Rounding first makes the product easy to compute in your head.`,
    );
  }
  const place = level <= 2 ? 10 : level === 3 ? 100 : 1000;
  const placeName = place === 10 ? "ten" : place === 100 ? "hundred" : "thousand";
  const lo = place === 10 ? (level === 1 ? 12 : 105) : place === 100 ? 105 : 1100;
  const hi = place === 10 ? (level === 1 ? 88 : 989) : place === 100 ? 989 : 9899;
  const a = int(rng, lo, hi);
  const b = int(rng, lo, hi);
  const ra = Math.round(a / place) * place;
  const rb = Math.round(b / place) * place;
  const answer = ra + rb;
  return build(
    rng,
    "bt-estimate",
    band(level),
    "integer",
    `Estimate ${fmt(a)} + ${fmt(b)} by rounding each number to the nearest ${placeName}.`,
    String(answer),
    `${fmt(a)} rounds to ${fmt(ra)} and ${fmt(b)} rounds to ${fmt(rb)}.`,
    "Round each number to the named place first, then do the easier calculation with the rounded numbers.",
    `${fmt(ra)} + ${fmt(rb)} = ${fmt(answer)}. Rounding first makes the sum easy to compute in your head.`,
  );
}

/* Compare multi-digit numbers with >, <, or = */
const CMP_DIGITS: readonly number[] = [3, 3, 4, 5, 6];
const PLACE_NAMES = [
  "ones",
  "tens",
  "hundreds",
  "thousands",
  "ten-thousands",
  "hundred-thousands",
];

function genCompareOrder(rng: Rng, level: Level): Problem {
  const digits = at(level, CMP_DIGITS);
  const lo = 10 ** (digits - 1);
  const hi = 10 ** digits - 1;
  const a = int(rng, lo, hi);
  let b = int(rng, lo, hi);
  if (level >= 3 && rng() < 0.2) {
    b = a;
  } else if (a === b) {
    b = a < hi ? a + 1 : a - 1;
  }
  const answer = a > b ? ">" : a < b ? "<" : "=";
  const sa = String(a);
  const sb = String(b);
  let i = 0;
  while (i < sa.length && sa[i] === sb[i]) i++;
  const differ = i < sa.length;
  const placeName = differ ? PLACE_NAMES[sa.length - 1 - i] : "all";
  const hint1 = differ
    ? `Compare place by place from the left: at the ${placeName} place the digits ${sa[i]} and ${sb[i]} already differ.`
    : `Every digit matches in ${fmt(a)} and ${fmt(b)} — line them up from the left and check each place.`;
  const explanation = differ
    ? `${fmt(a)} ${answer} ${fmt(b)}: the first place that differs is the ${placeName} place (${sa[i]} vs ${sb[i]}), and the larger digit there decides.`
    : `${fmt(a)} ${answer} ${fmt(b)}: they have the same digit in every place.`;
  return build(
    rng,
    "bt-compare-order",
    band(level),
    "text",
    `Compare: ${fmt(a)} ? ${fmt(b)}. Write >, <, or = in place of ?.`,
    answer,
    hint1,
    "Compare from the left, one place at a time. The first place where the digits differ decides; if no place differs, the numbers are equal.",
    explanation,
  );
}

/* Expanded form: rebuild from parts, or write the parts from a number */
const EF_DIGITS: readonly number[] = [4, 4, 5, 5, 6];

function genExpandedForm(rng: Rng, level: Level): Problem {
  const digits = at(level, EF_DIGITS);
  if (rng() < 0.5) {
    const ds: number[] = [];
    for (let i = 0; i < digits; i++) ds.push(i <= 1 ? int(rng, 1, 9) : int(rng, 0, 9));
    const parts = ds
      .map((d, i) => d * 10 ** (digits - 1 - i))
      .filter((v) => v > 0);
    const n = parts.reduce((s, v) => s + v, 0);
    return build(
      rng,
      "bt-expanded-form",
      band(level),
      "integer",
      `What number is ${parts.map((v) => fmt(v)).join(" + ")}?`,
      String(n),
      `Add the largest part first: ${fmt(parts[0])} + ${fmt(parts[1])}.`,
      "Each part is a digit times its place value; add the parts from largest to smallest to rebuild the number.",
      `${parts.map((v) => fmt(v)).join(" + ")} = ${fmt(n)}. Add each place-value part to rebuild the number.`,
    );
  }
  const ds: number[] = [];
  for (let i = 0; i < digits; i++) ds.push(int(rng, 1, 9));
  const parts = ds.map((d, i) => d * 10 ** (digits - 1 - i));
  const n = parts.reduce((s, v) => s + v, 0);
  const answer = parts.map((v) => fmt(v)).join(" + ");
  return build(
    rng,
    "bt-expanded-form",
    band(level),
    "text",
    `Write ${fmt(n)} in expanded form. List the parts from largest to smallest, separated by +.`,
    answer,
    `The first digit ${ds[0]} sits in the ${PLACE_NAMES[digits - 1]} place, so its value is ${fmt(parts[0])}.`,
    "Break the number into one part per digit: digit × its place value, from the largest place to the smallest.",
    `${fmt(n)} = ${answer}. Each nonzero digit becomes its digit times its place value.`,
  );
}

/* ================================== Fractions ================================== */

/* Add tenths and hundredths (denominators 10 and 100) */
const A10100_TENTHS: readonly (readonly [number, number])[] = [
  [1, 3],
  [1, 5],
  [1, 9],
  [2, 9],
  [3, 9],
];

function genAddTenthsHundredths(rng: Rng, level: Level): Problem {
  const [alo, ahi] = at(level, A10100_TENTHS);
  const a = int(rng, alo, ahi);
  const b = level <= 2 ? int(rng, 1, 9) * 10 : int(rng, 1, 99);
  const hundredths = a * 10 + b;
  const g = gcd(hundredths, 100);
  const answer = frac(hundredths, 100);
  return build(
    rng,
    "fr-add-unlike-10-100",
    band(level),
    "fraction",
    `What is ${a}/10 + ${b}/100? Give your answer as a fraction.`,
    answer,
    `Rewrite ${a}/10 as ${a * 10}/100 so both fractions have denominator 100.`,
    "Make the denominators match (multiply the tenths fraction top and bottom by 10), then add the numerators and simplify.",
    `${a}/10 + ${b}/100 = ${a * 10}/100 + ${b}/100 = ${hundredths}/100 = ${answer}. Convert tenths to hundredths, add, then simplify${g > 1 ? ` by ${g}` : ""}.`,
  );
}

/* Multiply a fraction by a whole number */
const MFW_DEN: readonly (readonly [number, number])[] = [
  [2, 4],
  [2, 5],
  [3, 8],
  [3, 10],
  [4, 12],
];
const MFW_WHOLE: readonly (readonly [number, number])[] = [
  [2, 4],
  [2, 5],
  [2, 6],
  [3, 9],
  [3, 12],
];

function genMultFractionWhole(rng: Rng, level: Level): Problem {
  const [dlo, dhi] = at(level, MFW_DEN);
  const [wlo, whi] = at(level, MFW_WHOLE);
  const d = int(rng, dlo, dhi);
  const a = int(rng, 1, d - 1);
  const w = int(rng, wlo, whi);
  const product = a * w;
  const g = gcd(product, d);
  const answer = frac(product, d);
  return build(
    rng,
    "fr-mult-fraction-whole",
    band(level),
    "fraction",
    `What is ${a}/${d} × ${w}? Give your answer as a fraction or whole number.`,
    answer,
    `Multiply the numerator by the whole number: ${a} × ${w} = ${product}, and keep the denominator ${d}.`,
    "Multiplying a fraction by a whole number is repeated addition: multiply the numerator by the whole number, keep the denominator, then simplify.",
    `${a}/${d} × ${w} = ${product}/${d} = ${answer}. Multiply the top by ${w}${g > 1 ? `, then simplify by dividing top and bottom by ${g}` : ""}.`,
  );
}

/* Fraction add/subtract word problems (same denominator) */
const FW_DEN: readonly (readonly [number, number])[] = [
  [4, 6],
  [5, 8],
  [6, 10],
  [8, 12],
  [8, 12],
];

const FW_ADD: readonly ((a: number, d: number, b: number) => string)[] = [
  (a, d, b) =>
    `A recipe uses ${a}/${d} cup of milk in the batter and ${b}/${d} cup in the frosting. How many cups of milk are used in all?`,
  (a, d, b) =>
    `Maya walks ${a}/${d} of a mile to the park and ${b}/${d} of a mile back home. How far does she walk in all?`,
];

const FW_SUB: readonly ((a: number, d: number, b: number) => string)[] = [
  (a, d, b) =>
    `A ribbon is ${a}/${d} of a meter long. A piece ${b}/${d} of a meter is cut off. How much ribbon is left?`,
  (a, d, b) =>
    `A pizza has ${a}/${d} of it left. Then ${b}/${d} of the pizza is eaten. What fraction is left now?`,
];

function genFractionWord(rng: Rng, level: Level): Problem {
  const [dlo, dhi] = at(level, FW_DEN);
  const d = int(rng, dlo, dhi);
  const add = rng() < 0.5;
  let a: number;
  let b: number;
  let numerator: number;
  if (add) {
    a = int(rng, 1, d - 2);
    b = int(rng, 1, d - 1 - a);
    numerator = a + b;
  } else {
    a = int(rng, 2, d - 1);
    b = int(rng, 1, a - 1);
    numerator = a - b;
  }
  const g = gcd(numerator, d);
  const answer = frac(numerator, d);
  const text = add ? pick(rng, FW_ADD)(a, d, b) : pick(rng, FW_SUB)(a, d, b);
  const op = add ? "+" : "-";
  return build(
    rng,
    "fr-fraction-word",
    band(level),
    "fraction",
    text,
    answer,
    `The denominators already match (${d}), so keep the denominator and ${add ? "add" : "subtract"} the numerators: ${a} ${op} ${b} = ${numerator}.`,
    "Same denominators mean the parts are the same size: combine the numerators, keep the denominator, then simplify.",
    `${a}/${d} ${op} ${b}/${d} = ${numerator}/${d} = ${answer}. ${add ? "Add" : "Subtract"} the numerators${g > 1 ? ` and simplify by ${g}` : ""}.`,
  );
}

/* ============================== Measurement & Data ============================== */

interface UnitConv {
  factor: number;
  fromOne: string;
  from: string;
  toOne: string;
  to: string;
}

const LEN_CONVS: readonly UnitConv[] = [
  { factor: 100, fromOne: "meter", from: "meters", toOne: "centimeter", to: "centimeters" },
  { factor: 1000, fromOne: "kilometer", from: "kilometers", toOne: "meter", to: "meters" },
  { factor: 3, fromOne: "yard", from: "yards", toOne: "foot", to: "feet" },
  { factor: 12, fromOne: "foot", from: "feet", toOne: "inch", to: "inches" },
  { factor: 36, fromOne: "yard", from: "yards", toOne: "inch", to: "inches" },
  { factor: 5280, fromOne: "mile", from: "miles", toOne: "foot", to: "feet" },
];
const LEN_LEVELS: readonly (readonly number[])[] = [
  [0],
  [0, 1],
  [1, 2, 3],
  [2, 3, 4],
  [1, 4, 5],
];
const LEN_N: readonly (readonly [number, number])[] = [
  [2, 9],
  [3, 9],
  [4, 9],
  [5, 9],
  [6, 9],
];

function genLengthConvert(rng: Rng, level: Level): Problem {
  const conv = LEN_CONVS[pick(rng, at(level, LEN_LEVELS))];
  const [nlo, nhi] = at(level, LEN_N);
  const n = int(rng, nlo, nhi);
  const answer = n * conv.factor;
  const from = n === 1 ? conv.fromOne : conv.from;
  const to = n === 1 ? conv.toOne : conv.to;
  return build(
    rng,
    "md-length-convert",
    band(level),
    "integer",
    `How many ${to} are in ${n} ${from}?`,
    String(answer),
    `${n} ${from} = ${n} × ${fmt(conv.factor)} ${conv.to}.`,
    `Going from a bigger unit to a smaller unit means multiplying: there are ${fmt(conv.factor)} ${conv.to} in each ${conv.fromOne}.`,
    `${n} ${from} = ${n} × ${fmt(conv.factor)} = ${fmt(answer)} ${to}. Multiply by the number of smaller units in one ${conv.fromOne}.`,
  );
}

const MASS_CONVS: readonly UnitConv[] = [
  { factor: 1000, fromOne: "kilogram", from: "kilograms", toOne: "gram", to: "grams" },
  { factor: 1000, fromOne: "liter", from: "liters", toOne: "milliliter", to: "milliliters" },
];
const MASS_N: readonly (readonly [number, number])[] = [
  [1, 3],
  [1, 4],
  [2, 6],
  [2, 9],
  [3, 12],
];

function genMassCapacity(rng: Rng, level: Level): Problem {
  const conv = pick(rng, MASS_CONVS);
  const [nlo, nhi] = at(level, MASS_N);
  const n = int(rng, nlo, nhi);
  const from = n === 1 ? conv.fromOne : conv.from;
  const to = conv.to;
  if (level === 5) {
    const extra = int(rng, 100, 900);
    const answer = n * conv.factor + extra;
    return build(
      rng,
      "md-mass-capacity",
      band(level),
      "integer",
      `${n} ${from} and ${extra} ${to} is how many ${to} in all?`,
      String(answer),
      `First convert: ${n} ${from} = ${n} × ${fmt(conv.factor)} = ${fmt(n * conv.factor)} ${to}.`,
      "Convert the larger unit to the smaller unit by multiplying, then add the extra smaller-unit amount.",
      `${n} ${from} = ${fmt(n * conv.factor)} ${to}, plus ${extra} ${to} = ${fmt(answer)} ${to}.`,
    );
  }
  const answer = n * conv.factor;
  return build(
    rng,
    "md-mass-capacity",
    band(level),
    "integer",
    `How many ${to} are in ${n} ${from}?`,
    String(answer),
    `${n} ${from} = ${n} × ${fmt(conv.factor)} ${to}.`,
    `Going from a bigger unit to a smaller unit means multiplying: there are ${fmt(conv.factor)} ${to} in each ${conv.fromOne}.`,
    `${n} ${from} = ${n} × ${fmt(conv.factor)} = ${fmt(answer)} ${to}. Multiply to change a large unit into small units.`,
  );
}

/* Money word problems (dollars and cents, decimal answer) */
const MONEY_PRICE: readonly (readonly [number, number])[] = [
  [25, 99],
  [100, 399],
  [125, 599],
  [150, 799],
  [199, 999],
];
const MONEY_QTY: readonly (readonly [number, number])[] = [
  [2, 4],
  [2, 4],
  [2, 5],
  [2, 6],
  [2, 6],
];
const MONEY_ITEMS = ["notebooks", "markers", "erasers", "juice boxes", "packs of stickers"];
const MONEY_BILLS = [500, 1000, 2000, 5000, 10000];

function genMoney(rng: Rng, level: Level): Problem {
  const [plo, phi] = at(level, MONEY_PRICE);
  const [qlo, qhi] = at(level, MONEY_QTY);
  const price = int(rng, plo, phi);
  const qty = int(rng, qlo, qhi);
  const total = price * qty;
  const name = pick(rng, NAMES);
  const item = pick(rng, MONEY_ITEMS);
  if (level >= 4 && rng() < 0.5) {
    const bill = MONEY_BILLS.find((b) => b > total) ?? MONEY_BILLS[MONEY_BILLS.length - 1];
    const change = bill - total;
    return build(
      rng,
      "md-money",
      band(level),
      "decimal",
      `${name} buys ${qty} ${item} for ${money(price)} each and pays with ${money(bill)}. How much change does ${name} get, in dollars?`,
      (change / 100).toString(),
      `Work in cents: ${price} cents × ${qty} = ${total} cents, which is ${money(total)}.`,
      "Multiply the price by the quantity in cents, then subtract that total from the amount paid. Write the answer as dollars with a decimal point.",
      `${money(price)} × ${qty} = ${money(total)}. Change = ${money(bill)} - ${money(total)} = ${money(change)}.`,
    );
  }
  return build(
    rng,
    "md-money",
    band(level),
    "decimal",
    `${name} buys ${qty} ${item} for ${money(price)} each. How much does ${name} spend in all, in dollars?`,
    (total / 100).toString(),
    `Work in cents: ${price} cents × ${qty} = ${total} cents.`,
    "Multiply the price in cents by the quantity, then write the result as dollars with a decimal point.",
    `${price} cents × ${qty} = ${total} cents = ${money(total)}.`,
  );
}

/* Line plots with fractional units (described inline) */
const LP_DEN: readonly number[] = [4, 4, 6, 8, 10];
const LP_UNITS = [
  "ribbon lengths in inches",
  "pencil lengths in inches",
  "plant heights in centimeters",
  "paper strip lengths in inches",
];

function genLinePlots(rng: Rng, level: Level): Problem {
  const d = at(level, LP_DEN);
  const nTicks = Math.min(level <= 3 ? 3 : 4, d);
  const ks: number[] = [];
  while (ks.length < nTicks) {
    const k = int(rng, 1, d);
    if (!ks.includes(k)) ks.push(k);
  }
  const counts = ks.map(() => int(rng, 1, 5));
  const unit = pick(rng, LP_UNITS);
  const labels = ks.map((k) => frac(k, d));
  const described = ks.map((k, i) => `${counts[i]} at ${labels[i]}`).join(", ");
  if (nTicks > 3 && rng() < 0.4) {
    const iBig = ks.indexOf(Math.max(...ks));
    const iSmall = ks.indexOf(Math.min(...ks));
    const answer = frac(ks[iBig] - ks[iSmall], d);
    return build(
      rng,
      "md-line-plots",
      band(level),
      "fraction",
      `A line plot of ${unit} shows: ${described}. How much longer is a ${labels[iBig]} one than a ${labels[iSmall]} one?`,
      answer,
      `Subtract the two lengths: ${labels[iBig]} - ${labels[iSmall]}.`,
      "When the denominators match, subtract the numerators and keep the denominator; simplify if you can.",
      `${labels[iBig]} - ${labels[iSmall]} = ${ks[iBig]}/${d} - ${ks[iSmall]}/${d} = ${ks[iBig] - ks[iSmall]}/${d} = ${answer}.`,
    );
  }
  const totalNum = ks.reduce((sum, k, i) => sum + k * counts[i], 0);
  const answer = frac(totalNum, d);
  return build(
    rng,
    "md-line-plots",
    band(level),
    "fraction",
    `A line plot of ${unit} shows: ${described}. What is the total of all the lengths?`,
    answer,
    `Multiply each length by its count, then add: ${counts[0]} × ${labels[0]} = ${frac(ks[0] * counts[0], d)} first.`,
    "Multiply each value by how many times it appears, then add the fractions by giving them the same denominator.",
    `Total = ${ks.map((k, i) => `${counts[i]} × ${labels[i]}`).join(" + ")} = ${totalNum}/${d} = ${answer}.`,
  );
}

/* Angles: decompose and compose additively */
const ANGLE_WHOLE: readonly (readonly [number, number])[] = [
  [40, 90],
  [60, 180],
  [90, 270],
  [120, 360],
  [180, 360],
];
const ANGLE_PARTS: readonly number[] = [2, 2, 2, 3, 3];

function genAngles(rng: Rng, level: Level): Problem {
  const [wlo, whi] = at(level, ANGLE_WHOLE);
  const whole = int(rng, wlo, whi);
  const n = at(level, ANGLE_PARTS);
  if (rng() < 0.5) {
    const part = int(rng, 10, whole - 10);
    const answer = whole - part;
    return build(
      rng,
      "md-angles",
      band(level),
      "integer",
      `A ${whole}° angle is split into two parts. One part measures ${part}°. What is the other part, in degrees?`,
      String(answer),
      `The two parts add to the whole: ${whole} - ${part} = ?`,
      "An angle can be decomposed into smaller angles that add to the whole; subtract the known part from the whole.",
      `${whole}° - ${part}° = ${answer}°. The two parts together make the ${whole}° angle.`,
    );
  }
  const parts: number[] = [];
  let remaining = whole;
  for (let i = 0; i < n - 1; i++) {
    const partsLeft = n - i;
    const hi = Math.max(10, Math.min(remaining - 10 * (partsLeft - 1), Math.floor(remaining * 0.6)));
    const p = int(rng, 10, hi);
    parts.push(p);
    remaining -= p;
  }
  parts.push(remaining);
  const list = parts.map((p) => `${p}°`).join(" + ");
  return build(
    rng,
    "md-angles",
    band(level),
    "integer",
    `An angle is split into ${n} parts measuring ${list}. What is the whole angle, in degrees?`,
    String(whole),
    `${parts[0]}° + ${parts[1]}° = ${parts[0] + parts[1]}°${n === 3 ? `, then add ${parts[2]}°` : ""}.`,
    "When smaller angles are joined to make a larger one, add their measures.",
    `${list} = ${whole}°. Add the parts to get the whole angle.`,
  );
}

/* Area and perimeter in context */
const APW_DIM: readonly (readonly [number, number])[] = [
  [2, 7],
  [2, 9],
  [3, 12],
  [5, 18],
  [8, 30],
];
const APW_CONTEXTS = ["garden", "sandbox", "playground", "field"];

function genAreaPerimeterWord(rng: Rng, level: Level): Problem {
  const [lo, hi] = at(level, APW_DIM);
  const l = int(rng, lo, hi);
  const w = int(rng, lo, hi);
  const ctx = pick(rng, APW_CONTEXTS);
  if (rng() < 0.5) {
    return build(
      rng,
      "md-area-perimeter-word",
      band(level),
      "integer",
      `A rectangular ${ctx} is ${l} meters long and ${w} meters wide. What is its area in square meters?`,
      String(l * w),
      `Area = length × width, so multiply ${l} × ${w}.`,
      "The area of a rectangle is length × width; it counts the square meters that fill it.",
      `Area = ${l} × ${w} = ${l * w} square meters.`,
    );
  }
  return build(
    rng,
    "md-area-perimeter-word",
    band(level),
    "integer",
    `A rectangular ${ctx} is ${l} meters long and ${w} meters wide. How many meters of fence are needed to go all the way around it?`,
    String(2 * (l + w)),
    `Add one long side and one short side: ${l} + ${w} = ${l + w}, then double it.`,
    "The perimeter of a rectangle is 2 × (length + width): it adds all four sides.",
    `Perimeter = 2 × (${l} + ${w}) = 2 × ${l + w} = ${2 * (l + w)} meters.`,
  );
}

/* ================================== Geometry ================================== */

interface ClassifyItem {
  minLevel: number;
  question: string;
  answer: string;
  hint1: string;
  why: string;
}

const POINTS_LINES: readonly ClassifyItem[] = [
  {
    minLevel: 1,
    question: "A named location with no length, width, or size is called a ___.",
    answer: "point",
    hint1: "It marks one exact spot, like the dot labeled A in a figure.",
    why: "a point names an exact location and has no size.",
  },
  {
    minLevel: 1,
    question: "A straight figure that goes on forever in both directions is a ___.",
    answer: "line",
    hint1: "Arrows on both ends show it keeps going both ways.",
    why: "a line extends forever in two opposite directions.",
  },
  {
    minLevel: 1,
    question: "A straight figure with two endpoints that you can measure is a ___.",
    answer: "line segment",
    hint1: "It stops at both ends, so its length can be measured.",
    why: "a line segment is part of a line with two endpoints.",
  },
  {
    minLevel: 1,
    question: "A straight figure that starts at one endpoint and goes on forever in one direction is a ___.",
    answer: "ray",
    hint1: "It has one endpoint and one arrow, so it goes only one way.",
    why: "a ray has one endpoint and extends forever in one direction.",
  },
  {
    minLevel: 3,
    question: "Two lines in the same plane that never meet and stay the same distance apart are ___.",
    answer: "parallel",
    hint1: "Think of the two rails of a straight train track.",
    why: "parallel lines never intersect and stay the same distance apart.",
  },
  {
    minLevel: 3,
    question: "Two lines that meet and form four right angles are ___.",
    answer: "perpendicular",
    hint1: "They cross to make a perfect square corner.",
    why: "perpendicular lines intersect at right angles.",
  },
];

function genPointsLines(rng: Rng, level: Level): Problem {
  const item = pick(rng, POINTS_LINES.filter((x) => x.minLevel <= level));
  return build(
    rng,
    "geo-points-lines",
    band(level),
    "text",
    item.question,
    item.answer,
    item.hint1,
    "Match the figure to its definition: points have no size, lines go both ways, segments have two endpoints, rays have one endpoint, parallel lines never meet, and perpendicular lines meet at right angles.",
    `The figure described is a ${item.answer}: ${item.why}`,
  );
}

const QUADS: readonly ClassifyItem[] = [
  {
    minLevel: 1,
    question: "A quadrilateral has 4 right angles and all 4 sides the same length. What is it called?",
    answer: "square",
    hint1: "All four corners are square corners and every side matches.",
    why: "four right angles plus four equal sides makes a square.",
  },
  {
    minLevel: 1,
    question: "A quadrilateral has 4 right angles, but only its opposite sides are equal (not all four). What is it called?",
    answer: "rectangle",
    hint1: "Four square corners, with two long sides and two short sides.",
    why: "a rectangle has four right angles and opposite sides equal, but not necessarily four equal sides.",
  },
  {
    minLevel: 2,
    question: "A quadrilateral has exactly one pair of parallel sides. What is it called?",
    answer: "trapezoid",
    hint1: "Only the top and bottom are parallel; the other two sides are not.",
    why: "a trapezoid has exactly one pair of parallel sides.",
  },
  {
    minLevel: 3,
    question: "A quadrilateral has all 4 sides equal and opposite sides parallel, but no right angles. What is it called?",
    answer: "rhombus",
    hint1: "It looks like a tilted square: equal sides, but no square corners.",
    why: "a rhombus has four equal sides with opposite sides parallel and no right angles.",
  },
  {
    minLevel: 3,
    question: "A quadrilateral has both pairs of opposite sides parallel and equal, but no right angles and not all sides equal. What is it called?",
    answer: "parallelogram",
    hint1: "Opposite sides are parallel and equal, like a leaning rectangle.",
    why: "a parallelogram has two pairs of parallel sides, with no right angles required.",
  },
];

function genQuadrilaterals(rng: Rng, level: Level): Problem {
  const item = pick(rng, QUADS.filter((x) => x.minLevel <= level));
  return build(
    rng,
    "geo-quadrilaterals",
    band(level),
    "text",
    item.question,
    item.answer,
    item.hint1,
    "Use the definitions: a square has 4 right angles and 4 equal sides; a rectangle has 4 right angles; a rhombus has 4 equal sides; a parallelogram has two pairs of parallel sides; a trapezoid has exactly one pair.",
    `It is a ${item.answer}: ${item.why}`,
  );
}

/* Read/plot a point in quadrant 1 */
const COORD_MAX: readonly number[] = [5, 6, 7, 8, 9];

function genCoordinateIntro(rng: Rng, level: Level): Problem {
  if (level === 5) {
    const sx = int(rng, 1, 3);
    const sy = int(rng, 1, 3);
    const dx = int(rng, 1, 9 - sx);
    const dy = int(rng, 1, 9 - sy);
    const tx = sx + dx;
    const ty = sy + dy;
    return build(
      rng,
      "geo-coordinate-intro",
      band(level),
      "text",
      `Point A is at (${sx}, ${sy}) on the grid. You move ${dx} units right and ${dy} units up. What are the new coordinates? Write them like this: x, y.`,
      `${tx}, ${ty}`,
      `Start at x = ${sx} and add the move right: ${sx} + ${dx} = ${tx}.`,
      "The first number counts steps right (add moves right) and the second counts steps up (add moves up).",
      `Starting at (${sx}, ${sy}), moving right ${dx} and up ${dy} lands at (${tx}, ${ty}).`,
    );
  }
  const x = int(rng, 1, at(level, COORD_MAX));
  const y = int(rng, 1, at(level, COORD_MAX));
  return build(
    rng,
    "geo-coordinate-intro",
    band(level),
    "text",
    `Point A is ${x} units to the right and ${y} units up from the origin (0, 0). What are its coordinates? Write them like this: x, y.`,
    `${x}, ${y}`,
    `Moving right ${x} means x = ${x}; moving up ${y} means y = ${y}.`,
    "In the first quadrant, the first number counts steps right (x) and the second counts steps up (y).",
    `From (0, 0), go right ${x} and up ${y}: point A is (${x}, ${y}).`,
  );
}

/* Quadrilateral hierarchy in grade 5 */
interface HierarchyItem {
  minLevel: number;
  question: string;
  answer: string;
  hint1: string;
  why: string;
}

const QUAD_HIERARCHY: readonly HierarchyItem[] = [
  {
    minLevel: 1,
    question: "Is every square a rectangle?",
    answer: "yes",
    hint1: "Check a square against the rectangle rules: 4 right angles? Yes. Opposite sides equal? Yes.",
    why: "a square has 4 right angles and opposite sides parallel and equal, so it is a special rectangle.",
  },
  {
    minLevel: 1,
    question: "Is every square a rhombus?",
    answer: "yes",
    hint1: "A square has 4 equal sides, which is exactly the rule for a rhombus.",
    why: "a square has 4 equal sides with opposite sides parallel, which is exactly a rhombus.",
  },
  {
    minLevel: 1,
    question: "Is every rectangle a square?",
    answer: "no",
    hint1: "Picture a long, narrow rectangle: two sides are longer than the other two.",
    why: "a rectangle can have two long sides and two short sides, so it is not always a square.",
  },
  {
    minLevel: 2,
    question: "Is every square a parallelogram?",
    answer: "yes",
    hint1: "Both pairs of opposite sides of a square are parallel.",
    why: "both pairs of opposite sides of a square are parallel, so it is a parallelogram.",
  },
  {
    minLevel: 2,
    question: "Is every rhombus a parallelogram?",
    answer: "yes",
    hint1: "A rhombus has two pairs of parallel sides by definition.",
    why: "a rhombus has two pairs of parallel sides, so it is a parallelogram.",
  },
  {
    minLevel: 3,
    question: "Is every rhombus a square?",
    answer: "no",
    hint1: "Picture a rhombus leaning to one side: its angles are not right angles.",
    why: "a rhombus can lean, so its angles need not be right angles.",
  },
  {
    minLevel: 3,
    question: "Is every parallelogram a rectangle?",
    answer: "no",
    hint1: "A parallelogram can lean without any square corners.",
    why: "a parallelogram can lean without any right angles, so it is not always a rectangle.",
  },
  {
    minLevel: 4,
    question: "Is every rectangle a parallelogram?",
    answer: "yes",
    hint1: "In a rectangle, both pairs of opposite sides are parallel.",
    why: "a rectangle has two pairs of parallel opposite sides, so it is a parallelogram.",
  },
  {
    minLevel: 5,
    question: "Is every trapezoid a parallelogram?",
    answer: "no",
    hint1: "A trapezoid has exactly one pair of parallel sides; a parallelogram needs two.",
    why: "a trapezoid has exactly one pair of parallel sides, but a parallelogram needs two pairs.",
  },
];

function genQuadHierarchy(rng: Rng, level: Level): Problem {
  const item = pick(rng, QUAD_HIERARCHY.filter((x) => x.minLevel <= level));
  return build(
    rng,
    "geo-quad-hierarchy",
    band(level),
    "text",
    item.question,
    item.answer,
    item.hint1,
    "Follow the shape hierarchy: square ⊂ rectangle ⊂ parallelogram and square ⊂ rhombus ⊂ parallelogram. A claim that every X is Y fails as soon as one example of X is not a Y.",
    `${item.answer === "yes" ? "Yes" : "No"} — ${item.why}`,
  );
}

/* ============================== Registries ============================== */

export const EXTRA_GENERATORS: Record<string, Generator> = {
  "oa-mult-2digit-2digit": genMult2x2,
  "oa-factor-pairs": genFactorPairs,
  "oa-multiples-prime": genMultiplesPrime,
  "oa-patterns": genPatterns,
  "oa-remainders": genRemainders,
  "oa-multistep-frac": genMultistepFrac,
  "oa-expressions": genExpressions,
  "bt-add-sub-word": genAddSubWord,
  "bt-multiply-10s": genMultiply10s,
  "bt-estimate": genEstimate,
  "bt-compare-order": genCompareOrder,
  "bt-expanded-form": genExpandedForm,
  "fr-add-unlike-10-100": genAddTenthsHundredths,
  "fr-mult-fraction-whole": genMultFractionWhole,
  "fr-fraction-word": genFractionWord,
  "md-length-convert": genLengthConvert,
  "md-mass-capacity": genMassCapacity,
  "md-money": genMoney,
  "md-line-plots": genLinePlots,
  "md-angles": genAngles,
  "md-area-perimeter-word": genAreaPerimeterWord,
  "geo-points-lines": genPointsLines,
  "geo-quadrilaterals": genQuadrilaterals,
  "geo-coordinate-intro": genCoordinateIntro,
  "geo-quad-hierarchy": genQuadHierarchy,
};

/** Grade band per extra skill id (matches `SKILLS` in `src/lib/skills.ts`). */
export const EXTRA_GRADES: Record<string, 4 | 5> = {
  "oa-mult-2digit-2digit": 4,
  "oa-factor-pairs": 4,
  "oa-multiples-prime": 4,
  "oa-patterns": 4,
  "oa-remainders": 4,
  "oa-multistep-frac": 5,
  "oa-expressions": 5,
  "bt-add-sub-word": 4,
  "bt-multiply-10s": 4,
  "bt-estimate": 4,
  "bt-compare-order": 4,
  "bt-expanded-form": 4,
  "fr-add-unlike-10-100": 4,
  "fr-mult-fraction-whole": 4,
  "fr-fraction-word": 4,
  "md-length-convert": 4,
  "md-mass-capacity": 4,
  "md-money": 4,
  "md-line-plots": 4,
  "md-angles": 4,
  "md-area-perimeter-word": 4,
  "geo-points-lines": 4,
  "geo-quadrilaterals": 4,
  "geo-coordinate-intro": 4,
  "geo-quad-hierarchy": 5,
};
