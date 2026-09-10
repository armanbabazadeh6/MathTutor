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
  generateAssignment,
  globalGradeView,
  gradeViews,
  loadCelebratedGraduations,
  loadPlanSession,
  loadProgress,
  saveAssignment,
  saveCelebratedGraduations,
} from "@/lib/session";
import type { DomainGradeView, PlanSessionState } from "@/lib/session";
import { sound } from "@/lib/sound";
import { SKILLS, SKILL_DOMAINS } from "@/lib/skills";
import type { Skill, SkillDomain } from "@/lib/skills";
import { DEFAULT_LEVEL, DEFAULT_MASTERY, LEVEL_LABELS } from "@/lib/plan/levels";
import type { SkillLevel } from "@/lib/plan/levels";
import { CURRICULUM_ORDER } from "@/lib/plan/plan";
import type { Plan } from "@/lib/plan/plan";
import {
  GRADUATION_COVERAGE,
  GRADUATION_MIN_AVG_LEVEL,
  GRADUATION_MIN_AVG_MASTERY,
  GRADUATION_SKILL_LEVEL,
  GRADUATION_SKILL_MASTERY,
  domainGraduationStatus,
  grade4GeneratorSkillsForDomain,
} from "@/lib/plan/graduation";
import type { DomainGraduationStatus } from "@/lib/plan/graduation";

/** Kid words for every `PlanReason` the queue can carry. */
const REASON_WORDS: Record<string, string> = {
  reteach: "Let's play it again! 💪",
  today: "Today's pick! ☀️",
  weak: "Growing muscle! 🌱",
  review: "Remember game! 🔁",
  challenge: "Super challenge! 🚀",
  grade5: "Fifth-grade fun! 🎓",
};

/** Locked grade-5 previews on the road (the padlock the art was drawn for). */
const MAX_LOCKED_PREVIEW = 3;
/** Queue rows shown in "Up next"; the rest are named rather than dropped. */
const MAX_UP_NEXT_ROWS = 5;
/** Problems in one "extra turn" run. */
const EXTRA_TURN_PROBLEMS = 6;

/** Which domains the engine will actually serve grade-5 skills for. */
function unlockedDomains(session: PlanSessionState): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const d of SKILL_DOMAINS) {
    out[d.id] = domainGraduationStatus(d.id, session.levels, session.mastery).graduated;
  }
  return out;
}

/**
 * One 0-100 number for how close a domain is to graduating: the weakest of the
 * three graduation gates. Coverage alone read 86% on a domain that was not
 * graduating (six of seven skills at level 4, one stuck on mastery), i.e. it
 * claimed near-finished while the unlock was still closed.
 */
function graduationPct(status: DomainGraduationStatus): number {
  if (status.graduated) return 100;
  if (status.total === 0) return 0;
  const ratio = Math.min(
    status.avgLevel / GRADUATION_MIN_AVG_LEVEL,
    status.avgMastery / GRADUATION_MIN_AVG_MASTERY,
    status.coverage / GRADUATION_COVERAGE,
  );
  return Math.min(99, Math.max(0, Math.round(ratio * 100)));
}

/** What is actually holding a domain back, split the way the kid can act on it. */
function graduationBlocker(
  domain: SkillDomain,
  session: PlanSessionState,
): { needsLevel: number; needsStrength: number } {
  let needsLevel = 0;
  let needsStrength = 0;
  for (const id of grade4GeneratorSkillsForDomain(domain)) {
    const level = session.levels[id] ?? DEFAULT_LEVEL;
    const mastery = session.mastery[id] ?? DEFAULT_MASTERY;
    if (level < GRADUATION_SKILL_LEVEL) needsLevel++;
    else if (mastery < GRADUATION_SKILL_MASTERY) needsStrength++;
  }
  return { needsLevel, needsStrength };
}

/** "1 skill needs" / "3 skills need" — count and verb agree together. */
function countSkills(n: number): string {
  return n === 1 ? "1 skill needs" : `${n} skills need`;
}

