"use client";

import { useState } from "react";
import { PageFade } from "@/components/effects/PageFade";
import { Celebration } from "@/components/effects";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { Alert } from "@/components/duo/Alert";
import { ProgressBar } from "@/components/duo/ProgressBar";
import { VisualModelView } from "@/components/visuals/VisualModelView";
import { grade } from "@/lib/math/grading";
import { ANSWER_INPUT_MODE, ANSWER_KEYPAD_CHARS, appendKeypadChar } from "@/lib/answerInput";
import type { Lesson } from "@/lib/teach/lessons";

type Verdict = "idle" | "wrong" | "correct";

/**
 * Step-by-step reteach: read a worked step, flip back and forth to re-read it,
 * then prove it on a fresh check problem at the end. A miss never dead-ends —
 * the kid can always head back to the lesson or keep practising.
 */
export function TeachView({
  lesson,
  onComplete,
}: {
  lesson: Lesson;
  onComplete: (correct: boolean) => void;
}) {
  const total = lesson.steps.length;
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [verdict, setVerdict] = useState<Verdict>("idle");
  /** Bumped on every miss so the nudge animation replays on the same step. */
  const [nudge, setNudge] = useState(0);

  const step = lesson.steps[index];
  const isLast = index === total - 1;

  /** Move a step, dropping any stale answer or verdict from the old step. */
  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(total - 1, next));
    if (clamped === index) return;
    setIndex(clamped);
    setInput("");
    setVerdict("idle");
  };

  const submit = () => {
    if (grade(lesson.checkProblem, input)) {
      setVerdict("correct");
      return;
    }
    setVerdict("wrong");
    setNudge((n) => n + 1);
  };

  return (
    <PageFade>
      <DuoCard
        title={lesson.title}
        eyebrow="Let's learn it"
        subtitle={lesson.problemText}
        icon={
          <Character
            pose={verdict === "correct" ? "cheer" : verdict === "wrong" ? "think" : "happy"}
            size={72}
            label={
              verdict === "correct"
                ? "Mascot cheering for your right answer"
                : verdict === "wrong"
                  ? "Mascot thinking it through with you"
                  : "Mascot ready to walk you through it"
            }
          />
        }
        tone="plain"
      >
        {/* Where am I? Visually stated and announced by the bar itself. */}
        <div>
          <p className="font-display text-kid-sm font-semibold text-muted" aria-hidden>
            Step {index + 1} of {total}
          </p>
          <ProgressBar
            value={index + 1}
            max={total}
            label={`Step ${index + 1} of ${total}`}
            className="mt-1.5"
          />
        </div>

        {/* A persistent live region: swapping its contents per step is what
            screen readers announce. `key` on the inner block replays the
            stagger entrance for each step without tearing down the region. */}
        <section
          aria-live="polite"
          aria-labelledby="teach-step-title"
          className="mt-5"
        >
          <div key={index} className="mt-stagger">
            <h3
              id="teach-step-title"
              className="font-display text-kid-xl font-semibold leading-tight text-ink"
            >
              {step.title}
            </h3>
            <p className="mt-4 text-kid-lg leading-relaxed text-ink">{step.body}</p>
          </div>
          {step.visual ? (
            /* Its own entrance: a bare fade (no transform, no pop), so the
               picture can never shift the layout around it. */
            <VisualModelView model={step.visual} className="mt-2 mt-stagger-fade" />
          ) : null}
        </section>

        {isLast ? (
          <div className="mt-5 rounded-3xl border-2 border-line bg-cream p-4">
            {verdict === "correct" ? (
              <div className="flex flex-col gap-3">
                <Celebration label="Yes! You nailed it! 🎉" />
                <ChunkyButton onClick={() => onComplete(true)} size="lg" fullWidth shine>
                  Keep going! →
                </ChunkyButton>
              </div>
            ) : (
              <>
                <p className="font-display text-kid-lg font-semibold leading-snug text-ink">
                  {lesson.checkProblem.text}
                </p>
                <label
                  htmlFor="teach-answer"
                  className="mt-3 block font-display text-kid-lg font-semibold text-ink"
                >
                  Your turn! ✏️
                </label>
                <input
                  id="teach-answer"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setVerdict("idle");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  inputMode={ANSWER_INPUT_MODE}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  enterKeyHint="go"
                  placeholder="Type your answer…"
                  className="touch-target mt-2 w-full rounded-2xl border-2 border-line bg-white px-5 py-3 text-kid-2xl font-extrabold text-ink outline-none focus:border-primary"
                />
                <div className="mt-2 flex gap-2" role="group" aria-label="Fraction keypad">
                  {ANSWER_KEYPAD_CHARS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      aria-label={ch === "/" ? "fraction bar" : `key ${ch}`}
                      onClick={() => {
                        setInput((v) => appendKeypadChar(v, ch));
                        setVerdict("idle");
                      }}
                      className="touch-target mt-focus flex-1 rounded-2xl border-2 border-line bg-white text-kid-2xl font-extrabold text-ink"
                    >
                      {ch}
                    </button>
                  ))}
                </div>
                {verdict === "wrong" ? (
                  /* The wiggle lives on the banner, not the field: it replays
                     on every miss without stealing focus from the input. */
                  <div key={nudge} className="mt-nudge">
                    <Alert tone="warn" className="mt-3">
                      Good try — that&apos;s a tricky one. Take another look at the steps, then try
                      again. You&apos;ve got this. 💪
                    </Alert>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <ChunkyButton onClick={submit} size="lg" fullWidth shine className="flex-1">
                    {verdict === "wrong" ? "Try again 🔁" : "Check it! ✅"}
                  </ChunkyButton>
                  {verdict === "wrong" ? (
                    <ChunkyButton
                      onClick={() => onComplete(false)}
                      variant="secondary"
                      size="lg"
                      fullWidth
                      className="flex-1"
                    >
                      I&apos;ll keep practising
                    </ChunkyButton>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Step controls — always leave a way back to re-read. */}
        <div className="mt-6 flex gap-3">
          <ChunkyButton
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            variant="secondary"
            size="lg"
            fullWidth
            className="flex-1 disabled:opacity-40"
          >
            ← Back
          </ChunkyButton>
          {!isLast ? (
            <ChunkyButton
              onClick={() => goTo(index + 1)}
              size="lg"
              fullWidth
              className="flex-1"
            >
              Next →
            </ChunkyButton>
          ) : null}
        </div>
      </DuoCard>
    </PageFade>
  );
}
