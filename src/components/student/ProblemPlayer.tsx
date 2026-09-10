"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Celebration, ConfettiBurst, LevelUpOverlay, Shake } from "@/components/effects";
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
  clearPracticeProgress,
  isQuestAssignment,
  loadPlanSession,
  loadPointsState,
  loadPracticeProgress,
  recordGradedAttempt,
  recordReteachOutcome,
  savePracticeProgress,
  xpForResult,
} from "@/lib/session";
import type {
  AssignmentState,
  GeneratedProblem,
  GradedOutcome,
  PracticeResult,
  ProblemAttempt,
} from "@/lib/session";
import { ANSWER_INPUT_MODES, ANSWER_KEYPAD_CHARS, appendKeypadChar } from "@/lib/answerInput";
import type { Problem } from "@/lib/math/types";
import { DEFAULT_LEVEL, LEVEL_LABELS, clampLevel } from "@/lib/plan/levels";
import type { SkillLevel } from "@/lib/plan/levels";
import { buildLesson } from "@/lib/teach/lessons";
import type { Lesson } from "@/lib/teach/lessons";
import { TeachView } from "@/components/student/TeachView";

type Stage = "answer" | "wrong1" | "wrong2" | "reveal" | "correct";

/** Tries a problem allows before the answer is revealed. */
const MAX_TRIES = 3;

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
  const [stage, setStage] = useState<Stage>("answer");
  const [attemptsUsed, setAttemptsUsed] = useState(1);
  const [error, setError] = useState("");
  const attemptsRef = useRef<ProblemAttempt[]>([]);
  const startRef = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const problem = assignment.problems[index];
  const [lesson, setLesson] = useState<Lesson | null>(null);
  /**
   * Set the instant this problem's outcome is recorded. The grade happens here
   * — when the answer is judged, not when the kid taps Next — so the fly-up is
   * a number the wallet already holds and an attempt survives leaving midway.
   */
  const gradedRef = useRef(false);
  /** This outcome came out of the reveal + lesson, never a clean first try. */
  const [relearned, setRelearned] = useState(false);
  /** ⭐ points the wallet actually banked for this problem; 0 hides the fly-up. */
  const [banked, setBanked] = useState(0);
  /** Set when this attempt pushed a skill up a level — drives LevelUpOverlay. */
  const [levelUp, setLevelUp] = useState<{
    skillName: string;
    from: SkillLevel;
    to: SkillLevel;
  } | null>(null);
  /** Set when this attempt dropped a skill a level, so the coach can say so. */
  const [levelDown, setLevelDown] = useState(false);
  /** Finished run, held until the kid taps "See my stars!". */
  const resultRef = useRef<PracticeResult | null>(null);
  // Quest assignments count the day streak; free-pick extra practice earns
  // effort stars only (no streak movement). Derived from the assignment id.
  const questMode = isQuestAssignment(assignment);
  // The picture is derived from the words, never a replacement for them. Null
  // when a drawing would not help this problem.
  const visual = useMemo(
    () =>
      buildVisual(problem.skillId, {
        text: problem.prompt,
        answer: problem.answer,
      }),
    [problem.skillId, problem.prompt, problem.answer],
  );

  // Pick up a run the kid left mid-way. One record is kept for the queued
  // assignment, so a record naming a different assignment is stale by
  // definition and must never rewind the run that is on screen now.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let saved;
    try {
      saved = loadPracticeProgress();
    } catch {
      saved = null;
    }
    if (!saved) return;
    if (saved.assignmentId !== assignment.id) {
      try {
        clearPracticeProgress();
      } catch {
        // Nothing to clear against a store that will not answer.
      }
      return;
    }
    const attempts = Array.isArray(saved.attempts) ? saved.attempts.slice() : [];
    const resumeAt = Math.max(0, Math.min(total, Math.floor(saved.index)));
    if (attempts.length === 0 || resumeAt <= 0) return;
    attemptsRef.current = attempts.slice(0, resumeAt);
    if (resumeAt < total) {
      setIndex(resumeAt);
      startRef.current = Date.now();
      return;
    }
    // Every problem already has an outcome: show the last one, whose button
    // hands the finished run over, instead of throwing the work away.
    const last = attempts[total - 1];
    if (!last) return;
    resultRef.current = buildResult(assignment, attemptsRef.current);
    gradedRef.current = true;
    setRelearned(last.needsReteach === true);
    setAttemptsUsed(Math.min(last.attemptsUsed, MAX_TRIES));
    setIndex(total - 1);
    setStage(last.solved ? "correct" : "reveal");
  }, [assignment, total]);

  /**
   * Record this problem exactly once, at the moment its outcome is decided,
   * and bank the ⭐ points the wallet credits for it. `throughLesson` means the
   * kid was revealed the answer and came back through the lesson, so the
   * outcome is a hint-assisted win — never a first try.
   */
  const grade = (solved: boolean, correctFirstTry: boolean, throughLesson: boolean) => {
    if (gradedRef.current) return;
    gradedRef.current = true;
    setRelearned(throughLesson);
    const skillId = problem.skillId;
    // The engine's own pre-attempt level: both the overlay and the results row
    // read it here, so they can never disagree about where a level started.
    const levelBefore = engineLevel(skillId);
    const walletBefore = loadPointsState().balance;
    const effort = questMode ? undefined : { countStreak: false };
    const triesUsed = Math.min(
      stage === "reveal" || throughLesson ? MAX_TRIES : attemptsUsed,
      MAX_TRIES,
    );
    let outcome: GradedOutcome;
    if (throughLesson) {
      // Two honest engine entries: the problem the kid exhausted, then what
      // the lesson's check turned it into.
      recordGradedAttempt(
        {
          skillId,
          firstTryCorrect: false,
          exhaustedAttempts: true,
          correct: false,
          usedHint: true,
        },
        undefined,
        effort,
      );
      outcome = recordReteachOutcome(skillId, solved, undefined, effort);
    } else {
      outcome = recordGradedAttempt(
        {
          skillId,
          firstTryCorrect: correctFirstTry,
          exhaustedAttempts: !solved,
          correct: solved,
          usedHint: triesUsed > 1,
        },
        undefined,
        effort,
      );
    }
    const levelAfter = outcome.level;
    // The engine has always returned this; the player used to drop it.
    if (outcome.promoted)
      setLevelUp({ skillName: problem.skillName, from: levelBefore, to: levelAfter });
    setLevelDown(outcome.demoted);
    setBanked(Math.max(0, outcome.points.balance - walletBefore));
    const record: ProblemAttempt = {
      problemId: problem.id,
      domain: problem.domain,
      skillId: problem.skillId,
      skillName: problem.skillName,
      level: problem.level,
      attemptsUsed: triesUsed,
      solved,
      correctFirstTry,
      timeMs: Date.now() - startRef.current,
      ...(levelAfter === levelBefore
        ? {}
        : {
            levelFrom: levelBefore,
            levelTo: levelAfter,
            promoted: levelAfter > levelBefore,
            demoted: levelAfter < levelBefore,
          }),
      ...(throughLesson || outcome.reteach ? { needsReteach: true } : {}),
    };
    const all = [...attemptsRef.current, record];
    attemptsRef.current = all;
    // Saving on every graded problem is what makes "Keep going" land on the
    // next question with the earlier answers already counted. The last problem
    // is saved as one past the end so a finished-but-unseen run can be rebuilt.
    try {
      savePracticeProgress({
        assignmentId: assignment.id,
        index: index + 1 >= total ? total : index + 1,
        attempts: all,
      });
    } catch {
      // Storage unavailable: the run still plays, it just cannot resume.
    }
    if (index + 1 >= total) resultRef.current = buildResult(assignment, all);
  };

  /** Leave the finished problem: next question, or hand over the whole run. */
  const next = () => {
    const finished = resultRef.current;
    if (finished) {
      resultRef.current = null;
      try {
        clearPracticeProgress();
      } catch {
        // The run is over; a store that will not answer needs no clearing.
      }
      if (index + 1 >= total) setIndex(total - 1);
      onComplete(finished);
      return;
    }
    setIndex(index + 1);
    setInput("");
    setStage("answer");
    setAttemptsUsed(1);
    setError("");
    setLevelDown(false);
    setBanked(0);
    setRelearned(false);
    gradedRef.current = false;
    startRef.current = Date.now();
  };

  const submit = () => {
    if (stage === "correct") {
      next();
      return;
    }
    if (stage === "reveal") {
      // Gave up after three tries: the miss is recorded now, on the way on.
      grade(false, false, false);
      next();
      return;
    }
    const answer = input.trim();
    if (!answer) {
      setError("Type your answer first!");
      return;
    }
    if (checkAnswer(answer, problem.answer, problem.answerType)) {
      grade(true, attemptsUsed === 1, false);
      setError("");
      setStage("correct");
      return;
    }
    if (stage === "answer") {
      setStage("wrong1");
      setAttemptsUsed(2);
      setError("Not quite. Read hint 1. Try again!");
    } else if (stage === "wrong1") {
      setStage("wrong2");
      setAttemptsUsed(MAX_TRIES);
      setError("Good try. Read hint 2. One more go!");
    } else {
      // Third miss: show the answer rather than offer a fourth try.
      setStage("reveal");
      setError("");
    }
    // Clear the miss so the next try starts from a blank field.
    setInput("");
    inputRef.current?.focus();
  };

  /** Dismiss the celebration; the problem's own button moves the run on. */
  const closeLevelUp = () => setLevelUp(null);

  const startTeach = () => {
    setLesson(buildLesson(toMathProblem(problem)));
  };

  /**
   * The lesson is over: bank what it produced. A passed check is a
   * hint-assisted win for the problem that was revealed — never a first try.
   */
  const finishTeach = (lessonPassed: boolean) => {
    setLesson(null);
    grade(lessonPassed, false, true);
    if (lessonPassed) setStage("correct");
    else next();
  };

  if (lesson) {
    return (
      <div className="mt-page-fade flex min-h-0 flex-1 flex-col gap-4">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 pb-1">
            <ProgressBar value={index} max={total} label={`Question ${index + 1} of ${total}`} />
            <TeachView lesson={lesson} onComplete={finishTeach} />
          </div>
        </div>
      </div>
    );
  }

  const wrongTries = stage === "reveal" ? MAX_TRIES : attemptsUsed - 1;
  const hearts = Math.max(0, MAX_TRIES - wrongTries);
  const pose = stage === "correct" ? "cheer" : stage === "answer" ? "happy" : "think";
  const answered = stage === "correct" || stage === "reveal";
  const done = index + (answered ? 1 : 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = Math.max(0, total - done);
  const isLast = index + 1 >= total;
  const progressLabel = `Question ${index + 1} of ${total}`;

  return (
    <div className="mt-page-fade flex min-h-0 flex-1 flex-col gap-3">
      {levelUp ? (
        <LevelUpOverlay
          skillName={levelUp.skillName}
          from={levelUp.from}
          to={levelUp.to}
          onClose={closeLevelUp}
        />
      ) : null}
      {/* The question scrolls in here; the answer tray and the bottom nav below
          it never move, so the input and CHECK IT! are always in reach. */}
      <div
        key={problem.id}
        className="animate-duo-pop -mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pb-1"
      >
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
            {stage === "correct" && banked > 0 ? (
              <span
                aria-hidden
                className="mt-xp-fly pointer-events-none absolute -top-1 left-0 right-0 text-center font-display text-kid-xl font-semibold text-primaryink"
              >
                +{banked}
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
              ? relearned
                ? "We learned it together — great work! 🎉"
                : "Yes! You got it! 🎉"
              : stage === "reveal"
                ? levelDown
                  ? "Small steps still count. Let's practise this one together. 💪"
                  : "Let's learn it together. 📖"
                : stage === "wrong1" || stage === "wrong2"
                  ? "Good try! Use the hint. 💪"
                  : "You can do it! Read and try. ⭐"}
          </div>
        </div>

        {/* Big chunky answer pad */}
        <DuoCard title={problem.prompt} subtitle={`try ${attemptsUsed}`}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge label={problem.skillName} tone="sky" />
              <Badge
                label={`Level ${problem.level} · ${LEVEL_LABELS[problem.level]}`}
                tone="sunny"
              />
            </div>
            {problem.intendedSkillId ? (
              <p className="text-kid-sm font-semibold text-muted">
                You picked something else — this one is {problem.skillName}.
              </p>
            ) : null}

            {visual ? (
              <div className="rounded-2xl border-2 border-line bg-white p-3">
                <VisualModelView model={visual} />
              </div>
            ) : null}

            {stage === "correct" ? (
              <div className="flex flex-col gap-3">
                <Celebration label={`Correct! ${problem.explanation}`} />
                <ConfettiBurst label="Right answer! Amazing!" />
              </div>
            ) : (
              <Shake shakeKey={`${problem.id}-${attemptsUsed}`}>
                <div className="flex flex-col gap-3">
                  {stage === "wrong1" || stage === "wrong2" || stage === "reveal" ? (
                    <div
                      className="rounded-2xl border-2 border-sunnydark bg-sunny-soft p-4 text-kid-base font-bold text-sunnyink"
                      role="status"
                    >
                      <p className="font-display text-kid-xs font-bold uppercase tracking-wide">
                        Hint 1
                      </p>
                      <p className="mt-1">💡 {problem.hint1}</p>
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
                      <p className="mt-1">💡 {problem.hint2}</p>
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
                        📖 {problem.explanation}
                        {/* The explanation usually states the answer already;
                            repeating it would read the same fact twice. */}
                        {problem.explanation.includes(problem.answer) ? null : (
                          <>
                            {" "}
                            The answer was <strong>{problem.answer}</strong>.
                          </>
                        )}
                      </p>
                    </div>
                  ) : null}
                </div>
              </Shake>
            )}

          </div>
        </DuoCard>

        <p className="text-center text-kid-sm font-semibold text-muted" aria-hidden>
          {remaining === 0
            ? `${pct}% through · all done! 🎉`
            : `${pct}% through · ${remaining} to go!`}
        </p>
      </div>

      {/* The answer tray is a flex child of the shell, so the input and CHECK
          IT! can never end up under the bottom nav, however tall the question. */}
      <div className="shrink-0">
        {stage !== "correct" && stage !== "reveal" ? (
          <div className="rounded-3xl border-2 border-primarydark bg-mint/40 p-4">
            <label htmlFor="answer" className="font-display text-kid-lg font-semibold">
              Your answer ✏️{" "}
              <span className="font-body text-kid-sm font-semibold text-muted">
                (numbers or fractions like 3/4)
              </span>
            </label>
            {/* ⌫ rides with the field; the four remaining keys then fit one row
                on a 320px phone, leaving the question room to breathe. */}
            <div className="mt-2 flex items-center gap-2">
              <input
                id="answer"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                inputMode={ANSWER_INPUT_MODES[problem.answerType]}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                enterKeyHint="go"
                autoFocus
                placeholder="Type here…"
                className="touch-target mt-focus min-w-0 flex-1 rounded-2xl border-2 border-line bg-white px-5 py-4 text-kid-2xl font-extrabold focus:border-primary"
              />
              <button
                type="button"
                aria-label="delete the last character"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setInput((v) => v.slice(0, -1))}
                className="touch-target min-h-[56px] min-w-[56px] shrink-0 rounded-2xl border-2 border-line bg-white px-3 text-2xl font-extrabold"
              >
                ⌫
              </button>
            </div>
            <div
              className="mt-2 flex flex-wrap gap-1.5 sm:gap-2"
              role="group"
              aria-label="Answer keypad"
            >
              {ANSWER_KEYPAD_CHARS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  aria-label={ch === "/" ? "fraction bar" : `key ${ch}`}
                  /* Keeps the caret in the answer field: the keypad and the
                     keyboard must never fight over focus. */
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setInput((v) => appendKeypadChar(v, ch))}
                  className="touch-target min-h-[56px] min-w-[56px] flex-1 rounded-2xl border-2 border-line bg-white text-2xl font-extrabold"
                >
                  {ch}
                </button>
              ))}
              <button
                type="button"
                aria-label="clear the answer"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setInput("")}
                className="touch-target min-h-[56px] min-w-[56px] flex-1 rounded-2xl border-2 border-line bg-white font-display text-kid-sm font-bold uppercase tracking-wide"
              >
                Clear
              </button>
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
          <ChunkyButton onClick={next} size="lg" fullWidth shine>
            {isLast ? "See my stars! 🎉" : "Next! →"}
          </ChunkyButton>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <ChunkyButton onClick={startTeach} size="lg" className="flex-1">
              Teach me 🙋
            </ChunkyButton>
            <ChunkyButton onClick={submit} variant="secondary" size="lg" className="flex-1">
              {isLast ? "See my stars" : "Next →"}
            </ChunkyButton>
          </div>
        )}
      </div>
    </div>
  );
}

