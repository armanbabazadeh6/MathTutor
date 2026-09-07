"use client";

import { useRouter } from "next/navigation";
import { ConfettiBurst, CountUp, PageFade } from "@/components/effects";
import { BackButton } from "@/components/student/BackButton";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { badgeById } from "@/lib/session";
import type { PracticeResult, ProgressState } from "@/lib/session";

export function ResultsView({
  result,
  progress,
  newBadges,
}: {
  result: PracticeResult;
  progress: ProgressState;
  newBadges: string[];
}) {
  const router = useRouter();
  const perfect = result.solved === result.total;
  const celebrate = perfect || newBadges.length > 0;
  const pose = perfect ? "cheer" : result.solved >= result.total / 2 ? "happy" : "think";
  return (
    <PageFade>
      <div className="flex flex-col gap-5">
        <BackButton href="/" label="Back" />

        {/* Celebration overlay */}
        <div className="flex flex-col items-center gap-2 text-center" role="status" aria-live="polite">
          <div className="animate-duo-pop">
            <Character
              pose={pose}
              size={128}
              label={perfect ? "Mascot cheering for a perfect score" : "Mascot proud of your practice"}
            />
          </div>
          <p aria-hidden className="text-5xl">
            {perfect ? "🏆" : result.solved >= result.total / 2 ? "🎉" : "💪"}
          </p>
          <h1 className="font-display text-kid-3xl font-semibold tracking-tight">
            {perfect ? "Perfect! Wow!" : "You did it!"}
          </h1>
          <p className="text-kid-lg text-muted">
            You solved {result.solved} of {result.total}. First tries right: {result.accuracy}%.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <StreakFlame count={progress.streakCount} />
            <GemCounter gems={progress.xp} label={`${progress.xp} stars total`} />
          </div>
        </div>

        {celebrate ? (
          <ConfettiBurst
            label={perfect ? "Every one right! Amazing!" : "New prize! Look below!"}
          />
        ) : null}

        <DuoCard
          title="Your stars"
          subtitle={`+${result.xpEarned} stars earned!`}
          tone="sunny"
          shine={perfect}
        >
          <div className="flex flex-col gap-3">
            <p className="font-display text-kid-3xl font-semibold">
              <CountUp value={result.xpEarned} prefix="+" suffix=" stars!" />
            </p>
            <ChunkyBar value={result.solved} max={result.total} label={`${result.solved} of ${result.total} solved`} />
            <div className="flex flex-wrap gap-2">
              <KidChip label={`${result.accuracy}% first-try`} />
              <KidChip label={`${progress.xp} stars total`} />
              <KidChip label={`${progress.sessionsCompleted} practices`} />
            </div>
          </div>
        </DuoCard>

        <DuoCard title="How you did" subtitle="Right answers per group">
          <ul className="flex flex-col gap-4">
            {result.perDomain.map((d) => (
              <li key={d.domain}>
                <ChunkyBar value={d.solved} max={d.total} label={`${d.domainName}: ${d.solved}/${d.total}`} />
              </li>
            ))}
          </ul>
        </DuoCard>

        {newBadges.length > 0 ? (
          <DuoCard title="New prizes!" subtitle="You won these today" tone="mint" shine>
            <div className="flex flex-wrap gap-2">
              {newBadges.map((id) => {
                const b = badgeById(id);
                if (!b) return null;
                return <KidChip key={id} label={`${b.emoji} ${b.name}`} />;
              })}
            </div>
          </DuoCard>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <ChunkyButton onClick={() => router.push("/")} size="lg" shine className="flex-1">
            Practice again 🚀
          </ChunkyButton>
          <ChunkyButton
            onClick={() => router.push("/progress")}
            variant="secondary"
            size="lg"
            className="flex-1"
          >
            See my goals
          </ChunkyButton>
        </div>
      </div>
    </PageFade>
  );
}

/** Chunky Duo-style progress bar (visual only). */
function ChunkyBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <p className="mb-1 text-kid-sm font-bold">{label}</p>
      <div className="h-5 overflow-hidden rounded-pill border-2 border-line bg-cream">
        <div className="h-full rounded-pill bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Chunky chip (visual only — same label contract as the old badge). */
function KidChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex min-h-[44px] items-center rounded-pill border-2 border-line bg-card px-4 py-1 text-kid-sm font-extrabold"
      style={{ boxShadow: "0 3px 0 var(--chunky-shadow)" }}
    >
      {label}
    </span>
  );
}
