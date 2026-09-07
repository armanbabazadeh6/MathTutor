"use client";

import { useMemo, useRef, useState } from "react";
import { Celebration, ConfettiBurst, Shake } from "@/components/effects";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { HeartBar } from "@/components/duo/HeartBar";
import {
  checkAnswer,
  loadPlanSession,
  recordGradedAttempt,
  recordReteachOutcome,
  xpForResult,
} from "@/lib/session";
import type { AssignmentState, GeneratedProblem, PracticeResult, ProblemAttempt } from "@/lib/session";
import { generateProblem } from "@/lib/math/generators";
import type { Problem } from "@/lib/math/types";
import { DEFAULT_LEVEL, clampLevel, levelToDifficulty } from "@/lib/plan/levels";
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
  const [stage, setStage] = useState<"answer" | "wrong1" | "wrong2" | "reveal" | "correct">("answer");
  const [attemptsUsed, setAttemptsUsed] = useState(1);
  const [error, setError] = useState("");
  const attemptsRef = useRef<ProblemAttempt[]>([]);
  const startRef = useRef<number>(Date.now());

  const problem = assignment.problems[index];
  const [followUp, setFollowUp] = useState<GeneratedProblem | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const displayProblem = followUp ?? problem;

  const advance = useMemo(
    () => (solved: boolean, correctFirstTry: boolean) => {
      const now = Date.now();
      recordGradedAttempt({
        skillId: displayProblem.skillId,
        firstTryCorrect: correctFirstTry,
        exhaustedAttempts: !solved,
        correct: solved,
        usedHint: attemptsUsed > 1,
      });
      const record: ProblemAttempt = {
        problemId: displayProblem.id,
        domain: displayProblem.domain,
        attemptsUsed,
        solved,
        correctFirstTry,
        timeMs: now - startRef.current,
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
        onComplete({
          assignmentId: assignment.id,
          finishedAt: Date.now(),
          total,
          solved: solvedCount,
          correctFirst: firstCount,
          accuracy: total ? Math.round((firstCount / total) * 100) : 0,
          perDomain,
          xpEarned: xpForResult(all),
          attempts: all,
        });
        return;
      }
      setIndex(index + 1);
      setFollowUp(null);
      setInput("");
      setStage("answer");
      setAttemptsUsed(1);
      setError("");
      startRef.current = Date.now();
    },
    [assignment, index, total, onComplete, displayProblem, attemptsUsed]
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
    const ok = checkAnswer(input, displayProblem.answer);
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

  const skipAfterReveal = () => advance(false, false);

  const startTeach = () => {
    setLesson(buildLesson(toMathProblem(displayProblem)));
  };

  const finishTeach = (reteachCorrect: boolean) => {
    setLesson(null);
    if (reteachCorrect) {
      // Struggle first: record the exhausted attempt, then the reteach win.
      recordGradedAttempt({
        skillId: displayProblem.skillId,
        firstTryCorrect: false,
        exhaustedAttempts: true,
        correct: false,
        usedHint: true,
      });
      recordReteachOutcome(displayProblem.skillId, true);
      // Follow-up check: fresh numbers, same skill, at the (lowered) plan level.
      const session = loadPlanSession();
      const level = clampLevel(session.levels[displayProblem.skillId] ?? DEFAULT_LEVEL);
      const fresh = generateProblem(
        displayProblem.skillId,
        Math.floor(Math.random() * 2 ** 31),
        levelToDifficulty(level)
      );
      setFollowUp(toGeneratedProblem(fresh));
      setInput("");
      setStage("answer");
      setAttemptsUsed(1);
      setError("");
      startRef.current = Date.now();
    } else {
      recordReteachOutcome(displayProblem.skillId, false);
      advance(false, false);
    }
  };

  if (lesson) {
    return (
      <div className="flex flex-col gap-5">
        <ChunkyProgress value={index} max={total} label={`Question ${index + 1} of ${total}`} />
        <TeachView lesson={lesson} onComplete={finishTeach} />
      </div>
    );
  }

  const hearts = Math.max(0, 3 - (attemptsUsed - 1));
  const pose = stage === "correct" ? "cheer" : stage === "answer" ? "happy" : "think";
  const pct = total > 0 ? Math.round((index / total) * 100) : 0;

  return (
    <PageFade>
      <div
        key={displayProblem.id}
        className="animate-duo-pop flex flex-col gap-4"
      >
        {/* Top bar: progress + hearts */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ChunkyProgress value={index} max={total} label={`Question ${index + 1} of ${total}`} />
          </div>
          <HeartBar hearts={hearts} max={3} />
        </div>

        {/* Mascot coach reacts to every try */}
        <div className="flex items-end gap-3">
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
                ? "Let's learn it together. 📖"
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
          subtitle={`${displayProblem.skillName} · try ${attemptsUsed}${followUp ? " · bonus try 💪" : ""}`}
        >
          <div className="flex flex-col gap-4">
            {stage === "correct" ? (
              <div className="flex flex-col gap-3">
                <Celebration label={`Correct! ${displayProblem.explanation}`} />
                <ConfettiBurst label="Right answer! Amazing!" />
              </div>
            ) : (
              <Shake shakeKey={`${displayProblem.id}-${attemptsUsed}`}>
                <div className="flex flex-col gap-3">
                  {stage === "wrong1" || stage === "wrong2" || stage === "reveal" ? (
                    <p className="rounded-2xl border-2 border-line bg-cream p-4 text-kid-base font-bold" role="status">
                      💡 Hint 1: {displayProblem.hint1}
                    </p>
                  ) : null}
                  {stage === "wrong2" || stage === "reveal" ? (
                    <p className="rounded-2xl border-2 border-sunnydark bg-sunny/40 p-4 text-kid-base font-bold" role="status">
                      💡 Hint 2: {displayProblem.hint2}
                    </p>
                  ) : null}
                  {stage === "reveal" ? (
                    <p className="rounded-2xl border-2 border-skydark bg-sky/30 p-4 text-kid-base font-bold" role="status">
                      📖 Let&apos;s learn it: {displayProblem.explanation} The answer was{" "}
                      <strong>{displayProblem.answer}</strong>.
                    </p>
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
                  inputMode="decimal"
                  autoFocus
                  placeholder="Type here…"
                  className="touch-target mt-2 w-full rounded-2xl border-2 border-line bg-white px-5 py-4 text-3xl font-extrabold outline-none focus:border-primary"
                />
                {error ? (
                  <p className="mt-2 text-kid-base font-bold text-coral" role="alert">
                    {error}
                  </p>
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
                  onClick={skipAfterReveal}
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

/** Chunky Duo-style progress bar (visual only — same value/max/label contract). */
function ChunkyProgress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <p className="mb-1 font-display text-kid-sm font-semibold text-muted">{label}</p>
      <div className="h-5 overflow-hidden rounded-pill border-2 border-line bg-card">
        <div
          className="h-full rounded-pill bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
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
    answerType: "text",
    explanation: p.explanation,
    hint1: p.hint1,
    hint2: p.hint2,
  };
}

/** Fresh generator output back into the session problem shape. */
function toGeneratedProblem(p: Problem): GeneratedProblem {
  const skill = SKILLS.find((s) => s.id === p.skill);
  return {
    id: `${p.id}-reteach`,
    skillId: p.skill,
    domain: (skill?.domain ?? "operations-algebraic") as GeneratedProblem["domain"],
    skillName: skill?.name ?? p.skill,
    prompt: p.text,
    answer: p.answer,
    hint1: "Look for the trick you just learned. 🕵️",
    hint2: "Try it step by step, like the lesson showed. 👣",
    explanation: p.explanation ?? "",
  };
}
