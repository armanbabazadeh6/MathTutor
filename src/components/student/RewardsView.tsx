"use client";

import { ConfettiBurst, CountUp, PageFade, ProgressRing } from "@/components/effects";
import { BackButton } from "@/components/student/BackButton";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { BADGES } from "@/lib/session";
import type { ProgressState } from "@/lib/session";
import { listRedeemable } from "@/lib/rewards/goals";
import { canRedeem } from "@/lib/rewards/redemption";
import type { PointsState, Redemption, Reward } from "@/lib/rewards/types";

export type RedemptionStatus = "locked" | "ready" | "requested";

export interface RewardGoal {
  id: string;
  name: string;
  emoji: string;
  needXp: number;
  blurb: string;
}

/** Star milestones. Pure display data — points still come from session XP. */
export const REWARD_GOALS: RewardGoal[] = [
  { id: "gold-star", name: "Gold Star", emoji: "⭐", needXp: 100, blurb: "Win 100 stars." },
  { id: "trophy-cup", name: "Trophy Cup", emoji: "🏆", needXp: 250, blurb: "Win 250 stars." },
  { id: "math-crown", name: "Math Crown", emoji: "👑", needXp: 500, blurb: "Win 500 stars." },
];

const STATUS_CHIP: Record<RedemptionStatus, { text: string; className: string }> = {
  locked: { text: "Locked 🔒", className: "border-line bg-cream text-muted" },
  ready: { text: "Ready! 🎉", className: "border-primarydark bg-mint text-ink" },
  requested: { text: "Asked ✅", className: "border-skydark bg-sky/40 text-ink" },
};

function statusFor(goal: RewardGoal, xp: number, redemptions: Record<string, RedemptionStatus>): RedemptionStatus {
  if (redemptions[goal.id] === "requested") return "requested";
  return xp >= goal.needXp ? "ready" : "locked";
}

/** Latest terminal state for a reward, used as a one-line note under the title. */
function lastNote(rewardId: string, ledger: Redemption[]): string | null {
  const rows = ledger.filter((r) => r.rewardId === rewardId);
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  if (last.status === "denied") return "Last ask: not this time.";
  if (last.status === "fulfilled") return "Last ask: you got it! 🎉";
  return null;
}

/**
 * One parent-catalog prize. Open requests (requested/approved) hold the
 * points, so the ask button stays disabled until a grown-up decides —
 * a kid can never request twice. Denied/fulfilled/none fall back to the
 * canonical eligibility check (balance + streak rule).
 */