/** The engine's level for a skill right now — the level the rules will move. */
function engineLevel(skillId: string): SkillLevel {
  return clampLevel(loadPlanSession().levels[skillId] ?? DEFAULT_LEVEL);
}

/** Assemble a finished run from its graded attempts. */
function buildResult(assignment: AssignmentState, attempts: ProblemAttempt[]): PracticeResult {
  const total = assignment.problems.length;
  const perCount: Record<string, { total: number; solved: number }> = {};
  assignment.problems.forEach((p, i) => {
    const e = perCount[p.domain] ?? { total: 0, solved: 0 };
    e.total += 1;
    if (attempts[i] && attempts[i].solved) e.solved += 1;
    perCount[p.domain] = e;
  });
  const perDomain: PracticeResult["perDomain"] = Object.keys(perCount).map((domain) => ({
    domain: domain as ProblemAttempt["domain"],
    domainName: pDomainName(domain),
    total: perCount[domain].total,
    solved: perCount[domain].solved,
  }));
  // One row per skill that actually moved, keeping the first transition a
  // skill saw so a double level-up doesn't render twice.
  const levelChanges: PracticeResult["levelChanges"] = [];
  const reteachSkills: PracticeResult["reteachSkills"] = [];
  const movedSkills = new Set<string>();
  const reteachSeen = new Set<string>();
  for (const a of attempts) {
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
  const solvedCount = attempts.filter((a) => a.solved).length;
  const firstCount = attempts.filter((a) => a.correctFirstTry).length;
  return {
    assignmentId: assignment.id,
    finishedAt: Date.now(),
    total,
    solved: solvedCount,
    correctFirst: firstCount,
    accuracy: total ? Math.round((firstCount / total) * 100) : 0,
    perDomain,
    xpEarned: xpForResult(attempts),
    attempts,
    levelChanges,
    reteachSkills,
  };
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
