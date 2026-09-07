"use client";

import { useEffect, useState } from "react";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { Character } from "@/components/duo/Character";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { StudentNav } from "@/components/student/StudentNav";
import { loadProgress, masteryFor } from "@/lib/session";
import { SKILL_DOMAINS } from "@/lib/skills";
import type { ProgressState } from "@/lib/session";

const KID_TIP: Record<string, string> = {
  "operations-algebraic": "Keep adding those wins!",
  "base-ten": "Big numbers love practice!",
  fractions: "Slice by slice, yum!",
  "measurement-data": "Measure, measure, hooray!",
  geometry: "Shape superstar in training!",
};

export default function ProgressPage() {
  const [progress, setProgress] = useState<ProgressState | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  if (!progress) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        <p className="text-kid-lg font-bold text-muted" role="status">
          Finding your stars… ⭐
        </p>
      </main>
    );
  }

  const mastery = masteryFor(progress.domainStats);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-5 pb-8 pt-6 md:max-w-4xl">
      <PageFade>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StreakFlame count={progress.streakCount} />
              <GemCounter gems={progress.xp} label={`${progress.xp} stars`} />
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-4">
              <Character
                pose={progress.sessionsCompleted > 0 ? "cheer" : "happy"}
                size={96}
                label="Mascot celebrating your goals"
              />
              <div>
                <h1 className="font-display text-kid-3xl font-semibold tracking-tight">My Goals 📈</h1>
                <p className="text-kid-lg font-semibold text-muted">
                  {progress.sessionsCompleted} game{progress.sessionsCompleted === 1 ? "" : "s"} played —
                  bars grow when your first tries win!
                </p>
              </div>
            </div>
          </header>

          <DuoCard title="My muscle bars" subtitle="First-try wins make bars grow! (needs 3+ tries)">
            <ul className="flex flex-col gap-5">
              {SKILL_DOMAINS.map((d) => {
                const value = mastery[d.id] ?? 0;
                return (
                  <li key={d.id} className="flex flex-col gap-1">
                    <p className="font-display text-kid-lg font-semibold">
                      {d.name}: {value}%
                    </p>
                    <div
                      role="progressbar"
                      aria-valuenow={value}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${d.name}: ${value} percent`}
                    >
                      <div className="h-6 overflow-hidden rounded-pill border-2 border-line bg-cream">
                        <div
                          className="animate-duo-pop h-full rounded-pill bg-primary transition-[width] duration-300"
                          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-kid-sm font-semibold text-muted">
                      {value >= 80 ? "Superstar! 🏆" : (KID_TIP[d.id] ?? "Keep going!")}
                    </p>
                  </li>
                );
              })}
            </ul>
          </DuoCard>

          <StudentNav />
        </div>
      </PageFade>
    </main>
  );
}
