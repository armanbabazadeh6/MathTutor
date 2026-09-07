"use client";

import "./effects.css";

/** Ring showing progress toward a goal (e.g. XP to next reward). Pure SVG + CSS. */
export function ProgressRing({
  value,
  max,
  size = 88,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const text = `${Math.round(pct * 100)}%`;
  return (
    <div
      className="mt-ring"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.round(max))}
      aria-label={label ?? `${Math.round(value)} of ${Math.round(max)}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="mt-ring-svg">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="mt-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="mt-ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span aria-hidden className="mt-ring-text">
        {text}
      </span>
    </div>
  );
}
