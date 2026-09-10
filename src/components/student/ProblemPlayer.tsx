"use client";

import { useMemo, useRef, useState } from "react";
import { Celebration, ConfettiBurst, LevelUpOverlay, Shake } from "@/components/effects";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { Alert } from "@/components/duo/Alert";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { HeartBar } from "@/components/duo/HeartBar";
import { ProgressBar } from "@/components/duo/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { VisualModelView } from "@/components/visuals/VisualModelView";
import { buildVisual } from "@/lib/visual";
import {
  checkAnswer,
  isQuestAssignment,
  loadPlanSession,
  recordGradedAttempt,
  recordReteachOutcome,
  xpForResult,
} from "@/lib/session";
import type {
  AssignmentState,
  GeneratedProblem,
  PracticeResult,
  ProblemAttempt,
} from "@/lib/session";
import { ANSWER_INPUT_MODE, ANSWER_KEYPAD_CHARS, appendKeypadChar } from "@/lib/answerInput";
import { generateProblem } from "@/lib/math/generators";
import type { Problem } from "@/lib/math/types";
import { DEFAULT_LEVEL, LEVEL_LABELS, clampLevel } from "@/lib/plan/levels";
import type { SkillLevel } from "@/lib/plan/levels";
import { buildLesson } from "@/lib/teach/lessons";
import type { Lesson } from "@/lib/teach/lessons";
import { SKILLS } from "@/lib/skills";
import { TeachView } from "@/components/student/TeachView";

