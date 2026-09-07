/** Back-compat ProgressBar, restyled chunky 3D with shine. */
export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div
        className="h-5 overflow-hidden rounded-pill border-2 border-line bg-line"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="duo-shine-wrap relative h-full rounded-pill transition-[width] duration-300"
          style={{ width: `${pct}%`, background: "var(--color-primary)", borderRight: "2px solid var(--color-primary-dark)" }}
        >
          <span aria-hidden className="duo-shine-bar" />
        </div>
      </div>
      {label ? <p className="mt-1 text-sm font-bold text-muted">{label}</p> : null}
    </div>
  );
}
