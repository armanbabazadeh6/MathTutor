/**
 * Tailwind theme.
 *
 * Colours resolve through `rgb(var(--rgb-*) / <alpha-value>)` — the channel
 * form Tailwind needs for opacity modifiers (`bg-ink/45`, `bg-card/95`).
 * A bare `var(--color-x)` silently drops the class, which is how the app ended
 * up with invisible scrims and unfilled hint boxes. The hex `--colour-*` vars
 * in globals.css remain for hand-written CSS; both come from one palette.
 */
const channel = (name) => `rgb(var(--rgb-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: channel("cream"),
        "cream-deep": channel("cream-deep"),
        ink: channel("ink"),
        "ink-soft": channel("ink-soft"),
        muted: channel("muted"),
        card: channel("card"),
        line: channel("line"),
        "line-soft": channel("line-soft"),
        primary: channel("primary"),
        primarybtn: channel("primary-btn"),
        primarydark: channel("primary-dark"),
        primarydeep: channel("primary-deep"),
        primaryink: channel("primary-ink"),
        accent: channel("accent"),
        accentdark: channel("accent-dark"),
        accentink: channel("accent-ink"),
        sunny: channel("sunny"),
        sunnydark: channel("sunny-dark"),
        sunnyink: channel("sunny-ink"),
        mint: channel("mint"),
        mintdeep: channel("mint-deep"),
        coral: channel("coral"),
        coraldark: channel("coral-dark"),
        coralink: channel("coral-ink"),
        sky: channel("sky"),
        skydark: channel("sky-dark"),
        skyink: channel("sky-ink"),
        grape: channel("grape"),
        grapedark: channel("grape-dark"),
        grapeink: channel("grape-ink"),
        "primary-soft": channel("primary-soft"),
        "sunny-soft": channel("sunny-soft"),
        "sky-soft": channel("sky-soft"),
        "coral-soft": channel("coral-soft"),
        "grape-soft": channel("grape-soft"),
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        card: "var(--radius-card)",
        chunky: "var(--radius-chunky)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        sans: ["var(--font-body)", "Nunito", "ui-rounded", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Fredoka", "Nunito", "ui-rounded", "system-ui", "sans-serif"],
      },
      fontSize: {
        "kid-xs": ["0.8125rem", { lineHeight: "1.4" }],
        "kid-sm": ["1rem", { lineHeight: "1.5" }],
        "kid-base": ["1.125rem", { lineHeight: "1.55" }],
        "kid-lg": ["1.375rem", { lineHeight: "1.4" }],
        "kid-xl": ["1.75rem", { lineHeight: "1.25" }],
        "kid-2xl": ["2.25rem", { lineHeight: "1.15" }],
        "kid-3xl": ["3rem", { lineHeight: "1.08" }],
        // Fluid hero sizes — scale with the viewport, capped for tablets.
        "kid-hero": ["clamp(2.25rem, 8.5vw, 3.25rem)", { lineHeight: "1.05" }],
        "kid-mega": ["clamp(3rem, 14vw, 5rem)", { lineHeight: "1" }],
      },
      boxShadow: {
        chunky: "var(--shadow-chunky)",
        "chunky-sm": "var(--shadow-chunky-sm)",
        "chunky-lg": "var(--shadow-chunky-lg)",
        float: "var(--shadow-float)",
        lift: "var(--shadow-lift)",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.22, 0.9, 0.28, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        "mt-rise": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "mt-xp-fly": {
          "0%": { transform: "translateY(6px) scale(0.9)", opacity: "0" },
          "22%": { transform: "translateY(-6px) scale(1.06)", opacity: "1" },
          "72%": { transform: "translateY(-22px) scale(1)", opacity: "1" },
          "100%": { transform: "translateY(-40px) scale(0.98)", opacity: "0" },
        },
        "mt-medal": {
          "0%": { transform: "scale(0.4) rotate(-18deg)", opacity: "0" },
          "55%": { transform: "scale(1.18) rotate(6deg)", opacity: "1" },
          "78%": { transform: "scale(0.96) rotate(-2deg)" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        "mt-slide-up": {
          "0%": { transform: "translateY(24px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "mt-rise": "mt-rise 360ms cubic-bezier(0.22, 0.9, 0.28, 1) both",
        "mt-xp-fly": "mt-xp-fly 1200ms cubic-bezier(0.22, 0.9, 0.28, 1) both",
        "mt-medal": "mt-medal 720ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "mt-slide-up": "mt-slide-up 360ms cubic-bezier(0.22, 0.9, 0.28, 1) both",
      },
    },
  },
  plugins: [],
};
