import type { ReactNode } from "react";

type Tone = "plain" | "mint" | "sunny" | "sky" | "grape" | "coral" | "cream";

const tones: Record<Tone, string> = {
  plain: "bg-card",
  mint: "bg-mint",
  sunny: "bg-sunny",
  sky: "bg-sky",
  grape: "bg-grape",
  coral: "bg-coral",
  cream: "bg-cream-deep",
};

export interface DuoCardProps {
  title?: string;
  /** Small uppercase label rendered above the title. */
  eyebrow?: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Right-aligned slot in the header (stats, toggles, links). */
  action?: ReactNode;
  tone?: Tone;
  shine?: boolean;
  /** Drop the inner padding — for cards whose child is a full-bleed list. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/** Chunky card — thick radius, chunky shadow. Original styling. */
export function DuoCard({
  title,
  eyebrow,
  subtitle,
  icon,
  action,
  tone = "plain",
  shine = false,
  flush = false,
  className = "",
  children,
}: DuoCardProps) {
  const hasHeader = Boolean(title || icon || eyebrow || action);
  // The muted grey only clears AA on a white surface. A decorative tone is
  // bright enough that muted text lands at 3.2-3.6:1, so those tones use full
  // ink instead — the only token that clears 4.5:1 on every tone we ship.
  const onTone = tone !== "plain";
  return (
    <section
      className={`rounded-card border-2 border-line shadow-chunky ${flush ? "" : "p-5 sm:p-6"} ${
        tones[tone]
      } ${shine ? "duo-shine-wrap" : ""} ${className}`}
    >
      {hasHeader ? (
        <header
          className={`flex items-start gap-3 ${flush ? "p-5 pb-0 sm:p-6 sm:pb-0" : ""} ${
            onTone ? "text-ink" : ""
          }`}
        >
          {icon ? (
            <span aria-hidden className="shrink-0">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className={`mt-eyebrow ${onTone ? "" : "text-muted"}`}>{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 className="font-display text-kid-xl font-semibold leading-tight">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className={`text-kid-sm font-semibold ${onTone ? "" : "text-muted"}`}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={hasHeader ? "mt-4" : ""}>{children}</div>
      {shine ? <span aria-hidden className="duo-shine-bar" /> : null}
    </section>
  );
}