/** Name the real blocker in kid words instead of blaming the wrong skill. */
function blockerWords({ needsLevel, needsStrength }: { needsLevel: number; needsStrength: number }): string {
  if (needsLevel > 0 && needsStrength > 0) {
    return `${countSkills(needsLevel)} a new level, and ${
      needsStrength === 1 ? "1 needs" : `${needsStrength} more need`
    } stronger practice 💪`;
  }
  if (needsLevel > 0) return `${countSkills(needsLevel)} a new level 🌱`;
  return `${countSkills(needsStrength)} stronger practice, not a new level 💪`;
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
      // Only work the KID did is celebrated: a parent "Open" makes a view
      // graduated without earning it, and that must not fire confetti.
      const celebrated = loadCelebratedGraduations();
      const earned = views.filter((v) => v.graduated && !v.overridden);
      const newly = earned
        .filter((v) => !celebrated.includes(`domain:${v.domain}`))
        .map((v) => `domain:${v.domain}`);
      if (earned.length >= g.needed && !celebrated.includes("fifth-grade")) newly.push("fifth-grade");
      // Seen is recorded on dismiss, never here: closing the tab on the open
      // sheet must not consume the unlock, and the fanfare plays once, from
      // the dismiss tap rather than a second time on mount.
      if (newly.length > 0) setFreshUnlocks(newly);
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
    try {
      saveCelebratedGraduations([...loadCelebratedGraduations(), ...freshUnlocks]);
    } catch {
      /* storage blocked: the sheet stays dismissed for this mount */
    }
    setFreshUnlocks([]);
  }, [freshUnlocks]);

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

  const unlocked = unlockedDomains(session);
  const hasPractised = session.history.length > 0;

  const practiceSkills = session.reteachQueue
    .map((id) => SKILLS.find((s) => s.id === id))
    .filter((s): s is Skill => !!s);

  /** Start a run led by this skill, at the level the kid will actually play. */
  const startExtraTurn = (skill: Skill, level: SkillLevel) => {
    const assignment = generateAssignment([skill.domain], `${skill.name} · Level ${level}`, EXTRA_TURN_PROBLEMS);
    // The engine leads with reteach skills, but per-domain substitution can
    // push the tapped one further down the run; the row promises this game
    // first, so move it to the head of the run it just minted.
    const at = assignment.problems.findIndex((p) => p.skillId === skill.id);
    if (at > 0) assignment.problems.unshift(...assignment.problems.splice(at, 1));
    saveAssignment(assignment);
    router.push("/practice");
  };

  const queueNodes: LessonNode[] = plan.items.map((item, i) => {
    const skill = SKILLS.find((s) => s.id === item.skillId);
    // A tick means the kid really finished that skill, at the bar graduation
    // uses — a never-played skill must not arrive wearing a checkmark.
    const mastered =
      (session.levels[item.skillId] ?? DEFAULT_LEVEL) >= GRADUATION_SKILL_LEVEL &&
      (session.mastery[item.skillId] ?? DEFAULT_MASTERY) >= GRADUATION_SKILL_MASTERY;
    return {
      id: `${item.skillId}-${i}`,
      label: skill ? skill.name : item.skillId,
      detail: REASON_WORDS[item.reason],
      state: i === 0 ? "current" : mastered ? "done" : "available",
    };
  });

  // The road shows what is still shut, so the padlock art and the reason are
  // reachable instead of living only in `locked` skins nobody emitted.
  const lockedPreview: LessonNode[] = SKILLS.filter((s) => s.grade === 5 && !unlocked[s.domain])
    .sort((a, b) => {
      const ra = CURRICULUM_ORDER.indexOf(a.id);
      const rb = CURRICULUM_ORDER.indexOf(b.id);
      return (ra === -1 ? CURRICULUM_ORDER.length : ra) - (rb === -1 ? CURRICULUM_ORDER.length : rb);
    })
    .slice(0, MAX_LOCKED_PREVIEW)
    .map((s) => ({
      id: `locked:${s.id}`,
      label: s.name,
      detail: "Fifth grade · Ace grade 4 to open this!",
      state: "locked",
    }));

  const nodes: LessonNode[] = [
    ...queueNodes,
    ...lockedPreview,
    { id: "chest:plan", label: "Prize chest", state: "chest" },
  ];

  const upNext = plan.items.slice(0, MAX_UP_NEXT_ROWS);
  const earnedGraduations = grades ? grades.filter((v) => v.graduated && !v.overridden).length : 0;
  const celebratedTitle = freshUnlocks.includes("fifth-grade") ? "You reached Fifth Grade!" : "You graduated!";

  return (
    <main className="mt-shell mt-shell-nav flex min-h-screen flex-col gap-5 py-6">
      <PageFade>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {progress ? (
                <>
                  <StreakFlame count={progress.streakCount} lit={progress.streakCount > 0} />
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

          <DuoCard title="Your road" subtitle="Tap the glowing circle to play! Padlocks open when you ace grade 4.">
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
                title={hasPractised ? "All caught up!" : "No extra turns yet!"}
                body={
                  hasPractised
                    ? "Nothing needs another go right now — every skill you've practised is holding strong."
                    : "Play a game and this is where we'll line up the bits worth another go."
                }
                pose={hasPractised ? "cheer" : "happy"}
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {practiceSkills.map((s) => {
                  // `generateAssignment` starts the run at the stored session
                  // level, falling back to the plan item's — so the row names
                  // the level the kid will actually play, not a stale one.
                  const level = session.levels[s.id] ?? plan.levels[s.id] ?? DEFAULT_LEVEL;
                  return (
                    <li
                      key={s.id}
                      className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-cream px-4 py-3"
                    >
                      <div className="flex flex-col gap-0.5">
                        <p className="text-kid-base font-bold">💪 {s.name}</p>
                        <p className="text-kid-sm font-semibold text-ink-soft">
                          {REASON_WORDS.reteach} We&apos;ll start again with extra help at Level {level} ·{" "}
                          {LEVEL_LABELS[level]}.
                        </p>
                      </div>
                      <ChunkyButton
                        size="sm"
                        variant="secondary"
                        fullWidth
                        onClick={() => startExtraTurn(s, level)}
                      >
                        Start this game 💪
                      </ChunkyButton>
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
                  const name = domain?.name ?? g.domain;
                  // The bar and the counts describe the KID's own progress; a
                  // parent switch is reported as a note, never as their work.
                  const status = domainGraduationStatus(g.domain, session.levels, session.mastery);
                  const openedByGrownUp = g.overridden && g.graduated;
                  const closedByGrownUp = g.overridden && !g.graduated;
                  const pct = graduationPct(status);
                  return (
                    <li key={g.domain} className="flex flex-col gap-1">
                      <p className="font-display text-kid-lg font-semibold">
                        {name}{" "}
                        {status.graduated ? (
                          <span aria-label="graduated">🎓 Done!</span>
                        ) : (
                          <span className="font-body text-kid-sm font-bold text-muted">
                            {status.qualifying} of {status.total} ready
                          </span>
                        )}
                      </p>
                      <ProgressBar
                        value={pct}
                        max={100}
                        tone="sky"
                        label={`${name}: ${status.qualifying} of ${status.total} skills ready, ${pct}% of the way to opening grade 5`}
                      />
                      <p className="text-kid-sm font-semibold text-muted">
                        {openedByGrownUp
                          ? "A grown-up opened this area for you 🛠️"
                          : closedByGrownUp
                            ? "A grown-up closed this area for now 🔒"
                            : status.graduated
                              ? `All done — ${g.grade5Count} fifth-grade game${g.grade5Count === 1 ? "" : "s"} unlocked! 🎮`
                              : blockerWords(graduationBlocker(g.domain, session))}
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
                  ? earnedGraduations >= fifth.needed
                    ? "Fifth Grade unlocked — you did it! 🎉"
                    : "A grown-up unlocked Fifth Grade for you 🛠️"
                  : `Fifth Grade: ${earnedGraduations} of ${fifth.needed} zones done — keep climbing! 🧗`}
              </Alert>
            ) : null}
          </DuoCard>

          <DuoCard title="Up next" subtitle="What your games will look like!">
            {upNext.length === 0 ? (
              <EmptyState
                title="No games queued yet!"
                body="Tap play and we'll pick your very first game."
                pose="happy"
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {upNext.map((item, i) => {
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
                {plan.items.length > upNext.length ? (
                  <li className="px-1 text-kid-sm font-semibold text-muted">
                    …and {plan.items.length - upNext.length} more game
                    {plan.items.length - upNext.length === 1 ? "" : "s"} after these.
                  </li>
                ) : null}
              </ul>
            )}
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
