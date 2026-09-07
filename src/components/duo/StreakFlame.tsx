/** Original flame badge — no third-party assets. */
export function StreakFlame({ count, lit = true }: { count: number; lit?: boolean }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-pill border-2 border-line bg-card px-3 py-1.5"
      role="status"
      aria-label={`${count} day streak`}
      style={{ opacity: lit ? 1 : 0.55, boxShadow: "0 3px 0 var(--chunky-shadow)" }}
    >
      <svg viewBox="0 0 24 28" width="20" height="24" aria-hidden className={lit ? "animate-duo-wiggle" : undefined}>
        <path
          d="M12 1c1 5-4 7-4 12a4.5 4.5 0 009 .5C18.5 9 12 7 12 1z"
          fill={lit ? "#ff9600" : "#cfcfcf"}
          stroke={lit ? "#e07f00" : "#b8ad9e"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M12 12c.5 2.5-2 3.5-2 6a2.6 2.6 0 005.2.3C16 15.5 12 14.5 12 12z" fill={lit ? "#ffc800" : "#e5e5e5"} />
      </svg>
      <span className="font-display text-kid-lg font-bold text-accent">{count}</span>
    </div>
  );
}
