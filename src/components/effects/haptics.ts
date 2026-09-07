/** Guarded haptics for iPad taps. All no-ops where `navigator.vibrate` is
 * unsupported (desktop Safari, some iPads) — never throws, never needs state. */

function buzz(pattern: number | number[]): void {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && typeof nav.vibrate === "function") nav.vibrate(pattern);
  } catch {
    /* haptics are decoration — never break a tap */
  }
}

/** Light 10ms tick for everyday taps (buttons, nav, path nodes). */
export function tapTick(): void {
  buzz(10);
}

/** Short double-tick for correct answers / prize-ready moments. */
export function successBuzz(): void {
  buzz([12, 40, 12]);
}

/** Longer triple pattern for level-ups / perfect scores. */
export function levelUpBuzz(): void {
  buzz([15, 50, 15, 50, 40]);
}
