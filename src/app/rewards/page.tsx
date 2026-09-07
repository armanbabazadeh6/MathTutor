"use client";

import { useEffect, useState } from "react";
import { StudentNav } from "@/components/student/StudentNav";
import { RewardsView } from "@/components/student/RewardsView";
import { useRewardStore } from "@/components/admin/rewardStore";
import { loadPointsState, loadProgress } from "@/lib/session";
import type { ProgressState } from "@/lib/session";
import type { PointsState } from "@/lib/rewards/types";

export default function RewardsPage() {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [points, setPoints] = useState<PointsState | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { state: rewards, actions } = useRewardStore();

  useEffect(() => {
    setProgress(loadProgress());
    setPoints(loadPointsState());
  }, []);

  function handleRequest(rewardId: string): void {
    const result = actions.requestRedemption(rewardId);
    setRequestError(result.ok ? null : (result.error ?? "Could not ask for that prize."));
    setPoints(loadPointsState());
  }

  if (!progress || !points) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        <p className="text-kid-lg font-bold text-muted" role="status">
          Getting your prizes… ⭐
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-5 pb-8 pt-6 md:max-w-4xl">
      <RewardsView
        progress={progress}
        catalog={rewards.catalog}
        points={points}
        ledger={rewards.redemptions}
        onRequest={handleRequest}
        requestError={requestError}
      />
      <StudentNav />
    </main>
  );
}
