export type LessonNodeState = "locked" | "current" | "done" | "chest";

export type LessonNode = {
  id: string;
  label: string;
  state: LessonNodeState;
};

function NodeGlyph({ state }: { state: LessonNodeState }) {
  if (state === "done")
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === "locked")
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
        <rect x="6" y="10" width="12" height="9" rx="2.5" fill="#b8ad9e" />
        <path d="M8.5 10V8a3.5 3.5 0 017 0v2" fill="none" stroke="#b8ad9e" strokeWidth="2.5" />
        <circle cx="12" cy="14" r="1.6" fill="#fff" />
      </svg>
    );
  if (state === "chest")
    return (
      <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
        <rect x="3" y="9" width="18" height="11" rx="2.5" fill="#ffc800" stroke="#e0a800" strokeWidth="2" />
        <rect x="3" y="9" width="18" height="5" rx="2.5" fill="#ff9600" />
        <rect x="10.5" y="9" width="3" height="11" fill="#e0a800" />
        <circle cx="12" cy="14.5" r="1.8" fill="#fff8ea" />
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
  locked: { bg: "#e5e5e5", border: "#cfcfcf", shadow: "#cfcfcf" },
  chest: { bg: "var(--color-grape)", border: "var(--color-grape-dark)", shadow: "var(--color-grape-dark)" },
};

/** Winding node path with SVG connector. Original art, no third-party assets. */
export function LessonPath({
  nodes,
  onSelect,
}: {
  nodes: LessonNode[];
  onSelect?: (id: string) => void;
}) {
  const W = 320;
  const gap = 96;
  const H = Math.max(120, nodes.length * gap + 40);
  const pts = nodes.map((_, i) => ({
    x: W / 2 + Math.sin(i * 0.9) * 72,
    y: 44 + i * gap,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  return (
    <div className="relative mx-auto w-full max-w-[340px]" role="list" aria-label="Lesson path">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="xMidYMin meet">
        <path d={path} fill="none" stroke="var(--color-line)" strokeWidth="10" strokeLinecap="round" strokeDasharray="2 14" />
      </svg>
      <div className="relative" style={{ height: H }}>
        {nodes.map((n, i) => {
          const s = skin[n.state];
          const big = n.state === "current";
          const size = big ? 84 : 68;
          return (
            <div key={n.id} role="listitem" className="absolute" style={{ left: pts[i].x, top: pts[i].y, transform: "translate(-50%,-50%)" }}>
              <button
                type="button"
                onClick={() => onSelect?.(n.id)}
                disabled={n.state === "locked"}
                aria-label={`${n.label} — ${n.state}`}
                className={`duo-press duo-path-node flex items-center justify-center rounded-full ${big ? "animate-duo-bounce-soft" : ""}`}
                style={{
                  width: size,
                  height: size,
                  background: s.bg,
                  border: `3px solid ${s.border}`,
                  boxShadow: `0 5px 0 ${s.shadow}`,
                  cursor: n.state === "locked" ? "not-allowed" : "pointer",
                  opacity: n.state === "locked" ? 0.85 : 1,
                }}
              >
                <NodeGlyph state={n.state} />
              </button>
              <p className="mt-1 text-center font-display text-sm font-semibold" style={{ color: n.state === "locked" ? "var(--color-muted)" : "var(--color-ink)" }}>
                {n.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
