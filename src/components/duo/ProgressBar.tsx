"use client";

/**
 * The one progress bar in the app.
 *
 * Fill (`--color-primary-btn`) vs track (`--color-line`) is 3.25:1 — the vivid
 * decor green would only reach 1.45:1 and is not a legal UI boundary.
 * Animated width changes are inert under `prefers-reduced-motion` via the
 * global rule in globals.css.
 */
export function ProgressBar({
  value,
  max,
  label,
  tone = "primary",
  size = "md",
  className = "",
}: {
  /** Current amount, in the same units as `max`. Values are clamped. */
  value: number;
  max: number;
  /** Accessible name; also rendered visually when `showLabel` is set. */
  label: string;
  tone?: "primary" | "sky" | "accent";
  size?: "sm" | "md";
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const fill =
    tone === "sky" ? "var(--color-sky-ink)" : tone === "accent" ? "var(--color-accent-ink)" : "var(--color-primary-btn)";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-label={label}
      className={`overflow-hidden rounded-pill border-2 border-line bg-line ${size === "sm" ? "h-3" : "h-5"} ${className}`}
    >
      <div
        className="h-full rounded-pill transition-[width] duration-300 ease-soft"
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  );
}
