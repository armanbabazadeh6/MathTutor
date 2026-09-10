import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent" | "sky" | "coral";
};

/**
 * Fill / border / text per variant.
 *
 * Every filled variant pairs white text with an `*-ink` fill so it clears
 * WCAG AA at any size (the vivid decor shades would land at 2.1-3.0:1).
 */
const skins: Record<NonNullable<Props["variant"]>, { bg: string; border: string; text: string; shadow: string }> = {
  primary: { bg: "var(--color-primary-btn)", border: "var(--color-primary-ink)", text: "#fff", shadow: "var(--color-primary-ink)" },
  secondary: { bg: "var(--color-card)", border: "var(--color-line)", text: "var(--color-ink)", shadow: "var(--color-line)" },
  accent: { bg: "var(--color-accent-ink)", border: "#8a4400", text: "#fff", shadow: "#8a4400" },
  sky: { bg: "var(--color-sky-dark)", border: "var(--color-sky-ink)", text: "#fff", shadow: "var(--color-sky-ink)" },
  coral: { bg: "var(--color-coral-ink)", border: "#9e2020", text: "#fff", shadow: "#9e2020" },
};

/** Back-compat Button, restyled to chunky 3D. Prefer ChunkyButton for new code. */
export function Button({
  variant = "primary",
  className = "",
  style,
  ...rest
}: Props) {
  const skin = skins[variant];
  return (
    <button
      className={`duo-press mt-focus inline-flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl px-6 py-3 font-display text-kid-lg font-bold uppercase tracking-wide ${className}`}
      style={{
        background: skin.bg,
        color: skin.text,
        border: `2px solid ${skin.border}`,
        boxShadow: `0 4px 0 ${skin.shadow}`,
        ...style,
      }}
      {...rest}
    />
  );
}
