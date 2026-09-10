"use client";

import { useEffect, useRef, useState } from "react";
import "./effects.css";

/**
 * Animated number for scores and XP.
 *
 * Always ends on the true value: it jumps straight there when the user asks
 * for reduced motion, when the tab is not visible (a throttled
 * `requestAnimationFrame` would otherwise leave the display stuck on its
 * starting value), and via a timer safety net if rAF never ticks at all.
 */
export function CountUp({
  value,
  duration = 800,
  prefix = "",
  suffix = "",
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  // Always start at 0 so the server and client's first render agree; the
  // effect below decides whether to animate or snap to the real value.
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const from = fromRef.current;
    // No animation when the user asked for less motion, or when rAF would be
    // throttled by a background tab — show the true number instead of a stale 0.
    if (reduced || document.visibilityState === "hidden" || from === value) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / Math.max(1, duration));
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    // Safety net: if rAF never ticks, snap to the real number.
    const settle = setTimeout(() => {
      fromRef.current = value;
      setDisplay(value);
    }, duration + 250);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      fromRef.current = value;
    };
  }, [value, duration]);

  return (
    <span className="mt-count-up" role="status" aria-label={`${prefix}${value.toLocaleString("en-US")}${suffix}`}>
      {prefix}
      {display.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
