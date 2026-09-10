"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ListSkeleton, PageFade } from "@/components/effects";
import { ChunkyButton, EmptyState } from "@/components/duo";
import { ResultsView } from "@/components/student/ResultsView";
import { StudentNav } from "@/components/student/StudentNav";
import { loadLastResult, loadNewBadges, loadProgress } from "@/lib/session";
import type { PracticeResult, ProgressState } from "@/lib/session";

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newBadges, setNewBadges] = useState<string[]>([]);

  useEffect(() => {
    try {
      setResult(loadLastResult());
      setProgress(loadProgress());
      setNewBadges(loadNewBadges());
    } catch {
      // Broken read: nothing to celebrate yet, so fall through to the empty
      // state instead of leaving the kid on a loading screen.
    }
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <main className="mt-shell mt-shell-nav flex min-h-screen flex-col justify-between gap-5 pt-6">
        <ListSkeleton rows={3} label="Counting your stars" />
        <StudentNav />
      </main>
    );
  }

  if (!result || !progress) {
    return (
      <main className="mt-shell mt-shell-nav flex min-h-screen flex-col justify-between gap-5 pt-6">
        <PageFade>
          <EmptyState
            title="No stars yet"
            body="Finish a practice and your stars land right here."
            pose="happy"
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
    <main className="mt-shell mt-shell-nav flex min-h-screen flex-col justify-between gap-5 pt-6">
      <ResultsView result={result} progress={progress} newBadges={newBadges} />
      <StudentNav />
    </main>
  );
}