export function ProblemPlayer({
  assignment,
  onComplete,
}: {
  assignment: AssignmentState;
  onComplete: (r: PracticeResult) => void;
}) {
  const total = assignment.problems.length;
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<"answer" | "wrong1" | "wrong2" | "reveal" | "correct">(
    "answer",
  );
  const [attemptsUsed, setAttemptsUsed] = useState(1);
  const [error, setError] = useState("");
  const attemptsRef = useRef<ProblemAttempt[]>([]);
  const startRef = useRef<number>(Date.now());

  const problem = assignment.problems[index];
  const [followUp, setFollowUp] = useState<GeneratedProblem | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  /** Set when this attempt pushed a skill up a level — drives LevelUpOverlay. */
  const [levelUp, setLevelUp] = useState<{
    skillName: string;
    from: SkillLevel;
    to: SkillLevel;
  } | null>(null);
  /** Set when this attempt dropped a skill a level, so the coach can say so. */
  const [levelDown, setLevelDown] = useState(false);
  /** Finished session held back so a last-problem level-up can be seen first. */
  const [pendingResult, setPendingResult] = useState<PracticeResult | null>(null);
  // Quest assignments count the day streak; free-pick extra practice earns
  // effort stars only (no streak movement). Derived from the assignment id.
  const questMode = isQuestAssignment(assignment);
  const displayProblem = followUp ?? problem;
  // The picture is derived from the words, never a replacement for them. Null
  // when a drawing would not help this problem.
  const visual = useMemo(
    () =>
      buildVisual(displayProblem.skillId, {
        text: displayProblem.prompt,
        answer: displayProblem.answer,
      }),
    [displayProblem.skillId, displayProblem.prompt, displayProblem.answer],
  );

  const advance = useMemo(
    () => (solved: boolean, correctFirstTry: boolean) => {
      const now = Date.now();
      const levelBefore = displayProblem.level;
      const outcome = recordGradedAttempt(
        {
          skillId: displayProblem.skillId,
          firstTryCorrect: correctFirstTry,
          exhaustedAttempts: !solved,
          correct: solved,
          usedHint: attemptsUsed > 1,
        },
        undefined,
        questMode ? undefined : { countStreak: false },
      );
      const levelAfter = outcome.level;
      // The engine has always returned this; the player used to drop it.
      if (outcome.promoted)
        setLevelUp({ skillName: displayProblem.skillName, from: levelBefore, to: levelAfter });
      setLevelDown(outcome.demoted);
      const record: ProblemAttempt = {
        problemId: displayProblem.id,
        domain: displayProblem.domain,
        skillId: displayProblem.skillId,
        skillName: displayProblem.skillName,
        level: levelBefore,
        attemptsUsed,
        solved,
        correctFirstTry,
        timeMs: now - startRef.current,
        ...(levelAfter === levelBefore
          ? {}
          : {
              levelFrom: levelBefore,
              levelTo: levelAfter,
              promoted: levelAfter > levelBefore,
              demoted: levelAfter < levelBefore,
            }),
        ...(outcome.reteach ? { needsReteach: true } : {}),
      };
      const all = [...attemptsRef.current, record];
      attemptsRef.current = all;
      if (index + 1 >= total) {
        const solvedCount = all.filter((a) => a.solved).length;
        const firstCount = all.filter((a) => a.correctFirstTry).length;
        const perCount: Record<string, { total: number; solved: number }> = {};
        assignment.problems.forEach((p, i) => {
          const e = perCount[p.domain] ?? { total: 0, solved: 0 };
          e.total += 1;
          if (all[i] && all[i].solved) e.solved += 1;
          perCount[p.domain] = e;
        });
        const perDomain: PracticeResult["perDomain"] = Object.keys(perCount).map((domain) => ({
          domain: domain as ProblemAttempt["domain"],
          domainName: pDomainName(domain),
          total: perCount[domain].total,
          solved: perCount[domain].solved,
        }));
        // One row per skill that actually moved, keeping the first transition
        // a skill saw so a double level-up doesn't render twice.
        const levelChanges: PracticeResult["levelChanges"] = [];
        const reteachSkills: PracticeResult["reteachSkills"] = [];
        const movedSkills = new Set<string>();
        const reteachSeen = new Set<string>();
        for (const a of all) {
          if (a.levelFrom !== undefined && a.levelTo !== undefined && !movedSkills.has(a.skillId)) {
            movedSkills.add(a.skillId);
            levelChanges.push({
              skillId: a.skillId,
              skillName: a.skillName,
              from: a.levelFrom,
              to: a.levelTo,
              direction: a.levelTo > a.levelFrom ? "up" : "down",
            });
          }
          if (a.needsReteach && !reteachSeen.has(a.skillId)) {
            reteachSeen.add(a.skillId);
            reteachSkills.push({ skillId: a.skillId, skillName: a.skillName });
          }
        }
        const result: PracticeResult = {
          assignmentId: assignment.id,
          finishedAt: Date.now(),
          total,
          solved: solvedCount,
          correctFirst: firstCount,
          accuracy: total ? Math.round((firstCount / total) * 100) : 0,
          perDomain,
          xpEarned: xpForResult(all),
          attempts: all,
          levelChanges,
          reteachSkills,
        };
        // On the last problem a level-up would be swallowed by the results
        // screen taking over, so hold the hand-off until the overlay closes.
        if (outcome.promoted) setPendingResult(result);
        else onComplete(result);
        return;
      }
      setIndex(index + 1);
      setFollowUp(null);
      setInput("");
      setStage("answer");
      setAttemptsUsed(1);
      setError("");
      setLevelDown(false);
      startRef.current = Date.now();
    },
    [assignment, index, total, onComplete, displayProblem, attemptsUsed, questMode],
  );

  const submit = () => {
    if (stage === "correct" || stage === "reveal") {
      advance(stage === "correct", attemptsUsed === 1 && stage === "correct");
      return;
    }
    if (!input.trim()) {
      setError("Type your answer first!");
      return;
    }
    const ok = checkAnswer(input, displayProblem.answer, displayProblem.answerType);
    if (ok) {
      setStage("correct");
      setError("");
    } else if (stage === "answer") {
      setStage("wrong1");
      setAttemptsUsed(2);
      setError("Not quite. Read hint 1. Try again!");
    } else if (stage === "wrong1") {
      setStage("wrong2");
      setAttemptsUsed(3);
      setError("Good try. Read hint 2. One more go!");
    } else {
      setStage("reveal");
      setError("");
      setAttemptsUsed(4);
    }
  };

  /** Dismiss the celebration. On the last problem, this is what finishes the session. */
  const closeLevelUp = () => {
    setLevelUp(null);
    if (pendingResult) {
      const finished = pendingResult;
      setPendingResult(null);
      onComplete(finished);
    }
  };

  const startTeach = () => {
    setLesson(buildLesson(toMathProblem(displayProblem)));
  };

  const finishTeach = (reteachCorrect: boolean) => {
    setLesson(null);
    if (reteachCorrect) {
      // Struggle first: record the exhausted attempt, then the reteach win.
      recordGradedAttempt(
        {
          skillId: displayProblem.skillId,
          firstTryCorrect: false,
          exhaustedAttempts: true,
          correct: false,
          usedHint: true,
        },
        undefined,
        questMode ? undefined : { countStreak: false },
      );
      recordReteachOutcome(
        displayProblem.skillId,
        true,
        undefined,
        questMode ? undefined : { countStreak: false },
      );
      // Follow-up check: fresh numbers, same skill, at the (lowered) plan level.
      const session = loadPlanSession();
      const level = clampLevel(session.levels[displayProblem.skillId] ?? DEFAULT_LEVEL);
      const fresh = generateProblem(
        displayProblem.skillId,
        Math.floor(Math.random() * 2 ** 31),
        level,
      );
      setFollowUp(toGeneratedProblem(fresh, level));
      setInput("");
      setStage("answer");
      setAttemptsUsed(1);
      setError("");
      startRef.current = Date.now();
    } else {
      recordReteachOutcome(
        displayProblem.skillId,
        false,
        undefined,
        questMode ? undefined : { countStreak: false },
      );
      advance(false, false);
    }
  };

  if (lesson) {
    return (
      <div className="flex flex-col gap-5">
        <ProgressBar value={index} max={total} label={`Question ${index + 1} of ${total}`} />
        <TeachView lesson={lesson} onComplete={finishTeach} />
      </div>
    );
  }

  const hearts = Math.max(0, 3 - (attemptsUsed - 1));
  const pose = stage === "correct" ? "cheer" : stage === "answer" ? "happy" : "think";
  const pct = total > 0 ? Math.round((index / total) * 100) : 0;
  const progressLabel = `Question ${index + 1} of ${total}`;
  // Per-problem stars, following `xpForResult`'s per-attempt rules: +10 solved,
  // +5 on the first try. The all-first-try session bonus is counted once, in
  // ResultsView, so it is deliberately not part of this fly.
  const xpThisProblem = attemptsUsed === 1 ? 15 : 10;

  return (
    <PageFade>
      {levelUp ? (
        <LevelUpOverlay
          skillName={levelUp.skillName}
          from={levelUp.from}
          to={levelUp.to}
          onClose={closeLevelUp}
        />
      ) : null}
      <div key={displayProblem.id} className="animate-duo-pop flex flex-col gap-4">
        {/* Top bar: progress + hearts */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="mb-1 font-display text-kid-sm font-semibold text-muted">
              {progressLabel}
            </p>
            <ProgressBar value={index} max={total} label={progressLabel} />
          </div>
          <HeartBar hearts={hearts} max={3} />
        </div>

        {/* Mascot coach reacts to every try */}
        <div className="flex items-end gap-3">
          <div className="relative shrink-0">
            <Character
              pose={pose}
              size={88}
              label={
                pose === "cheer"
                  ? "Mascot cheering for your right answer"
                  : pose === "think"
                    ? "Mascot thinking with you"
                    : "Mascot ready for the next question"
              }
            />
            {stage === "correct" ? (
              <span
                aria-hidden
                className="mt-xp-fly pointer-events-none absolute -top-1 left-0 right-0 text-center font-display text-kid-xl font-semibold text-primaryink"
              >
                +{xpThisProblem}
              </span>
            ) : null}
          </div>
          <div
            className="relative flex-1 rounded-2xl border-2 border-line bg-card px-4 py-3 text-kid-base font-bold"
            role="status"
            aria-live="polite"
            style={{ boxShadow: "0 3px 0 var(--chunky-shadow)" }}
          >
            <span
              aria-hidden
              className="absolute -left-2 top-6 h-4 w-4 rotate-45 border-b-2 border-l-2 border-line bg-card"
            />
            {stage === "correct"
              ? "Yes! You got it! 🎉"
              : stage === "reveal"
                ? levelDown
                  ? "Small steps still count. Let's practise this one together. 💪"
                  : "Let's learn it together. 📖"
                : stage === "wrong1" || stage === "wrong2"
                  ? "Good try! Use the hint. 💪"
                  : followUp
                    ? "Bonus try — same skill, new numbers! 💪"
                    : "You can do it! Read and try. ⭐"}
          </div>
        </div>

        {/* Big chunky answer pad */}
        <DuoCard
          title={displayProblem.prompt}
          subtitle={`try ${attemptsUsed}${followUp ? " · bonus try 💪" : ""}`}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge label={displayProblem.skillName} tone="sky" />
              <Badge
                label={`Level ${displayProblem.level} · ${LEVEL_LABELS[displayProblem.level]}`}
                tone="sunny"
              />
            </div>
            {displayProblem.intendedSkillId ? (
              <p className="text-kid-sm font-semibold text-muted">
                You picked something else — this one is {displayProblem.skillName}.
              </p>
            ) : null}

            {visual ? (
              <div className="rounded-2xl border-2 border-line bg-white p-3">
                <VisualModelView model={visual} />
              </div>
            ) : null}

            {stage === "correct" ? (
              <div className="flex flex-col gap-3">
                <Celebration label={`Correct! ${displayProblem.explanation}`} />
                <ConfettiBurst label="Right answer! Amazing!" />
              </div>
            ) : (
              <Shake shakeKey={`${displayProblem.id}-${attemptsUsed}`}>
                <div className="flex flex-col gap-3">
                  {stage === "wrong1" || stage === "wrong2" || stage === "reveal" ? (
                    <div
                      className="rounded-2xl border-2 border-sunnydark bg-sunny-soft p-4 text-kid-base font-bold text-sunnyink"
                      role="status"
                    >
                      <p className="font-display text-kid-xs font-bold uppercase tracking-wide">
                        Hint 1
                      </p>
                      <p className="mt-1">💡 {displayProblem.hint1}</p>
                    </div>
                  ) : null}
                  {stage === "wrong2" || stage === "reveal" ? (
                    <div
                      className="rounded-2xl border-2 border-skydark bg-sky-soft p-4 text-kid-base font-bold text-skyink"
                      role="status"
                    >
                      <p className="font-display text-kid-xs font-bold uppercase tracking-wide">
                        Hint 2
                      </p>
                      <p className="mt-1">💡 {displayProblem.hint2}</p>
                    </div>
                  ) : null}
                  {stage === "reveal" ? (
                    <div
                      className="rounded-2xl border-2 border-coraldark bg-coral-soft p-4 text-kid-base font-bold text-coralink"
                      role="status"
                    >
                      <p className="font-display text-kid-xs font-bold uppercase tracking-wide">
                        Let&apos;s learn it
                      </p>
                      <p className="mt-1">
                        📖 {displayProblem.explanation} The answer was{" "}
                        <strong>{displayProblem.answer}</strong>.
                      </p>
                    </div>
                  ) : null}
                </div>
              </Shake>
            )}

            {stage !== "correct" && stage !== "reveal" ? (
              <div className="rounded-3xl border-2 border-primarydark bg-mint/40 p-4">
                <label htmlFor="answer" className="font-display text-kid-lg font-semibold">
                  Your answer ✏️{" "}
                  <span className="font-body text-kid-sm font-semibold text-muted">
                    (numbers or fractions like 3/4)
                  </span>
                </label>
                <input
                  id="answer"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  inputMode={ANSWER_INPUT_MODE}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  enterKeyHint="go"
                  autoFocus
                  placeholder="Type here…"
                  className="touch-target mt-focus mt-2 w-full rounded-2xl border-2 border-line bg-white px-5 py-4 text-kid-2xl font-extrabold focus:border-primary"
                />
                <div className="mt-2 flex gap-2" role="group" aria-label="Fraction keypad">
                  {ANSWER_KEYPAD_CHARS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      aria-label={ch === "/" ? "fraction bar" : `key ${ch}`}
                      onClick={() => setInput((v) => appendKeypadChar(v, ch))}
                      className="touch-target min-h-[48px] flex-1 rounded-2xl border-2 border-line bg-white text-2xl font-extrabold"
                    >
                      {ch}
                    </button>
                  ))}
                </div>
                {error ? (
                  <Alert tone="error" className="mt-2">
                    {error}
                  </Alert>
                ) : null}
                <ChunkyButton onClick={submit} size="lg" fullWidth shine className="mt-3">
                  Check it! ✅
                </ChunkyButton>
              </div>
            ) : stage === "correct" ? (
              <ChunkyButton onClick={submit} size="lg" fullWidth shine>
                {index + 1 >= total ? "See my stars! 🎉" : "Next! →"}
              </ChunkyButton>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <ChunkyButton onClick={startTeach} size="lg" className="flex-1">
                  Teach me 🙋
                </ChunkyButton>
                <ChunkyButton
                  onClick={() => advance(false, false)}
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                >
                  {index + 1 >= total ? "See my stars" : "Next →"}
                </ChunkyButton>
              </div>
            )}
          </div>
        </DuoCard>

        <p className="text-center text-kid-sm font-semibold text-muted" aria-hidden>
          {pct}% through · {total - index} to go!
        </p>
      </div>
    </PageFade>
  );
}

