"use client";

import { useState } from "react";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { grade } from "@/lib/math/grading";
import type { Lesson } from "@/lib/teach/lessons";

export function TeachView({
  lesson,
  onComplete,
}: {
  lesson: Lesson;
  onComplete: (correct: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  const total = lesson.steps.length;
  const current = lesson.steps[index];
  const isLast = index === total - 1;

  const check = () => {
    const ok = grade(lesson.checkProblem, input);
    setResult(ok);
  };

  return (
    <PageFade>
      <DuoCard
        title={lesson.title}
        subtitle={`Step ${index + 1} of ${total}: ${current.title}`}
        icon={
          <Character
            pose={result === true ? "cheer" : result === false ? "think" : "happy"}
            size={72}
            label={result === true ? "Mascot cheering" : "Mascot helping you learn"}
          />
        }
        tone="plain"
      >
        {/* Progress dots */}
        <div className="flex gap-2" role="tablist" aria-label="Lesson progress">
          {lesson.steps.map((s, i) => (
            <span
              key={i}
              className={`h-3 flex-1 rounded-pill ${i <= index ? "bg-primary" : "bg-line"}`}
              aria-label={`Step ${i + 1}: ${s.title}`}
            />
          ))}
        </div>

        {/* Visual scaffold */}
        {current.visual === "break-apart" ? (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Break-apart numbers">
            {current.workedNumbers.map((n, i) => (
              <span
                key={i}
                className="animate-duo-pop rounded-pill border-2 border-accent bg-sunny px-5 py-2 text-xl font-extrabold text-ink"
              >
                {Number.isInteger(n) ? n.toLocaleString("en-US") : String(n)}
              </span>
            ))}
          </div>
        ) : current.visual === "number-line" ? (
          <div
            className="mt-4 rounded-3xl border-2 border-line bg-cream px-4 py-3"
            aria-label="Number line"
          >
            <div className="text-sm font-bold text-muted">NUMBER LINE</div>
            <div className="mt-1 flex items-center gap-2 overflow-x-auto text-xl font-extrabold">
              {[...current.workedNumbers]
                .sort((a, b) => a - b)
                .map((n, i, arr) => (
                  <span key={i} className="flex items-center gap-2">
                    <span className="rounded-pill bg-sky px-4 py-1 text-white">{String(n)}</span>
                    {i < arr.length - 1 ? <span aria-hidden="true">→</span> : null}
                  </span>
                ))}
            </div>
          </div>
        ) : null}

        <p className="mt-4 text-kid-lg leading-relaxed text-ink">{current.body}</p>

        {/* Final Try-it step: answer input graded via existing grading fn */}
        {isLast ? (
          <div className="mt-5 flex flex-col gap-3 rounded-3xl border-2 border-line bg-cream p-4">
            <label htmlFor="teach-answer" className="font-display text-kid-lg font-semibold">
              Your turn! ✏️
            </label>
            <input
              id="teach-answer"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setResult(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") check();
              }}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Type your answer…"
              className="min-h-[64px] w-full rounded-2xl border-2 border-line bg-white px-5 text-2xl font-bold text-ink outline-none focus:border-primary"
            />
            {result === true ? (
              <p
                className="animate-duo-pop rounded-2xl border-2 border-primarydark bg-mint px-4 py-3 text-xl font-bold"
                role="status"
              >
                ✅ Correct — nice work!
              </p>
            ) : result === false ? (
              <p className="rounded-2xl border-2 border-coraldark bg-coral px-4 py-3 text-xl font-bold text-white" role="status">
                Not quite. Try again. Or tap Finish to keep going.
              </p>
            ) : null}
            <div className="flex gap-3">
              <ChunkyButton onClick={check} className="min-h-[56px] flex-1 text-xl">
                Check
              </ChunkyButton>
              {result !== null ? (
                <ChunkyButton
                  onClick={() => onComplete(result)}
                  variant="secondary"
                  className="min-h-[56px] flex-1 text-xl"
                >
                  {result ? "Done" : "Finish"}
                </ChunkyButton>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Stepper: large touch targets */}
        <div className="mt-6 flex gap-3">
          <ChunkyButton
            onClick={() => {
              setIndex((i) => Math.max(0, i - 1));
              setResult(null);
            }}
            disabled={index === 0}
            variant="secondary"
            className="min-h-[56px] flex-1 text-xl disabled:opacity-40"
          >
            ← Back
          </ChunkyButton>
          {!isLast ? (
            <ChunkyButton
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
              className="min-h-[56px] flex-1 text-xl"
            >
              Next →
            </ChunkyButton>
          ) : result === null ? (
            <ChunkyButton
              onClick={() => onComplete(false)}
              variant="secondary"
              className="min-h-[56px] flex-1 text-xl"
            >
              Skip
            </ChunkyButton>
          ) : null}
        </div>
      </DuoCard>
    </PageFade>
  );
}
