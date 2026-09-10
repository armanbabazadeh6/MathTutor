"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ListSkeleton, PageFade } from "@/components/effects";
import { ChunkyButton, EmptyState } from "@/components/duo";
import {
  QUEST_ASSIGNMENT_PREFIX,
  getDailyQuest,
  isQuestAssignment,
  loadAssignment,
  recordResult,
  saveLastResult,
  saveNewBadges,
} from "@/lib/session";
import type { AssignmentState } from "@/lib/session";
import { ProblemPlayer } from "@/components/student/ProblemPlayer";
import { StudentNav } from "@/components/student/StudentNav";

export default function PracticePage() {
  const router = useRouter();
  const [assignment, setAssignment] = useState<AssignmentState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let stored: AssignmentState | null = null;
    try {
      stored = loadAssignment();
    } catch {
      // A broken read means the same thing as no practice. Fall through to the
      // empty state so the kid never sits on a loading screen.
      stored = null;
    }
    setAssignment(stored);
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <main className="mt-shell mt-shell-nav flex min-h-screen flex-col justify-between gap-5 pt-6">
        <ListSkeleton rows={3} label="Getting your practice ready" />
        <StudentNav />
      </main>
    );
  }

  if (!assignment) {
    return (
      <main className="mt-shell mt-shell-nav flex min-h-screen flex-col justify-between gap-5 pt-6">
        <PageFade>
          <EmptyState
            title="No practice yet"
            body="Pick a topic first and we'll line up your problems."
            pose="think"
            action={
              <ChunkyButton size="lg" onClick={() => router.push("/")}>
                Back to Today ☀️
              </ChunkyButton>
            }
          />
        </PageFade>
        <StudentNav />
      </main>
    );
  }

  return (
    <main
      className="mt-shell flex h-screen flex-col gap-1 overflow-y-auto pt-4"
      /* 100dvh keeps the shell the real visible height on mobile; the plain
         h-screen above is the fallback where dvh is unsupported. */
      style={{ height: "100dvh" }}
    >
      <ProblemPlayer
        assignment={assignment}
        onComplete={(result) => {
          saveLastResult(result);
          // Quest assignments consume the fixed daily quest: a full solve
          // pays the quest bonus + streak, anything else (partial quest or
          // free-pick extra practice) saves progress without moving the streak.
          if (isQuestAssignment(assignment)) {
            let quest = null;
            try {
              quest = getDailyQuest();
            } catch {
              quest = null;
            }
            const matches = quest !== null && assignment.id === `${QUEST_ASSIGNMENT_PREFIX}${quest.id}`;
            const fullSolve = matches && result.solved === result.total && result.total > 0;
            saveNewBadges(
              recordResult(result, undefined, fullSolve ? { quest } : { countStreak: false }).newBadges,
            );
          } else {
            saveNewBadges(recordResult(result, undefined, { countStreak: false }).newBadges);
          }
          router.push("/practice/results");
        }}
      />
      <StudentNav />
    </main>
  );
}
