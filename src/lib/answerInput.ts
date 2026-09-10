// MathTutor — answer input contract shared by the student answer fields.
//
// Two things have to hold for a kid typing on an iPad:
//
//   1. A numeric answer must open the digit keyboard. Asking for the
//      alphabetic one costs an extra "123" tap on every single answer.
//   2. "/" and "-" are not on the iOS digit pad, so the field ships its own
//      keypad row for fractions and negatives, plus ⌫ and Clear so a mistake
//      never has to be un-typed one character at a time.
//
// Answers that can contain letters (a remainder like "6 R 2") are the one
// exception: the digit pad has no route back to letters on iOS, so those keep
// the full keyboard — hence `ANSWER_INPUT_MODES`.

import type { AnswerType } from "@/lib/math/types";

/**
 * Full keyboard. Only an answer that can contain a letter still needs it;
 * `TeachView` (whose check answer lives outside this file) still asks for it.
 */
export const ANSWER_INPUT_MODE = "text" as const;

/**
 * The keyboard each answer type asks for. Numeric answers get the digit pad;
 * `text` is the remainder-style answer ("6 R 2") the digit pad cannot spell.
 */
export const ANSWER_INPUT_MODES: Record<AnswerType, "decimal" | "text"> = {
  integer: "decimal",
  decimal: "decimal",
  fraction: "decimal",
  text: ANSWER_INPUT_MODE,
};

/** Chars offered by the on-screen keypad next to the answer input. */
export const ANSWER_KEYPAD_CHARS = ["/", ".", "-"] as const;

/** Append a keypad char to the current input value. */
export function appendKeypadChar(current: string, ch: string): string {
  return `${current}${ch}`;
}
