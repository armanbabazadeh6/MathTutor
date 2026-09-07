"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { LessonPath } from "@/components/duo/LessonPath";
import type { LessonNode } from "@/components/duo/LessonPath";
import { StudentNav } from "@/components/student/StudentNav";
import { currentPlan, loadPlanSession, loadProgress } from "@/lib/session";
import type { DomainGradeView, PlanSessionState } from "@/lib/session";
import {
  globalGradeView,
  gradeViews,
  loadCelebratedGraduations,
  saveCelebratedGraduations,
} from "@/lib/session";
import { ConfettiBurst } from "@/components/effects";
import { sound } from "@/lib/sound";
import { SKILL_DOMAINS, SKILLS } from "@/lib/skills";
import { DEFAULT_LEVEL, LEVEL_LABELS } from "@/lib/plan/levels";
import type { Plan } from "@/lib/plan/plan";

const REASON_WORDS: Record<string, string> = {
  reteach: "Let's play it again! 💪",
  today: "Today's pick! ☀️",
  weak: "Growing muscle! 🌱",
  review: "Remember game! 🔁",
  challenge: "Super challenge! 🚀",
};

const REASON_SHORT: Record<string, string> = {
  reteach: "Again!",
  today: "Today!",
  weak: "Grow!",
  review: "Recall!",
  challenge: "Wow!",
};