function pDomainName(domain: string): string {
  const names: Record<string, string> = {
    "operations-algebraic": "Operations & Algebraic Thinking",
    "base-ten": "Number & Operations in Base Ten",
    fractions: "Number & Operations — Fractions",
    "measurement-data": "Measurement & Data",
    geometry: "Geometry",
  };
  return names[domain] ?? domain;
}

/** Session problems carry `prompt`/`skillId`; lessons need math `text`/`skill`. */
function toMathProblem(p: GeneratedProblem): Problem {
  return {
    id: p.id,
    skill: p.skillId,
    difficulty: "medium",
    text: p.prompt,
    answer: p.answer,
    answerType: p.answerType,
    explanation: p.explanation,
    hint1: p.hint1,
    hint2: p.hint2,
  };
}

/** Fresh generator output back into the session problem shape. */
function toGeneratedProblem(p: Problem, level: SkillLevel): GeneratedProblem {
  const skill = SKILLS.find((s) => s.id === p.skill);
  return {
    id: `${p.id}-reteach`,
    skillId: p.skill,
    domain: (skill?.domain ?? "operations-algebraic") as GeneratedProblem["domain"],
    skillName: skill?.name ?? p.skill,
    prompt: p.text,
    answer: p.answer,
    answerType: p.answerType,
    hint1: "Look for the trick you just learned. 🕵️",
    hint2: "Try it step by step, like the lesson showed. 👣",
    explanation: p.explanation ?? "",
    level,
    reason: "reteach",
  };
}
