"use client";

import { useEffect, useState } from "react";
import { StudentNav } from "@/components/student/StudentNav";
import { RewardsView } from "@/components/student/RewardsView";
import { useRewardStore } from "@/components/admin/rewardStore";
import { ListSkeleton } from "@/components/effects";
import { loadNewBadges, loadPointsState, loadProgress } from "@/lib/session";
import type { ProgressState } from "@/lib/session";
import type { PointsState } from "@/lib/rewards/types";

export default function RewardsPage() {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [points, setPoints] = useState<PointsState | null>(null);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { state: rewards, actions } = useRewardStore();

  useEffect(() => {
    setProgress(loadProgress());
    setPoints(loadPointsState());
    setNewBadges(loadNewBadges());
  }, []);

  function handleRequest(rewardId: string): void {
    const result = actions.requestRedemption(rewardId);
    setRequestError(result.ok ? null : (result.error ?? "Could not ask for that prize."));
    setPoints(loadPointsState());
  }

  if (!progress || !points) {
    return (
      <main className="mt-shell mt-shell-nav flex flex-col gap-5 pt-6">
        <h1 className="font-display text-kid-3xl font-semibold tracking-tight">My prizes 🏅</h1>
        <ListSkeleton rows={3} label="Getting your prizes…" />
        <StudentNav />
      </main>
    );
  }

  return (
    <main className="mt-shell mt-shell-nav flex flex-col gap-5 pt-6">
      <RewardsView
        progress={progress}
        catalog={rewards.catalog}
        points={points}
        ledger={rewards.redemptions}
        onRequest={handleRequest}
        requestError={requestError}
        newBadges={newBadges}
      />
      <StudentNav />
    </main>
  );
}
