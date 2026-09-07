"use client";

import { SKILL_DOMAINS } from "@/lib/skills";
import type { SkillDomain } from "@/lib/skills";

const EMOJI: Record<SkillDomain, string> = {
  "operations-algebraic": "✖️",
  "base-ten": "🔢",
  fractions: "🍕",
  "measurement-data": "📏",
  geometry: "🔷",
};

const NICK: Record<SkillDomain, string> = {
  "operations-algebraic": "Times & divide",
  "base-ten": "Big numbers",
  fractions: "Pizza fractions",
  "measurement-data": "Measure up",
  geometry: "Shapes",
};

/**
 * Topic picker grid, reskinned as chunky Duo tiles.
 * Same props/behavior: `selected` ids + `onToggle` per tap.
 */
export function TopicGrid({
  selected,
  onToggle,
}: {
  selected: SkillDomain[];
  onToggle: (d: SkillDomain) => void;
}) {
  return (
    <div
      className="mt-stagger grid grid-cols-1 gap-3 sm:grid-cols-2"
      role="group"
      aria-label="Pick what you learned about"
    >
      {SKILL_DOMAINS.map((d) => {
        const active = selected.includes(d.id);
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onToggle(d.id)}
            aria-pressed={active}
            className="duo-press flex min-h-[88px] touch-target items-center gap-4 rounded-3xl border-2 p-4 text-left"
            style={{
              background: active ? "var(--color-mint)" : "var(--color-card)",
              borderColor: active ? "var(--color-primary-dark)" : "var(--color-line)",
              boxShadow: active
                ? "0 4px 0 var(--color-primary-dark)"
                : "0 4px 0 var(--chunky-shadow)",
            }}
          >
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-cream text-4xl"
            >
              {EMOJI[d.id]}
            </span>
            <span className="min-w-0">
              <span className="block font-display text-kid-lg font-semibold leading-snug">
                {NICK[d.id]}
              </span>
              <span className="block truncate text-kid-xs font-semibold text-muted">
                {d.name}
              </span>
              <span className="mt-0.5 block text-kid-sm font-bold text-primarydeep">
                {active ? "✓ Picked! Tap to undo." : "Tap to pick."}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
