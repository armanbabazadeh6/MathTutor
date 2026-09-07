/** Original gem counter — no third-party assets. */
export function GemCounter({ gems, label }: { gems: number; label?: string }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-pill border-2 border-line bg-card px-3 py-1.5"
      role="status"
      aria-label={label ?? `${gems} gems`}
      style={{ boxShadow: "0 3px 0 var(--chunky-shadow)" }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M7 3h10l4 6-9 12L3 9z" fill="#1cb0f6" stroke="#1899d6" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M7 3l5 6 5-6" fill="none" stroke="#bfe9ff" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M3 9h18" stroke="#1899d6" strokeWidth="1.4" fill="none" />
      </svg>
      <span className="font-display text-kid-lg font-bold text-sky">{gems}</span>
    </div>
  );
}
