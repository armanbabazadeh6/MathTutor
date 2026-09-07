type Tone = "sunny" | "mint" | "sky" | "coral" | "grape" | "primary";

const tones: Record<Tone, { bg: string; text: string; border: string }> = {
  sunny: { bg: "var(--color-sunny)", text: "var(--color-ink)", border: "var(--color-sunny-dark)" },
  mint: { bg: "var(--color-mint)", text: "var(--color-ink)", border: "var(--color-primary-dark)" },
  sky: { bg: "var(--color-sky)", text: "#fff", border: "var(--color-sky-dark)" },
  coral: { bg: "var(--color-coral)", text: "#fff", border: "var(--color-coral-dark)" },
  grape: { bg: "var(--color-grape)", text: "#fff", border: "var(--color-grape-dark)" },
  primary: { bg: "var(--color-primary)", text: "#fff", border: "var(--color-primary-dark)" },
};

/** Back-compat Badge, restyled chunky. */
export function Badge({
  label,
  tone = "sunny",
}: {
  label: string;
  tone?: Tone;
}) {
  const t = tones[tone];
  return (
    <span
      className="inline-flex min-h-[36px] items-center rounded-pill px-4 py-1 font-display text-sm font-semibold uppercase tracking-wide"
      style={{ background: t.bg, color: t.text, border: `2px solid ${t.border}`, boxShadow: "0 3px 0 var(--chunky-shadow)" }}
    >
      {label}
    </span>
  );
}
