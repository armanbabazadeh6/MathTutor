"use client";

import { useEffect, useRef } from "react";
import { Character } from "@/components/duo/Character";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { ConfettiBurst } from "./ConfettiBurst";
import { levelUpBuzz } from "./haptics";
import { LEVEL_LABELS } from "@/lib/plan/levels";
import type { SkillLevel } from "@/lib/plan/levels";

/**
 * The moment a skill levels up.
 *
 * Level changes used to be silent: `recordGradedAttempt` returned `promoted`
 * and every caller threw it away. This is the missing payoff — modal, focus
 * -managed in and out, dismissible by button, backdrop, or Escape, and fully
 * inert (no confetti, no sound, no motion) under `prefers-reduced-motion`.
 */
export function LevelUpOverlay({
  skillName,
  from,
  to,
  onClose,
}: {
  skillName: string;
  from: SkillLevel;
  to: SkillLevel;
  onClose: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
    levelUpBuzz();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = LEVEL_LABELS[to];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${skillName} reached level ${to}, ${label}`}
    >
      <div aria-hidden className="mt-scrim absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-duo-pop relative w-full max-w-sm rounded-card border-2 border-line bg-card p-6 text-center shadow-lift">
        <div className="mt-medal mx-auto">
          <Character pose="cheer" size={128} label="Mascot celebrating a level up" />
        </div>
        <p className="mt-eyebrow mt-2">Level up!</p>
        <h2 className="font-display text-kid-2xl font-semibold leading-tight">{skillName}</h2>
        <p className="mt-1 text-kid-lg font-bold text-primaryink">
          Level {from} → Level {to} · {label}
        </p>
        <div className="mt-4">
          <ConfettiBurst pieces={8} label="Level up!" />
        </div>
        <ChunkyButton ref={buttonRef} size="lg" fullWidth shine className="mt-2" onClick={onClose}>
          Keep going!
        </ChunkyButton>
      </div>
    </div>
  );
}
