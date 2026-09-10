"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { ConfettiBurst, ListSkeleton } from "@/components/effects";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { LessonPath } from "@/components/duo/LessonPath";
import type { LessonNode } from "@/components/duo/LessonPath";
import { ProgressBar } from "@/components/duo/ProgressBar";
import { EmptyState } from "@/components/duo/EmptyState";
import { Alert } from "@/components/duo/Alert";
import { StudentNav } from "@/components/student/StudentNav";
import { Sheet } from "@/components/ui/Sheet";
import {
  currentPlan,
  globalGradeView,
  gradeViews,
  loadCelebratedGraduations,
  loadPlanSession,
  loadProgress,
  saveCelebratedGraduations,
} from "@/lib/session";
import type { DomainGradeView, PlanSessionState } from "@/lib/session";
import { sound } from "@/lib/sound";
import { SKILLS, SKILL_DOMAINS } from "@/lib/skills";
import { DEFAULT_LEVEL, LEVEL_LABELS } from "@/lib/plan/levels";
import type { Plan } from "@/lib/plan/plan";

/** Kid words for every `PlanReason` the queue can carry. */
const REASON_WORDS: Record<string, string> = {
  reteach: "Let's play it again! 💪",
  today: "Today's pick! ☀️",
  weak: "Growing muscle! 🌱",
  review: "Remember game! 🔁",
  challenge: "Super challenge! 🚀",
  grade5: "Fifth-grade fun! 🎓",
};

