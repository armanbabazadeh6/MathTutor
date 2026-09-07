"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
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
    setResult(loadLastResult());
    setProgress(loadProgress());
    setNewBadges(loadNewBadges());
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        <p className="text-kid-lg font-bold text-muted" role="status">
          Counting your stars… ⭐
        </p>
      </main>
    );
  }

  if (!result || !progress) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-8">
        <PageFade>
          <DuoCard
            title="No stars yet"
            subtitle="Finish a practice first!"
            icon={<Character pose="happy" size={72} label="Mascot waiting for practice" />}
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
      <ResultsView result={result} progress={progress} newBadges={newBadges} />
      <StudentNav />
    </main>
  );
}
