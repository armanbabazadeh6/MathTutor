"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
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
    setAssignment(loadAssignment());
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        <p className="text-kid-lg font-bold text-muted" role="status">
          Getting your practice ready… ⭐
        </p>
      </main>
    );
  }

  if (!assignment) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-8">
        <PageFade>
          <DuoCard
            title="No practice yet"
            subtitle="Pick a topic first!"
            icon={<Character pose="think" size={72} label="Mascot waiting for a topic" />}
          >
            <ChunkyButton size="lg" fullWidth onClick={() => router.push("/")}>
              Back to Today ☀️
            </ChunkyButton>
          </DuoCard>
        </PageFade>
        <StudentNav />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-5 pb-8 pt-6 md:max-w-4xl">
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