function PrizeRow({
  reward,
  points,
  ledger,
  onRequest,
}: {
  reward: Reward;
  points?: PointsState;
  ledger: Redemption[];
  onRequest?: (rewardId: string) => void;
}) {
  const open = ledger.find(
    (r) => r.rewardId === reward.id && (r.status === "requested" || r.status === "approved"),
  );
  const note = lastNote(reward.id, ledger);
  const check = points ? canRedeem(points, reward) : { ok: false as const, reason: "loading points" };
  const lockedReason =
    !check.ok && check.reason === "insufficient balance" && points
      ? `Need ${reward.pointCost - points.balance} more points.`
      : !check.ok && check.reason === "streak requirement not met" && reward.minStreakDays !== undefined
        ? `Needs a 🔥 ${reward.minStreakDays}-day streak.`
        : null;
  const chip = open
    ? open.status === "approved"
      ? { text: "Approved 🎉", className: "border-primarydark bg-mint text-ink" }
      : { text: "Asked ✅", className: "border-skydark bg-sky/40 text-ink" }
    : check.ok
      ? { text: "Ready! 🎉", className: "border-primarydark bg-mint text-ink" }
      : { text: "Locked 🔒", className: "border-line bg-cream text-muted" };
  return (
    <li
      className="flex items-center gap-4 rounded-3xl border-2 border-line bg-cream p-4"
      style={{ boxShadow: "0 3px 0 var(--chunky-shadow)" }}
    >
      <span
        aria-hidden
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-4xl"
      >
        {reward.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-display text-kid-lg font-semibold">{reward.title}</p>
        <p className="text-kid-sm font-bold">
          ⭐ {reward.pointCost} pts
          {reward.minStreakDays ? ` · 🔥 ${reward.minStreakDays}-day streak` : null}
        </p>
        {note ? <p className="text-kid-sm font-semibold text-muted">{note}</p> : null}
        {lockedReason ? <p className="text-kid-sm font-semibold text-muted">{lockedReason}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex min-h-[44px] items-center rounded-pill border-2 px-4 py-1 text-kid-sm font-extrabold ${chip.className}`}
          >
            {chip.text}
          </span>
          {!open && check.ok && onRequest ? (
            <ChunkyButton type="button" size="sm" onClick={() => onRequest(reward.id)}>
              Ask a grown-up 🙋
            </ChunkyButton>
          ) : open ? (
            <span className="text-kid-sm font-semibold text-muted">Waiting on a grown-up.</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * Presentational rewards view. Star goals read session XP; the grown-up
 * prizes catalog reads the shared points wallet + parent catalog store.
 *
 * `onRequest(rewardId)` fires a kid request against the parent catalog
 * store (which holds the cost). `requestError` surfaces the store's
 * rejection (too few points, streak rule, already asked).
 */
export function RewardsView({
  progress,
  redemptions = {},
  onRequest,
  catalog = [],
  points,
  ledger = [],
  requestError = null,
}: {
  progress: ProgressState;
  redemptions?: Record<string, RedemptionStatus>;
  onRequest?: (goalId: string) => void;
  catalog?: Reward[];
  points?: PointsState;
  ledger?: Redemption[];
  requestError?: string | null;
}) {
  const next = REWARD_GOALS.find((g) => progress.xp < g.needXp) ?? null;
  const cheered = REWARD_GOALS.some((g) => statusFor(g, progress.xp, redemptions) === "ready");
  const prizes = listRedeemable(catalog);
  const balance = points?.balance ?? 0;

  return (
    <PageFade>
      <div className="flex flex-col gap-5">
        <BackButton href="/" label="Back" />

        <header
          className="flex flex-col items-center gap-2 rounded-3xl border-2 border-line bg-card p-6 text-center"
          style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
        >
          <Character
            pose={cheered ? "cheer" : "happy"}
            size={110}
            label={cheered ? "Mascot cheering — a prize is ready" : "Mascot showing your prizes"}
          />
          <h1 className="font-display text-kid-3xl font-semibold tracking-tight">My prizes 🏅</h1>
          <p className="font-display text-kid-2xl font-semibold">
            <CountUp value={progress.xp} suffix=" stars!" />
          </p>
          <p className="text-kid-base font-semibold text-muted">
            {next
              ? `${next.needXp - progress.xp} stars to win ${next.emoji} ${next.name}.`
              : "You won every prize! Wow!"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <StreakFlame count={progress.streakCount} />
            <GemCounter gems={balance} label={`${balance} points to spend`} />
          </div>
        </header>

        {cheered ? <ConfettiBurst label="A prize is ready! Show a grown-up!" /> : null}

        <DuoCard title="Prize path" subtitle="Win stars. Unlock prizes.">
          <ul className="mt-stagger flex flex-col gap-3">
            {REWARD_GOALS.map((g) => {
              const status = statusFor(g, progress.xp, redemptions);
              const chip = STATUS_CHIP[status];
              return (
                <li
                  key={g.id}
                  className="flex items-center gap-4 rounded-3xl border-2 border-line bg-cream p-4"
                >
                  <ProgressRing value={Math.min(progress.xp, g.needXp)} max={g.needXp} size={76} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-display text-kid-lg font-semibold">
                      <span aria-hidden>{g.emoji} </span>
                      {g.name}
                    </p>
                    <p className="text-kid-sm font-semibold text-muted">{g.blurb}</p>
                    <p className="text-kid-sm font-bold">
                      {Math.min(progress.xp, g.needXp)} of {g.needXp} stars
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex min-h-[44px] items-center rounded-pill border-2 px-4 py-1 text-kid-sm font-extrabold ${chip.className}`}
                      >
                        {chip.text}
                      </span>
                      {status === "ready" && onRequest ? (
                        <ChunkyButton type="button" size="sm" onClick={() => onRequest(g.id)}>
                          Ask a grown-up 🙋
                        </ChunkyButton>
                      ) : status === "ready" ? (
                        <span className="text-kid-sm font-semibold text-muted">
                          Show this screen to a grown-up.
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </DuoCard>

        <DuoCard title="Grown-up prizes" subtitle={`You have ⭐ ${balance} points. Ask for a prize!`}>
          {requestError ? (
            <p role="alert" className="mb-3 rounded-2xl border-2 border-coraldark bg-cream p-3 text-kid-sm font-bold text-coral">
              {requestError}
            </p>
          ) : null}
          {prizes.length === 0 ? (
            <p className="text-kid-base font-semibold text-muted">
              No prizes yet — ask a grown-up to set one up. 🎁
            </p>
          ) : (
            <ul className="mt-stagger flex flex-col gap-3">
              {prizes.map((reward) => (
                <PrizeRow
                  key={reward.id}
                  reward={reward}
                  points={points}
                  ledger={ledger}
                  onRequest={onRequest}
                />
              ))}
            </ul>
          )}
        </DuoCard>

        <DuoCard title="My badges" subtitle="Won on this device">
            <ul className="mt-stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BADGES.map((b) => {
              const earned = progress.badges.includes(b.id);
              return (
                <li
                  key={b.id}
                  className="duo-press flex items-center gap-3 rounded-3xl border-2 p-4"
                  style={{
                    background: earned ? "var(--color-mint)" : "var(--color-cream)",
                    borderColor: earned ? "var(--color-primary-dark)" : "var(--color-line)",
                    boxShadow: "0 3px 0 var(--chunky-shadow)",
                    opacity: earned ? 1 : 0.75,
                  }}
                >
                  <span
                    aria-hidden
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-4xl ${earned ? "animate-duo-pop" : ""}`}
                  >
                    {earned ? b.emoji : "🔒"}
                  </span>
                  <span>
                    <span className="block font-display text-kid-base font-semibold">{b.name}</span>
                    <span className="block text-kid-xs font-semibold text-muted">{b.description}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </DuoCard>
      </div>
    </PageFade>
  );
}
