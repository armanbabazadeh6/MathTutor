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
 * Compact topic picker.
 *
 * One 56px row per domain instead of a stack of 112px tiles: the whole picker
 * is ~44% shorter, so optional extra practice no longer reads as a second
 * screen. Same props/behaviour — `selected` ids plus `onToggle` per tap — and
 * the picked state is carried by fill, border AND a check mark, never colour
 * alone.
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
      className="flex flex-col gap-2"
      role="group"
      aria-label="Pick what you learned about. Tap a topic to pick it, tap again to unpick."
    >
      {SKILL_DOMAINS.map((d) => {
        const active = selected.includes(d.id);
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onToggle(d.id)}
            aria-pressed={active}
            className={`duo-press mt-focus flex min-h-[56px] w-full items-center gap-3 rounded-card border-2 px-3 py-2 text-left shadow-chunky-sm ${
              active ? "border-primarydark bg-mint" : "border-line bg-card"
            }`}
          >
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream text-2xl leading-none"
            >
              {EMOJI[d.id]}
            </span>
            <span className="min-w-0 flex-1 font-display text-kid-base font-semibold leading-tight">
              {NICK[d.id]}
            </span>
            <span
              aria-hidden
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-kid-sm font-bold ${
                active ? "border-primarydark bg-primarybtn text-white" : "border-line text-transparent"
              }`}
            >
              ✓
            </span>
          </button>
        );
      })}
    </div>
  );
}
