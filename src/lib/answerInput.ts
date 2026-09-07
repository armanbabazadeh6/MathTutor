// MathTutor — fraction-friendly answer input contract.
//
// iOS hides "/" behind `inputMode="decimal"`, so fraction answers are
// untypeable on iPhones. Both student inputs (ProblemPlayer, TeachView) use
// ANSWER_INPUT_MODE plus a keypad row with a dedicated fraction-bar key.

/** Keyboard mode for answer inputs: full keyboard so "/" stays reachable. */
export const ANSWER_INPUT_MODE = "text" as const;

/** Chars offered by the on-screen keypad next to the answer input. */
export const ANSWER_KEYPAD_CHARS = ["/", ".", "-"] as const;

/** Append a keypad char to the current input value. */
export function appendKeypadChar(current: string, ch: string): string {
  return `${current}${ch}`;
}
