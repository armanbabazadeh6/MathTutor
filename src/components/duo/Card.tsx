import type { ReactNode } from "react";

type Tone = "plain" | "mint" | "sunny" | "sky" | "grape";

const tones: Record<Tone, string> = {
  plain: "bg-card",
  mint: "bg-mint",
  sunny: "bg-sunny",
  sky: "bg-sky",
  grape: "bg-grape",
};

/** Chunky card — thick radius, chunky shadow. Original styling. */
export function DuoCard({
  title,
  subtitle,
  icon,
  tone = "plain",
  shine = false,
  className = "",
  children,
}: {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: Tone;
  shine?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-3xl border-2 border-line p-5 sm:p-6 ${tones[tone]} ${shine ? "duo-shine-wrap" : ""} ${className}`}
      style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
    >
      {title || icon ? (
        <header className="flex items-center gap-3">
          {icon ? <span aria-hidden className="shrink-0">{icon}</span> : null}
          <div>
            {title ? <h2 className="font-display text-kid-xl font-semibold">{title}</h2> : null}
            {subtitle ? <p className="text-kid-sm font-semibold text-muted">{subtitle}</p> : null}
          </div>
        </header>
      ) : null}
      <div className={title || icon ? "mt-4" : ""}>{children}</div>
      {shine ? <span aria-hidden className="duo-shine-bar" /> : null}
    </section>
  );
}
