/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "var(--color-cream)",
        ink: "var(--color-ink)",
        primary: "var(--color-primary)",
        primarydark: "var(--color-primary-dark)",
        primarydeep: "var(--color-primary-deep)",
        accent: "var(--color-accent)",
        accentdark: "var(--color-accent-dark)",
        sunny: "var(--color-sunny)",
        sunnydark: "var(--color-sunny-dark)",
        mint: "var(--color-mint)",
        coral: "var(--color-coral)",
        coraldark: "var(--color-coral-dark)",
        sky: "var(--color-sky)",
        skydark: "var(--color-sky-dark)",
        grape: "var(--color-grape)",
        grapedark: "var(--color-grape-dark)",
        card: "var(--color-card)",
        line: "var(--color-line)",
        muted: "var(--color-muted)",
      },
      borderRadius: {
        card: "var(--radius-card)",
        chunky: "var(--radius-chunky)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        sans: ["var(--font-body)", "Nunito", "ui-rounded", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Fredoka", "Nunito", "ui-rounded", "system-ui", "sans-serif"],
      },
      fontSize: {
        "kid-xs": ["0.875rem", { lineHeight: "1.4" }],
        "kid-sm": ["1rem", { lineHeight: "1.5" }],
        "kid-base": ["1.125rem", { lineHeight: "1.55" }],
        "kid-lg": ["1.375rem", { lineHeight: "1.4" }],
        "kid-xl": ["1.75rem", { lineHeight: "1.25" }],
        "kid-2xl": ["2.25rem", { lineHeight: "1.2" }],
        "kid-3xl": ["3rem", { lineHeight: "1.1" }],
      },
      boxShadow: {
        chunky: "0 4px 0 var(--chunky-shadow, rgba(43,38,32,0.18))",
        "chunky-sm": "0 3px 0 var(--chunky-shadow, rgba(43,38,32,0.18))",
        "chunky-lg": "0 6px 0 var(--chunky-shadow, rgba(43,38,32,0.18))",
        pop: "0 6px 0 rgba(43,38,32,0.18), 0 12px 24px rgba(43,38,32,0.12)",
      },
      keyframes: {
        "duo-pop": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "duo-wiggle": {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        "duo-bounce-soft": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "duo-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "duo-shine": {
          "0%": { transform: "translateX(-100%) skewX(-20deg)" },
          "100%": { transform: "translateX(220%) skewX(-20deg)" },
        },
      },
      animation: {
        "duo-pop": "duo-pop 300ms ease-out both",
        "duo-wiggle": "duo-wiggle 480ms ease-in-out",
        "duo-bounce-soft": "duo-bounce-soft 900ms ease-in-out infinite",
        "duo-float": "duo-float 2600ms ease-in-out infinite",
        "duo-shine": "duo-shine 1600ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
