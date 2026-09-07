"use client";

import "./effects.css";

type SkeletonProps = {
  className?: string;
  label?: string;
};

/** Single shimmer block. CSS-only; collapses to a static block under
 * prefers-reduced-motion. Width/height come from the caller's className. */
export function Skeleton({ className = "", label = "Loading…" }: SkeletonProps) {
  return <div role="status" aria-label={label} className={`mt-skeleton ${className}`} />;
}

type ListSkeletonProps = {
  rows?: number;
  className?: string;
  label?: string;
};

/** Card-shaped shimmer rows for quest/plan loading states. Pure placeholder —
 * mount it where the real card will appear so layout doesn't shift. */
export function ListSkeleton({ rows = 3, className = "", label = "Loading…" }: ListSkeletonProps) {
  return (
    <div role="status" aria-label={label} className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="mt-skeleton mt-stagger-item rounded-3xl border-2 border-line bg-card p-5"
          style={{ animationDelay: `${Math.min(i, 8) * 60}ms`, minHeight: 88 }}
        />
      ))}
    </div>
  );
}
