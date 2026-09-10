"use client";

import { useRouter } from "next/navigation";
import { ConfettiBurst, CountUp, PageFade } from "@/components/effects";
import { BackButton } from "@/components/student/BackButton";
import { Alert, EmptyState } from "@/components/duo";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { ProgressBar } from "@/components/duo/ProgressBar";
import { BADGES, badgeById } from "@/lib/session";
import type { ProgressState } from "@/lib/session";
import { listRedeemable } from "@/lib/rewards/goals";
import { canRedeem } from "@/lib/rewards/redemption";
import type { PointsState, Redemption, Reward } from "@/lib/rewards/types";

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

type GoalStatus = "locked" | "ready" | "requested";

/**
 * Chip skins. Each is a purpose-built soft tint paired with its matching
 * `*-ink` text shade, so every chip clears AA on its own fill. (The old
 * `bg-sky/40` + `text-ink` chips did not.)
 */
const CHIP = {
  ready: "border-primarydark bg-mint text-primaryink",
  asked: "border-skydark bg-sky-soft text-skyink",
  goal: "border-sunnydark bg-sunny-soft text-sunnyink",
} as const;

const CHIP_BASE =
  "inline-flex min-h-[44px] items-center rounded-pill border-2 px-4 py-1 text-kid-sm font-extrabold";

function statusFor(
  goal: RewardGoal,
  xp: number,
  redemptions: Record<string, GoalStatus>,
): GoalStatus {
  if (redemptions[goal.id] === "requested") return "requested";
  return xp >= goal.needXp ? "ready" : "locked";
}

