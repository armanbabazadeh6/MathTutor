import type { ReactNode } from "react";

type Tone = "error" | "warn" | "success" | "info";

/**
 * The app's one inline banner.
 *
 * Replaces the three near-identical hand-rolled error boxes that each painted
 * `text-coral` (3.0:1 on white) and had no consistent live-region role.
 * Colour comes from the `*-ink` shades, which clear AA on the pale fills.
 */
const tones: Record<Tone, { bg: string; border: string; text: string; icon: string }> = {
  error: { bg: "bg-coral-soft", border: "border-coraldark", text: "text-coralink", icon: "⚠️" },
  warn: { bg: "bg-sunny-soft", border: "border-sunnydark", text: "text-sunnyink", icon: "💡" },
  success: { bg: "bg-mint", border: "border-primarydark", text: "text-primaryink", icon: "✅" },
  info: { bg: "bg-sky-soft", border: "border-skydark", text: "text-skyink", icon: "ℹ️" },
};

export function Alert({
  tone = "info",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-2xl border-2 ${t.border} ${t.bg} px-4 py-3 text-kid-sm font-bold ${t.text} ${className}`}
    >
      <span aria-hidden className="not-italic">
        {t.icon}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
