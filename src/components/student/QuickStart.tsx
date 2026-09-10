"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { isQuestAssignment, loadAssignment, loadLastResult } from "@/lib/session";

/**
 * Compact resume row for the Today screen.
 *
 * The daily quest owns the hero call to action. When the queued assignment is
 * that quest (or is already finished), the quest card already offers
 * "Keep going" / "Play it again" — so this row renders nothing rather than
 * becoming a second, competing nudge. Only an unfinished extra-practice run
 * shows here: one tap and the kid is back in /practice where they stopped.
 */
export function QuickStart() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    try {
      const queued = loadAssignment();
      if (!queued || queued.problems.length === 0 || isQuestAssignment(queued)) {
        setCount(0);
        return;
      }
      const finished = loadLastResult();
      setCount(finished && finished.assignmentId === queued.id ? 0 : queued.problems.length);
    } catch {
      setCount(0);
    }
  }, []);

  if (count === 0) return null;

  return (
    <div className="mt-card flex items-center gap-3 py-3 pl-4 pr-3">
      <span aria-hidden className="text-3xl leading-none">
        ⏳
      </span>
      <p className="min-w-0 flex-1 text-kid-sm font-bold text-ink-soft">
        You still have {count} problems saved.
      </p>
      <ChunkyButton size="sm" variant="secondary" onClick={() => router.push("/practice")}>
        Keep going
      </ChunkyButton>
    </div>
  );
}
