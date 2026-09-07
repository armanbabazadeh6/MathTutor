import type { ReactNode } from "react";

/** Back-compat Card, restyled to chunky 3D. */
export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-3xl border-2 border-line bg-card p-6"
      style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
    >
      <h2 className="font-display text-kid-xl font-semibold">{title}</h2>
      {subtitle ? <p className="mt-1 text-kid-sm font-semibold text-muted">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
