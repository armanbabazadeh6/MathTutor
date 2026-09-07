import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent" | "sky" | "coral";
};

const skins: Record<NonNullable<Props["variant"]>, { bg: string; border: string; text: string; shadow: string }> = {
  primary: { bg: "var(--color-primary)", border: "var(--color-primary-dark)", text: "#fff", shadow: "var(--color-primary-dark)" },
  secondary: { bg: "var(--color-card)", border: "var(--color-line)", text: "var(--color-ink)", shadow: "var(--color-line)" },
  accent: { bg: "var(--color-accent)", border: "var(--color-accent-dark)", text: "#fff", shadow: "var(--color-accent-dark)" },
  sky: { bg: "var(--color-sky)", border: "var(--color-sky-dark)", text: "#fff", shadow: "var(--color-sky-dark)" },
  coral: { bg: "var(--color-coral)", border: "var(--color-coral-dark)", text: "#fff", shadow: "var(--color-coral-dark)" },
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
      className={`duo-press touch-target mt-touch-56 inline-flex items-center justify-center rounded-2xl px-6 py-3 font-display text-kid-lg font-semibold uppercase tracking-wide ${className}`}
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
