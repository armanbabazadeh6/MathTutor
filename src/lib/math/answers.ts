import type { AnswerType } from "./types";

/**
 * Canonical normalization for student input:
 * trim, drop thousands separators, collapse whitespace, lowercase.
 */
export function normalizeAnswer(raw: string): string {
  return raw.trim().replace(/,/g, "").replace(/\s+/g, " ").toLowerCase();
}

export interface FractionParts {
  num: number;
  den: number;
}

/** Parse "a/b" (integers, optional surrounding space/signs). Null when not a fraction. */
export function parseFraction(raw: string): FractionParts | null {
  const s = normalizeAnswer(raw).replace(/\s+/g, "");
  const m = /^([+-]?\d+)\/([+-]?\d+)$/.exec(s);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const den = parseInt(m[2], 10);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return { num, den };
}

/** a/b == c/d via cross-multiplication — exact integer math, no float error. */
export function isEquivalentFraction(a: string, b: string): boolean {
  const fa = parseFraction(a);
  const fb = parseFraction(b);
  if (!fa || !fb) return false;
  return fa.num * fb.den === fb.num * fa.den;
}

function toNumber(s: string): number | null {
  const t = normalizeAnswer(s).replace(/\s+/g, "");
  if (t === "" || t === "+" || t === "-" || t === "." || t === "+." || t === "-.") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Numeric value of an integer, decimal, or fraction string. Null when unparseable. */
export function numericValue(raw: string): number | null {
  const f = parseFraction(raw);
  if (f) return f.num / f.den;
  return toNumber(raw);
}

/** Exact integer comparison after normalization ("1,000" == "1000"). */
export function compareInteger(expected: string, submitted: string): boolean {
  const e = toNumber(expected);
  const s = toNumber(submitted);
  if (e === null || s === null) return false;
  if (!Number.isInteger(e) || !Number.isInteger(s)) return false;
  return e === s;
}

export const DEFAULT_DECIMAL_TOLERANCE = 0.001;

/** Decimal comparison within an absolute tolerance ("2.50" == "2.5"). */
export function compareDecimal(
  expected: string,
  submitted: string,
  tolerance: number = DEFAULT_DECIMAL_TOLERANCE,
): boolean {
  const e = numericValue(expected);
  const s = numericValue(submitted);
  if (e === null || s === null) return false;
  return Math.abs(e - s) <= tolerance;
}

/** Normalized string equality, tolerating spacing differences ("6 R 2" == "6R2"). */
export function compareText(expected: string, submitted: string): boolean {
  const e = normalizeAnswer(expected);
  const s = normalizeAnswer(submitted);
  if (e === s) return true;
  return e.replace(/\s+/g, "") === s.replace(/\s+/g, "");
}

/**
 * Dispatch on answer type. Fraction answers accept an equivalent fraction
 * (cross-multiplied) or a numerically-equal decimal within tolerance.
 */
export function isCorrectAnswer(expected: string, submitted: string, answerType: AnswerType): boolean {
  switch (answerType) {
    case "integer":
      return compareInteger(expected, submitted);
    case "decimal":
      return compareDecimal(expected, submitted);
    case "fraction": {
      const fe = parseFraction(expected);
      const fs = parseFraction(submitted);
      if (fe && fs) return fe.num * fs.den === fs.num * fe.den;
      return compareDecimal(expected, submitted);
    }
    case "text":
      return compareText(expected, submitted);
  }
}
