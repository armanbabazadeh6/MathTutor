"use client";

import { tapTick } from "@/components/effects/haptics";

export type LessonNodeState = "locked" | "available" | "current" | "done" | "chest";

export type LessonNode = {
  id: string;
  label: string;
  state: LessonNodeState;
  /** Optional one-line detail shown under the label. */
  detail?: string;
};

function NodeGlyph({ state }: { state: LessonNodeState }) {
  if (state === "locked")
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
        <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#fff" />
        <path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  if (state === "chest")
    return (
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
        <rect x="3" y="9" width="18" height="11" rx="2.5" fill="#fff" />
        <path d="M3 12.5h18" stroke="#a568cc" strokeWidth="2" />
        <path d="M4.5 9c0-3 3-5 7.5-5s7.5 2 7.5 5" fill="none" stroke="#fff" strokeWidth="2.4" />
        <circle cx="12" cy="14.5" r="2.2" fill="#ffc800" />
      </svg>
    );
  if (state === "done")
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="#fff" />
    </svg>
  );
}

const skin: Record<LessonNodeState, { bg: string; border: string; shadow: string }> = {
  done: { bg: "var(--color-sunny)", border: "var(--color-sunny-dark)", shadow: "var(--color-sunny-dark)" },
  current: { bg: "var(--color-primary)", border: "var(--color-primary-dark)", shadow: "var(--color-primary-dark)" },
  available: { bg: "var(--color-sky)", border: "var(--color-sky-dark)", shadow: "var(--color-sky-dark)" },
  locked: { bg: "var(--color-line-soft)", border: "var(--color-line)", shadow: "var(--color-line)" },
  chest: { bg: "var(--color-grape)", border: "var(--color-grape-dark)", shadow: "var(--color-grape-dark)" },
};

const STATE_WORD: Record<LessonNodeState, string> = {
  done: "finished",
  current: "up next",
  available: "ready to play",
  locked: "locked",
  chest: "prize chest",
};

/**
 * Winding node path with an SVG connector. Original art, no third-party assets.
 *
 * Node positions are percentages of the container width, so the path can never
 * overflow on a 320px phone. Each node button contains its own label, so the
 * whole tile is one tappable target and screen readers announce it once.
 */
export function LessonPath({
  nodes,
  onSelect,
}: {
  nodes: LessonNode[];
  onSelect?: (id: string) => void;
}) {
  const gap = 104;
  const H = Math.max(140, nodes.length * gap);
  // Percentage offset keeps the winding shape at any width.
  const pts = nodes.map((_, i) => ({
    x: 50 + Math.sin(i * 0.95) * 22, // 28%..72%
    y: 56 + i * gap,
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x / 100) * 320},${p.y}`)
    .join(" ");

  return (
    <div className="relative mx-auto w-full max-w-[360px]" role="list" aria-label="Lesson path">
      <svg
        viewBox={`0 0 320 ${H}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
        preserveAspectRatio="none"
      >
        <path
          d={line}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray="2 14"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative" style={{ height: H }}>
        {nodes.map((n, i) => {
          const s = skin[n.state];
          const big = n.state === "current";
          const size = big ? 92 : 76;
          const locked = n.state === "locked";
          return (
            <div
              key={n.id}
              role="listitem"
              className="absolute mt-stagger-fade flex w-[7.5rem] flex-col items-center"
              style={{
                left: `${pts[i].x}%`,
                top: pts[i].y,
                transform: "translate(-50%,-50%)",
                animationDelay: `${Math.min(i, 8) * 60}ms`,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  tapTick();
                  onSelect?.(n.id);
                }}
                disabled={locked}
                aria-label={`${n.label}, ${STATE_WORD[n.state]}`}
                className={`duo-press duo-path-node mt-focus relative flex flex-col items-center rounded-card px-1 pb-1 ${
                  big ? "animate-duo-bounce-soft" : ""
                }`}
              >
                <span
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: size,
                    height: size,
                    background: s.bg,
                    border: `3px solid ${s.border}`,
                    boxShadow: `0 5px 0 ${s.shadow}`,
                  }}
                >
                  <NodeGlyph state={n.state} />
                </span>
                <span
                  className={`mt-1.5 max-w-[7.5rem] text-center font-display text-kid-xs font-bold leading-tight ${
                    locked ? "text-muted" : "text-ink"
                  }`}
                >
                  {n.label}
                </span>
                {n.detail ? (
                  <span className="mt-0.5 max-w-[7.5rem] text-center text-kid-xs font-semibold leading-tight text-muted">
                    {n.detail}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
