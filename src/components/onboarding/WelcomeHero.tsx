"use client";

import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";

/**
 * First-run hero for the kid picker.
 *
 * Shown only when no player exists yet: a big mascot, the product promise,
 * and exactly one primary call to action that opens the add-player flow.
 * Pure design tokens, no gradients or third-party assets; the `mt-stagger`
 * entrance is disabled under `prefers-reduced-motion`.
 */
export function WelcomeHero({ onStart }: { onStart: () => void }) {
  return (
    <section
      aria-labelledby="welcome-hero-title"
      className="mt-stagger flex flex-col items-center gap-4 rounded-card border-2 border-line bg-sunny px-6 py-8 text-center"
      style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
    >
      <Character pose="wow" size={132} label="Mascot waving hello" />
      <p className="mt-eyebrow">Welcome to MathTutor</p>
      <h2
        id="welcome-hero-title"
        className="text-kid-hero font-display font-semibold tracking-tight text-ink"
      >
        Your daily math quest!
      </h2>
      <p className="max-w-md text-kid-base font-semibold text-ink-soft">
        Play a little every day, earn gems and medals, and watch every skill level up with you.
        Make your player to begin.
      </p>
      <ChunkyButton size="lg" onClick={onStart}>
        Create your player 🎉
      </ChunkyButton>
    </section>
  );
}
