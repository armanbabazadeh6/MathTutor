"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { loadAssignment, recordResult, saveLastResult, saveNewBadges } from "@/lib/session";
import { ProblemPlayer } from "@/components/student/ProblemPlayer";
import { StudentNav } from "@/components/student/StudentNav";
import type { AssignmentState } from "@/lib/session";

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
          saveNewBadges(recordResult(result).newBadges);
          router.push("/practice/results");
        }}
      />
      <StudentNav />
    </main>
  );
}
