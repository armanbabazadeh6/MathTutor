import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "accent" | "sky" | "coral" | "sunny";
type Size = "sm" | "md" | "lg";

const skins: Record<Variant, { bg: string; border: string; text: string; shadow: string }> = {
  primary: { bg: "var(--color-primary)", border: "var(--color-primary-dark)", text: "#ffffff", shadow: "var(--color-primary-dark)" },
  secondary: { bg: "var(--color-card)", border: "var(--color-line)", text: "var(--color-ink)", shadow: "var(--color-line)" },
  accent: { bg: "var(--color-accent)", border: "var(--color-accent-dark)", text: "#ffffff", shadow: "var(--color-accent-dark)" },
  sky: { bg: "var(--color-sky)", border: "var(--color-sky-dark)", text: "#ffffff", shadow: "var(--color-sky-dark)" },
  coral: { bg: "var(--color-coral)", border: "var(--color-coral-dark)", text: "#ffffff", shadow: "var(--color-coral-dark)" },
  sunny: { bg: "var(--color-sunny)", border: "var(--color-sunny-dark)", text: "var(--color-ink)", shadow: "var(--color-sunny-dark)" },
};

const sizes: Record<Size, string> = {
  sm: "min-h-[44px] px-4 py-2 text-kid-sm",
  md: "min-h-[56px] px-6 py-3 text-kid-lg",
  lg: "min-h-[64px] px-8 py-4 text-kid-xl",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  shine?: boolean;
};

/** Chunky 3D button with press-down physics. Original art, no third-party assets. */
export function ChunkyButton({
  variant = "primary",
  size = "md",
  fullWidth = false,
  shine = false,
  className = "",
  children,
  style,
  ...rest
}: Props) {
  const skin = skins[variant];
  return (
    <button
      className={`duo-press touch-target inline-flex items-center justify-center gap-2 rounded-2xl font-display font-semibold uppercase tracking-wide ${sizes[size]} ${fullWidth ? "w-full" : ""} ${shine ? "duo-shine-wrap" : ""} ${className}`}
      style={{
        background: skin.bg,
        color: skin.text,
        border: `2px solid ${skin.border}`,
        boxShadow: `0 4px 0 ${skin.shadow}`,
        ...style,
      }}
      {...rest}
    >
      {children}
      {shine ? <span aria-hidden className="duo-shine-bar" /> : null}
    </button>
  );
}