export default function PlanPage() {
  const router = useRouter();
  const [session, setSession] = useState<PlanSessionState | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [grades, setGrades] = useState<DomainGradeView[] | null>(null);
  const [fifth, setFifth] = useState<{ graduatedCount: number; needed: number; unlocked: boolean } | null>(null);
  const [freshUnlocks, setFreshUnlocks] = useState<string[]>([]);

  useEffect(() => {
    setSession(loadPlanSession());
    setPlan(currentPlan(10));
    try {
      const views = gradeViews();
      setGrades(views);
      const g = globalGradeView();
      setFifth(g);
      // Celebrate each graduation once: fanfare + sheet + mascot announcement.
      const celebrated = loadCelebratedGraduations();
      const newly = views
        .filter((v) => v.graduated && !celebrated.includes(`domain:${v.domain}`))
        .map((v) => `domain:${v.domain}`);
      if (g.unlocked && !celebrated.includes("fifth-grade")) newly.push("fifth-grade");
      if (newly.length > 0) {
        try {
          sound().playFanfare();
        } catch {
          /* audio is best-effort; the sheet always shows */
        }
        saveCelebratedGraduations([...celebrated, ...newly]);
        setFreshUnlocks(newly);
      }
    } catch {
      /* grade views are additive; the map still renders without them */
    }
  }, []);

  const dismissUnlocks = useCallback(() => {
    try {
      sound().playFanfare();
    } catch {
      /* audio is best-effort */
    }
    setFreshUnlocks([]);
  }, []);

  const progress = useMemo(() => {
    try {
      return loadProgress();
    } catch {
      return null;
    }
  }, []);

  if (!session || !plan) {
    return (
      <main className="mt-shell mt-shell-nav flex min-h-screen flex-col gap-5 py-6">
        <h1 className="font-display text-kid-hero font-semibold tracking-tight">My Path 🗺️</h1>
        <ListSkeleton rows={4} label="Drawing your map" />
      </main>
    );
  }

  const practiceSkills = session.reteachQueue
    .map((id) => SKILLS.find((s) => s.id === id))
    .filter((s): s is (typeof SKILLS)[number] => !!s);

  const nodes: LessonNode[] = [
    ...plan.items.slice(0, 6).map((item, i) => {
      const skill = SKILLS.find((s) => s.id === item.skillId);
      const short = skill ? skill.name : item.skillId;
      return {
        id: `${item.skillId}-${i}`,
        label: short.length > 14 ? `${short.slice(0, 13)}…` : short,
        detail: REASON_WORDS[item.reason],
        state: (i === 0 ? "current" : "done") as LessonNode["state"],
      };
    }),
    { id: "chest:plan", label: "Prize chest", state: "chest" },
  ];

  const celebratedTitle = freshUnlocks.includes("fifth-grade") ? "You reached Fifth Grade!" : "You graduated!";

  return (
    <main className="mt-shell mt-shell-nav flex min-h-screen flex-col gap-5 py-6">
      <PageFade>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {progress ? (
                <>
                  <StreakFlame count={progress.streakCount} />
                  <GemCounter gems={progress.xp} label={`${progress.xp} stars`} />
                </>
              ) : null}
            </div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Character pose="happy" size={88} label="Mascot showing your learning map" />
              <div className="min-w-0">
                <h1 className="font-display text-kid-hero font-semibold tracking-tight">My Path 🗺️</h1>
                <p className="text-kid-lg font-semibold text-muted">
                  Watch your stars grow — practice makes each game stronger!
                </p>
              </div>
            </div>
          </header>

          <DuoCard title="Your road" subtitle="Tap the glowing circle to play!">
            <LessonPath
              nodes={nodes}
              onSelect={(id) => {
                if (id === "chest:plan") router.push("/rewards");
                else router.push("/");
              }}
            />
            <div className="mt-4">
              <ChunkyButton variant="sky" size="lg" fullWidth onClick={() => router.push("/progress")}>
                See every skill 📈
              </ChunkyButton>
            </div>
          </DuoCard>

          <DuoCard
            title="Extra turns"
            subtitle="Friendly games picked for you — smaller numbers, extra help!"
          >
            {practiceSkills.length === 0 ? (
              <EmptyState
                title="All caught up!"
                body="Nothing needs another go right now — every skill you've practised is holding strong."
                pose="cheer"
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {practiceSkills.map((s) => {
                  // The plan rebuilds levels from the latest rules, so it is the
                  // level the kid will actually play — the stored one can lag.
                  const level = plan.levels[s.id] ?? session.levels[s.id] ?? DEFAULT_LEVEL;
                  return (
                    <li
                      key={s.id}
                      className="flex flex-col gap-0.5 rounded-2xl border-2 border-line bg-cream px-4 py-3"
                    >
                      <p className="text-kid-base font-bold">💪 {s.name}</p>
                      <p className="text-kid-sm font-semibold text-ink-soft">
                        {REASON_WORDS.reteach} We&apos;ll start again with extra help at Level {level} ·{" "}
                        {LEVEL_LABELS[level]}.
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </DuoCard>

          <DuoCard title="Grade climb 🎓" subtitle="Ace grade 4 to unlock grade-5 games!">
            {grades ? (
              <ul className="flex flex-col gap-4">
                {grades.map((g) => {
                  const domain = SKILL_DOMAINS.find((d) => d.id === g.domain);
                  const toGo = Math.max(0, g.total - g.qualifying);
                  return (
                    <li key={g.domain} className="flex flex-col gap-1">
                      <p className="font-display text-kid-lg font-semibold">
                        {domain?.name ?? g.domain}{" "}
                        {g.graduated ? (
                          <span aria-label="graduated">🎓 Graduated!</span>
                        ) : (
                          <span className="font-body text-kid-sm font-bold text-muted">
                            {g.qualifying}/{g.total} skills at level 4
                          </span>
                        )}
                      </p>
                      <ProgressBar
                        value={g.qualifying}
                        max={Math.max(1, g.total)}
                        tone="sky"
                        label={`${domain?.name ?? g.domain}: ${g.qualifying} of ${g.total} skills ready`}
                      />
                      <p className="text-kid-sm font-semibold text-muted">
                        {g.graduated
                          ? `Grade-5 games unlocked (${g.grade5Count} new)! 🎮`
                          : `${toGo} more skill${toGo === 1 ? "" : "s"} to level 4 + strong practice to graduate 🌱`}
                        {g.overridden ? " · grown-up pick 🛠️" : null}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-kid-lg font-bold">Play to start your climb! 🌱</p>
            )}
            {fifth ? (
              <Alert tone={fifth.unlocked ? "success" : "info"} className="mt-3">
                {fifth.unlocked
                  ? "Fifth Grade unlocked — you did it! 🎉"
                  : `Fifth Grade: ${fifth.graduatedCount} of ${fifth.needed} areas graduated — keep climbing! 🧗`}
              </Alert>
            ) : null}
          </DuoCard>

          <DuoCard title="Up next" subtitle="What your games will look like!">
            <ul className="flex flex-col gap-2">
              {plan.items.slice(0, 5).map((item, i) => {
                const skill = SKILLS.find((s) => s.id === item.skillId);
                return (
                  <li key={`${item.skillId}-${i}`} className="flex flex-col gap-0.5">
                    <p className="text-kid-base font-bold">{skill?.name ?? item.skillId}</p>
                    <p className="text-kid-sm font-semibold text-muted">
                      {REASON_WORDS[item.reason] ?? item.reason} · Level {item.level} · {LEVEL_LABELS[item.level]}
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              <ChunkyButton size="lg" fullWidth shine onClick={() => router.push("/")}>
                Play now! 🚀
              </ChunkyButton>
            </div>
          </DuoCard>

          <StudentNav />
        </div>
      </PageFade>
      {freshUnlocks.length > 0 ? (
        <Sheet title={celebratedTitle} onClose={dismissUnlocks}>
          <div className="text-center">
            <ConfettiBurst label={freshUnlocks.includes("fifth-grade") ? "FIFTH GRADE! 🎓🎉" : "New unlock! 🎉"} />
            <div className="mt-3 flex flex-col items-center gap-2">
              <Character pose="cheer" size={96} label="Mascot cheering your graduation" />
              <p className="font-display text-kid-2xl font-semibold leading-tight">{celebratedTitle}</p>
              <ul className="flex flex-col gap-1 text-kid-base font-bold">
                {freshUnlocks.map((key) => (
                  <li key={key}>
                    {key === "fifth-grade"
                      ? "🎓 Fifth Grade games are open!"
                      : `🎓 ${SKILL_DOMAINS.find((d) => `domain:${d.id}` === key)?.name ?? key} — grade-5 games open!`}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              <ChunkyButton size="lg" fullWidth shine onClick={dismissUnlocks}>
                Hooray! 🎉
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
