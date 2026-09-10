"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from "react";
import { tapTick } from "@/components/effects/haptics";

type Variant = "primary" | "secondary" | "accent" | "sky" | "coral" | "sunny" | "ghost";
type Size = "sm" | "md" | "lg";

/**
 * Fill / border / shadow / text per variant.
 *
 * Contrast rule: every filled variant carries white (or ink) text at >= 4.5:1
 * against its own fill, at every size. `ghost` is a text-only affordance and
 * uses the `*-ink` accent shades so it clears AA on the cream background too.
 */
const skins: Record<
  Variant,
  { bg: string; border: string; text: string; shadow: string }
> = {
  primary: {
    bg: "var(--color-primary-btn)",
    border: "var(--color-primary-ink)",
    text: "#ffffff",
    shadow: "var(--color-primary-ink)",
  },
  secondary: {
    bg: "var(--color-card)",
    border: "var(--color-line)",
    text: "var(--color-ink)",
    shadow: "var(--color-line)",
  },
  accent: {
    bg: "var(--color-accent-ink)",
    border: "#8a4400",
    text: "#ffffff",
    shadow: "#8a4400",
  },
  sky: {
    bg: "var(--color-sky-ink)",
    border: "#084f72",
    text: "#ffffff",
    shadow: "#084f72",
  },
  coral: {
    bg: "var(--color-coral-ink)",
    border: "#9e2020",
    text: "#ffffff",
    shadow: "#9e2020",
  },
  sunny: {
    bg: "var(--color-sunny)",
    border: "var(--color-sunny-dark)",
    text: "var(--color-ink)",
    shadow: "var(--color-sunny-dark)",
  },
  ghost: {
    bg: "transparent",
    border: "transparent",
    text: "var(--color-primary-ink)",
    shadow: "transparent",
  },
};

const sizes: Record<Size, string> = {
  sm: "min-h-[56px] px-5 py-2 text-kid-sm",
  md: "min-h-[56px] px-6 py-3 text-kid-lg",
  lg: "min-h-[64px] px-8 py-4 text-kid-xl",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  shine?: boolean;
  /** Rendered before the label; scales with the button. */
  icon?: ReactNode;
  /** Replaces the label with a spinner and blocks input. */
  loading?: boolean;
};

/** Chunky 3D button with press-down physics. Original art, no third-party assets. */
export const ChunkyButton = forwardRef<HTMLButtonElement, Props>(function ChunkyButton(
  {
    variant = "primary",
    size = "md",
    fullWidth = false,
    shine = false,
    icon,
    loading = false,
    className = "",
    children,
    style,
    onPointerDown,
    disabled,
    ...rest
  },
  ref,
) {
  const skin = skins[variant];
  const isDisabled = disabled || loading;
  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e);
    if (!e.defaultPrevented && !isDisabled) tapTick();
  };
  return (
    <button
      ref={ref}
      onPointerDown={handlePointerDown}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`touch-target mt-focus inline-flex items-center justify-center gap-2 rounded-2xl font-display font-bold uppercase tracking-wide ${
        variant === "ghost" || isDisabled ? "" : "duo-press"
      } ${sizes[size]} ${fullWidth ? "w-full" : ""} ${shine && !isDisabled ? "duo-shine-wrap" : ""} ${className}`}
      style={{
        background: skin.bg,
        color: skin.text,
        border: `2px solid ${skin.border}`,
        // A disabled button that looks identical to an enabled one is a dead
        // end for a kid — they tap a bright green CTA and nothing happens.
        boxShadow: isDisabled ? "none" : `0 4px 0 ${skin.shadow}`,
        opacity: isDisabled ? 0.55 : 1,
        filter: isDisabled ? "saturate(0.6)" : undefined,
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        icon
      )}
      {children}
      {shine && !isDisabled ? <span aria-hidden className="duo-shine-bar" /> : null}
    </button>
  );
});