/** Star-goal chip: a goal that is not ready yet says how far away it is — never a bare "Locked". */
function goalChip(status: GoalStatus, starsToGo: number): { text: string; className: string } {
  if (status === "requested") return { text: "Asked ✅", className: CHIP.asked };
  if (status === "ready") return { text: "Ready! 🎉", className: CHIP.ready };
  return { text: `⭐ ${starsToGo} more star${starsToGo === 1 ? "" : "s"}`, className: CHIP.goal };
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
 * Prize chip + eligibility. A prize a kid cannot ask for yet always explains
 * itself in plain words — the points still owed, or the streak rule — so the
 * chip doubles as the reason and there is never a bare "Locked".
 */
function prizeState(
  reward: Reward,
  points: PointsState | undefined,
  open: Redemption | undefined,
): { text: string; className: string; canAsk: boolean } {
  if (open?.status === "approved") {
    return { text: "Approved 🎉", className: CHIP.ready, canAsk: false };
  }
  if (open) return { text: "Asked ✅", className: CHIP.asked, canAsk: false };
  if (!points) return { text: "Checking your points…", className: CHIP.asked, canAsk: false };
  const check = canRedeem(points, reward);
  if (check.ok) return { text: "Ready! 🎉", className: CHIP.ready, canAsk: true };
  const short = reward.pointCost - points.balance;
  if (check.reason === "insufficient balance" && short > 0) {
    return {
      text: `🎯 ${short} more point${short === 1 ? "" : "s"}`,
      className: CHIP.goal,
      canAsk: false,
    };
  }
  if (check.reason === "streak requirement not met" && reward.minStreakDays !== undefined) {
    return {
      text: `🔥 ${reward.minStreakDays}-day streak first`,
      className: CHIP.goal,
      canAsk: false,
    };
  }
  return { text: "Ask a grown-up 💬", className: CHIP.asked, canAsk: false };
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
  const state = prizeState(reward, points, open);
  return (
    <li
      className="flex items-start gap-4 rounded-3xl border-2 border-line bg-cream p-4"
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
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`${CHIP_BASE} ${state.className}`}>{state.text}</span>
          {open?.status === "approved" ? (
            <span className="text-kid-sm font-semibold text-muted">
              A grown-up said yes — nearly yours! 🎉
            </span>
          ) : open ? (
            <ChunkyButton type="button" size="sm" disabled>
              Waiting on a grown-up…
            </ChunkyButton>
          ) : state.canAsk && onRequest ? (
            <ChunkyButton type="button" size="sm" onClick={() => onRequest(reward.id)}>
              Ask a grown-up 🙋
            </ChunkyButton>
          ) : state.canAsk ? (
            <span className="text-kid-sm font-semibold text-muted">
              Show this screen to a grown-up.
            </span>
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
 *
 * `newBadges` lists badge ids earned in the last session, so the badge grid
 * can celebrate them; everything else reads as a goal to work toward.
 */
export function RewardsView({
  progress,
  redemptions = {},
  onRequest,
  catalog = [],
  points,
  ledger = [],
  requestError = null,
  newBadges = [],
}: {
  progress: ProgressState;
  redemptions?: Record<string, GoalStatus>;
  onRequest?: (goalId: string) => void;
  catalog?: Reward[];
  points?: PointsState;
  ledger?: Redemption[];
  requestError?: string | null;
  newBadges?: string[];
}) {
  const router = useRouter();
  const next = REWARD_GOALS.find((g) => progress.xp < g.needXp) ?? null;
  const cheered = REWARD_GOALS.some((g) => statusFor(g, progress.xp, redemptions) === "ready");
  const prizes = listRedeemable(catalog);
  const balance = points?.balance ?? 0;
  const earnedCount = BADGES.filter((b) => progress.badges.includes(b.id)).length;
  const freshBadges = newBadges.filter((id) => progress.badges.includes(id));
  const freshNames = freshBadges
    .map((id) => badgeById(id)?.name)
    .filter((name): name is string => Boolean(name));
  const celebrate =
    freshNames.length > 0
      ? `New badge: ${freshNames.join(", ")}! 🏅`
      : cheered
        ? "A prize is ready! Show a grown-up!"
        : null;

  return (
    <PageFade>
      <div className="flex flex-col gap-5">
        <BackButton href="/" label="Back" />

        <header
          className="flex flex-col items-center gap-2 rounded-3xl border-2 border-line bg-card p-6 text-center"
          style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
        >
          <Character
            pose={cheered || freshNames.length > 0 ? "cheer" : "happy"}
            size={110}
            label={
              cheered
                ? "Mascot cheering — a prize is ready"
                : freshNames.length > 0
                  ? "Mascot cheering — you won a new badge"
                  : "Mascot showing your prizes"
            }
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

        {celebrate ? <ConfettiBurst label={celebrate} /> : null}

        <DuoCard title="Prize path" subtitle="Win stars. Unlock prizes.">
          <ul className="mt-stagger flex flex-col gap-3">
            {REWARD_GOALS.map((g) => {
              const status = statusFor(g, progress.xp, redemptions);
              const earned = Math.min(progress.xp, g.needXp);
              const chip = goalChip(status, Math.max(0, g.needXp - progress.xp));
              return (
                <li
                  key={g.id}
                  className="flex items-start gap-4 rounded-3xl border-2 border-line bg-cream p-4"
                >
                  <span
                    aria-hidden
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-4xl"
                  >
                    {g.emoji}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="font-display text-kid-lg font-semibold">{g.name}</p>
                    <p className="text-kid-sm font-semibold text-muted">{g.blurb}</p>
                    <ProgressBar
                      value={earned}
                      max={g.needXp}
                      size="sm"
                      tone={status === "ready" ? "primary" : "sky"}
                      label={`${g.name}: ${earned} of ${g.needXp} stars`}
                    />
                    <p className="text-kid-sm font-bold">
                      {earned} of {g.needXp} stars
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`${CHIP_BASE} ${chip.className}`}>{chip.text}</span>
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
            <Alert tone="error" className="mb-3">
              {requestError}
            </Alert>
          ) : null}
          {prizes.length === 0 ? (
            <EmptyState
              pose="think"
              title="No prizes to pick yet"
              body="Ask a grown-up to add a prize, then win stars to unlock it. 🎁"
              action={
                <ChunkyButton type="button" variant="secondary" size="md" onClick={() => router.push("/")}>
                  Go practise ⭐
                </ChunkyButton>
              }
            />
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

        <DuoCard
          title="My badges"
          subtitle={
            earnedCount > 0
              ? `${earnedCount} of ${BADGES.length} won on this device`
              : "Win badges by practising"
          }
        >
          <ul className="mt-stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BADGES.map((b) => {
              const earned = progress.badges.includes(b.id);
              const fresh = earned && freshBadges.includes(b.id);
              return (
                <li
                  key={b.id}
                  className={`flex items-start gap-3 rounded-3xl border-2 p-4 ${
                    earned ? "border-primarydark bg-mint" : "border-line bg-cream"
                  }`}
                  style={{ boxShadow: "0 3px 0 var(--chunky-shadow)" }}
                >
                  <span
                    aria-hidden
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-card text-4xl ${
                      earned ? "mt-medal" : ""
                    }`}
                  >
                    {b.emoji}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="block font-display text-kid-base font-semibold">{b.name}</span>
                    <span className="block text-kid-xs font-semibold text-muted">{b.description}</span>
                    {earned ? (
                      <span className="inline-flex w-fit items-center rounded-pill border-2 border-primarydark bg-card px-3 py-0.5 text-kid-xs font-extrabold text-primaryink">
                        {fresh ? "Just won! 🎉" : "Won ✅"}
                      </span>
                    ) : (
                      <span className="inline-flex w-fit items-center rounded-pill border-2 border-skydark bg-sky-soft px-3 py-0.5 text-kid-xs font-extrabold text-skyink">
                        Goal 🎯
                      </span>
                    )}
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