function stars(avg: number): string {
  const filled = Math.max(1, Math.min(5, Math.round(avg)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function domainAvg(session: PlanSessionState, domain: string): number {
  const ids = SKILLS.filter((s) => s.domain === domain).map((s) => s.id);
  if (!ids.length) return DEFAULT_LEVEL;
  return ids.reduce((sum, id) => sum + (session.levels[id] ?? DEFAULT_LEVEL), 0) / ids.length;
}

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
      // Celebrate each graduation once: fanfare + overlay + mascot announcement.
      const celebrated = loadCelebratedGraduations();
      const newly = views
        .filter((v) => v.graduated && !celebrated.includes(`domain:${v.domain}`))
        .map((v) => `domain:${v.domain}`);
      if (g.unlocked && !celebrated.includes("fifth-grade")) newly.push("fifth-grade");
      if (newly.length > 0) {
        try {
          sound().playFanfare();
        } catch {
          /* audio is best-effort; the overlay always shows */
        }
        saveCelebratedGraduations([...celebrated, ...newly]);
        setFreshUnlocks(newly);
      }
    } catch {
      /* grade views are additive; the map still renders without them */
    }
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
      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        <p className="text-kid-lg font-bold text-muted" role="status">
          Drawing your map… 🗺️
        </p>
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
        state: (i === 0 ? "current" : "done") as LessonNode["state"],
      };
    }),
    { id: "chest:plan", label: "Prize chest", state: "chest" },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-5 pb-8 pt-6 md:max-w-4xl">
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
            <div className="grid grid-cols-[auto_1fr] items-center gap-4">
              <Character pose="happy" size={96} label="Mascot showing your learning map" />
              <div>
                <h1 className="font-display text-kid-3xl font-semibold tracking-tight">My Path 🗺️</h1>
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
          </DuoCard>

          <DuoCard title="My muscle stars" subtitle="Stars grow as you get stronger!">
            <ul className="flex flex-col gap-5">
              {SKILL_DOMAINS.map((d) => {
                const avg = domainAvg(session, d.id);
                const pct = Math.max(0, Math.min(100, Math.round((avg / 5) * 100)));
                const label = LEVEL_LABELS[Math.max(1, Math.min(5, Math.round(avg))) as 1 | 2 | 3 | 4 | 5];
                return (
                  <li key={d.id} className="flex flex-col gap-1">
                    <p className="font-display text-kid-lg font-semibold">
                      {d.name} <span aria-label={`${Math.round(avg)} of 5 stars`}>{stars(avg)}</span>
                    </p>
                    <div
                      role="progressbar"
                      aria-valuenow={Math.round(avg * 10) / 10}
                      aria-valuemin={0}
                      aria-valuemax={5}
                      aria-label={`${d.name}: ${label}`}
                    >
                      <div className="h-5 overflow-hidden rounded-pill border-2 border-line bg-cream">
                        <div
                          className="h-full rounded-pill bg-sunny transition-[width] duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-kid-sm font-semibold text-muted">
                      {avg >= 5
                        ? "Superstar! You rule! 🏆"
                        : `Next muscle: ${LEVEL_LABELS[Math.max(1, Math.min(5, Math.round(avg) + 1)) as 1 | 2 | 3 | 4 | 5]} ✨`}
                    </p>
                  </li>
                );
              })}
            </ul>
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
                      <div
                        role="progressbar"
                        aria-valuenow={g.qualifying}
                        aria-valuemin={0}
                        aria-valuemax={Math.max(1, g.total)}
                        aria-label={`${domain?.name ?? g.domain}: ${g.qualifying} of ${g.total} skills ready`}
                      >
                        <div className="h-5 overflow-hidden rounded-pill border-2 border-line bg-cream">
                          <div
                            className="h-full rounded-pill bg-mint transition-[width] duration-300"
                            style={{ width: `${g.total > 0 ? Math.round((g.qualifying / g.total) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
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
              <p className="mt-3 rounded-2xl border-2 border-line bg-cream px-4 py-3 text-kid-base font-bold">
                {fifth.unlocked
                  ? "Fifth Grade unlocked — you did it! 🎉"
                  : `Fifth Grade: ${fifth.graduatedCount} of ${fifth.needed} areas graduated — keep climbing! 🧗`}
              </p>
            ) : null}
          </DuoCard>

          <DuoCard title="Extra turns" subtitle="Friendly games picked for you!">
            {practiceSkills.length === 0 ? (
              <p className="text-kid-lg font-bold">Nothing here — you&apos;re all caught up! 🎉</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {practiceSkills.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-2xl border-2 border-line bg-cream px-4 py-3 text-kid-base font-bold"
                  >
                    💪 {s.name} <span className="font-semibold text-muted">— we&apos;ll learn it together!</span>
                  </li>
                ))}
              </ul>
            )}
          </DuoCard>

          <DuoCard title="Up next" subtitle="What your games will look like!">
            <ul className="flex flex-col gap-2">
              {plan.items.slice(0, 5).map((item, i) => {
                const skill = SKILLS.find((s) => s.id === item.skillId);
                return (
                  <li key={`${item.skillId}-${i}`} className="text-kid-base">
                    <span className="font-bold">{skill?.name ?? item.skillId}</span>{" "}
                    <span className="font-semibold text-muted">
                      · {REASON_SHORT[item.reason] ?? REASON_WORDS[item.reason] ?? item.reason}
                    </span>
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
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="New unlock celebration"
        >
          <div
            className="animate-duo-pop w-full max-w-md rounded-3xl border-2 border-line bg-card p-6"
            style={{ boxShadow: "0 6px 0 var(--chunky-shadow)" }}
          >
            <ConfettiBurst
              label={freshUnlocks.includes("fifth-grade") ? "FIFTH GRADE! 🎓🎉" : "New unlock! 🎉"}
            />
            <div className="mt-3 flex items-center gap-3">
              <Character pose="cheer" size={88} label="Mascot cheering your graduation" />
              <div>
                <h2 className="font-display text-kid-xl font-semibold">
                  {freshUnlocks.includes("fifth-grade") ? "You reached Fifth Grade!" : "You graduated!"}
                </h2>
                <ul className="mt-1 flex flex-col gap-1 text-kid-base font-bold">
                  {freshUnlocks.map((key) => (
                    <li key={key}>
                      {key === "fifth-grade"
                        ? "🎓 Fifth Grade games are open!"
                        : `🎓 ${SKILL_DOMAINS.find((d) => `domain:${d.id}` === key)?.name ?? key} — grade-5 games open!`}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-4">
              <ChunkyButton
                size="lg"
                fullWidth
                shine
                onClick={() => {
                  try {
                    sound().playFanfare();
                  } catch {
                    /* audio is best-effort */
                  }
                  setFreshUnlocks([]);
                }}
              >
                Hooray! 🎉
              </ChunkyButton>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
