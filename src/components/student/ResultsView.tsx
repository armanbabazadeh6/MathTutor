"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConfettiBurst, CountUp, PageFade, levelUpBuzz, successBuzz } from "@/components/effects";
import { BackButton } from "@/components/student/BackButton";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { ProgressBar } from "@/components/duo/ProgressBar";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { Badge } from "@/components/ui/Badge";
import { badgeById } from "@/lib/session";
import type { ProblemAttempt, PracticeResult, ProgressState } from "@/lib/session";

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
  // Tactile-only: buzz once on mount for celebrations. No state, no behavior change.
  useEffect(() => {
    if (perfect) levelUpBuzz();
    else if (celebrate) successBuzz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <PageFade>
      <div className="flex flex-col gap-5">
        <BackButton href="/" label="Back" />

        {/* Celebration overlay */}
        <div
          className="flex flex-col items-center gap-2 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="animate-duo-pop">
            <Character
              pose={pose}
              size={128}
              label={
                perfect ? "Mascot cheering for a perfect score" : "Mascot proud of your practice"
              }
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
          <ConfettiBurst label={perfect ? "Every one right! Amazing!" : "New prize! Look below!"} />
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
            <ProgressBar
              value={result.solved}
              max={result.total}
              label={`${result.solved} of ${result.total} solved`}
            />
            <div className="flex flex-wrap gap-2">
              <Badge label={`${result.accuracy}% first-try`} tone="sky" />
              <Badge label={`${progress.xp} stars total`} tone="primary" />
              <Badge label={`${progress.sessionsCompleted} practices`} tone="mint" />
            </div>
          </div>
        </DuoCard>

        {result.levelChanges.length > 0 ? (
          <DuoCard title="Levels" subtitle="How your skills moved today" tone="sky">
            <ul className="mt-stagger flex flex-col gap-3">
              {result.levelChanges.map((c) => (
                <li
                  key={c.skillId}
                  className="flex items-center gap-3 rounded-2xl border-2 border-line bg-card px-4 py-3"
                >
                  <span
                    aria-hidden
                    className={`font-display text-kid-xl font-semibold ${
                      c.direction === "up" ? "text-primaryink" : "text-accentink"
                    }`}
                  >
                    {c.direction === "up" ? "↑" : "↓"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-kid-base font-semibold">
                      {c.skillName}
                    </span>
                    <span className="block text-kid-sm font-semibold text-muted">
                      Level {c.from} → Level {c.to}
                    </span>
                  </span>
                  <span className="sr-only">
                    {c.direction === "up" ? "level up" : "level down"}
                  </span>
                </li>
              ))}
            </ul>
          </DuoCard>
        ) : null}

        <DuoCard title="Every problem" subtitle="One line for each try">
          <ul className="mt-stagger flex flex-col gap-2">
            {result.attempts.map((a, i) => (
              <li
                key={`${a.problemId}-${i}`}
                className="flex items-center gap-3 rounded-2xl border-2 border-line bg-card px-4 py-3"
              >
                <span aria-hidden className="text-kid-lg">
                  {a.correctFirstTry ? "⭐" : a.solved ? "✅" : "📖"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-kid-base font-semibold">
                    {a.skillName}
                  </span>
                  <span className="block text-kid-sm font-semibold text-muted">
                    Level {a.level} · {attemptMarker(a)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </DuoCard>

        <DuoCard title="How you did" subtitle="Right answers per group">
          <ul className="mt-stagger flex flex-col gap-4">
            {result.perDomain.map((d) => (
              <li key={d.domain}>
                <p className="mb-1 text-kid-sm font-bold">
                  {d.domainName}: {d.solved}/{d.total}
                </p>
                <ProgressBar
                  value={d.solved}
                  max={d.total}
                  label={`${d.domainName}: ${d.solved} of ${d.total} right`}
                />
              </li>
            ))}
          </ul>
        </DuoCard>

        {result.reteachSkills.length > 0 ? (
          <DuoCard
            title="Let's practise again"
            subtitle="We'll come back to these together"
            tone="sunny"
          >
            <ul className="mt-stagger flex flex-col gap-2">
              {result.reteachSkills.map((s) => (
                <li
                  key={s.skillId}
                  className="flex items-center gap-3 rounded-2xl border-2 border-sunnydark bg-sunny-soft px-4 py-3 text-sunnyink"
                >
                  <span aria-hidden className="text-kid-lg">
                    📖
                  </span>
                  <span className="min-w-0 flex-1 font-display text-kid-base font-semibold">
                    {s.skillName}
                  </span>
                </li>
              ))}
            </ul>
          </DuoCard>
        ) : null}

        {newBadges.length > 0 ? (
          <DuoCard title="New prizes!" subtitle="You won these today" tone="mint" shine>
            <div className="flex flex-wrap gap-2">
              {newBadges.map((id) => {
                const b = badgeById(id);
                if (!b) return null;
                return <Badge key={id} label={`${b.emoji} ${b.name}`} tone="sunny" />;
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

/** Kid-facing wording for one attempt — never shaming, and never bare numbers. */
function attemptMarker(a: ProblemAttempt): string {
  if (a.correctFirstTry) return "right first try";
  if (a.solved) return `right after ${a.attemptsUsed} tries`;
  return "we learned it together";
}
