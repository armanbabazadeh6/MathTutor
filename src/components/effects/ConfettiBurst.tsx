"use client";

import type { CSSProperties } from "react";
import "./effects.css";

const PIECES = ["🎉", "⭐", "✨", "🎊", "🥳", "💛", "💚", "🩵"];

/** Fixed fan-out so server and client render the same burst (no hydration flip). */
const SPREAD = [
  { dx: "-88px", dy: "-64px", rot: "-70deg" },
  { dx: "-52px", dy: "-84px", rot: "-30deg" },
  { dx: "-16px", dy: "-92px", rot: "10deg" },
  { dx: "20px", dy: "-88px", rot: "40deg" },
  { dx: "56px", dy: "-72px", rot: "70deg" },
  { dx: "88px", dy: "-48px", rot: "100deg" },
  { dx: "-70px", dy: "-40px", rot: "-100deg" },
  { dx: "72px", dy: "-24px", rot: "60deg" },
];

/**
 * Completion burst (perfect session, goal reached, new badge).
 * Decorative layer is pointer-events safe for iPad taps; text stays readable.
 */
export function ConfettiBurst({ label, pieces = 8 }: { label?: string; pieces?: number }) {
  const count = Math.max(1, Math.min(pieces, PIECES.length));
  const shown = PIECES.slice(0, count);
  return (
    <div className="mt-burst" role="status" aria-live="polite" aria-label={label ?? "Hooray! Great work!"}>
      {label ? <p className="mt-burst-label">{label}</p> : null}
      <div aria-hidden className="mt-burst-field">
        {shown.map((p, i) => {
          const s = SPREAD[i % SPREAD.length];
          return (
            <span
              key={i}
              className="mt-burst-piece"
              style={
                {
                  "--mt-dx": s.dx,
                  "--mt-dy": s.dy,
                  "--mt-rot": s.rot,
                  animationDelay: `${i * 60}ms`,
                } as CSSProperties
              }
            >
              {p}
            </span>
          );
        })}
      </div>
    </div>
  );
}
