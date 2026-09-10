"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { loadUnfinishedRun } from "@/lib/session";

/**
 * Resume row for the Today screen: one honest count of what is left.
 *
 * Reads the queued assignment plus the resume record the player writes
 * (`loadPracticeProgress`), so the number is the queued problems MINUS the
 * answered ones — never the full length. Works for a part-done quest and for
 * part-done extra practice alike: this component never drops the quest case,
 * it is the caller that decides not to place a second card for the run the
 * quest hero already owns. A run handed over to the results screen has no
 * progress record left, so it does not show here at all.
 */
export function QuickStart() {
  const router = useRouter();
  const [left, setLeft] = useState(0);

  useEffect(() => {
    try {
      setLeft(loadUnfinishedRun()?.remaining ?? 0);
    } catch {
      setLeft(0);
    }
  }, []);

  if (left === 0) return null;

  return (
    <div className="mt-card flex items-center gap-3 py-3 pl-4 pr-3">
      <span aria-hidden className="text-3xl leading-none">
        ⏳
      </span>
      <p className="min-w-0 flex-1 text-kid-sm font-bold text-ink-soft">
        You still have {left} {left === 1 ? "problem" : "problems"} left.
      </p>
      <ChunkyButton size="sm" variant="secondary" onClick={() => router.push("/practice")}>
        Keep going
      </ChunkyButton>
    </div>
  );
}
