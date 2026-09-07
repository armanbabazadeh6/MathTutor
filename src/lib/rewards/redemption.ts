// MathTutor — redemption lifecycle (pure, no I/O).
//
// request: validates balance + streak, HOLDS points (deducts balance
// immediately, lifetime untouched). approve/deny/fulfill transition with
// validation. deny releases the hold (refunds balance). No double-spend:
// every transition checks current status, and spend can only come from
import { REWARDS_DOC_VERSION } from "./types";
import type { PointsState, Redemption, RedemptionStatus, Reward, RewardsDoc } from "./types";

export interface RedemptionRequest {
  /** Client-supplied id; must be unique across doc redemptions. */
  id: string;
  rewardId: string;
  /** Local "YYYY-MM-DD" request date. */
  date: string;
  note?: string;
}

export interface RedemptionResult {
  state: PointsState;
  redemption: Redemption;
}

const TRANSITIONS: Record<RedemptionStatus, RedemptionStatus[]> = {
  requested: ["approved", "denied"],
  approved: ["fulfilled"],
  denied: [],
  fulfilled: [],
};

function canTransition(from: RedemptionStatus, to: RedemptionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Eligibility check without mutating anything. */
export function canRedeem(
  state: PointsState,
  reward: Reward | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!reward) return { ok: false, reason: "unknown reward" };
  if (!reward.active) return { ok: false, reason: "reward inactive" };
  if (reward.example) return { ok: false, reason: "example reward is not redeemable" };
  if (state.balance < reward.pointCost) return { ok: false, reason: "insufficient balance" };
  if (reward.minStreakDays !== undefined && state.streakDays < reward.minStreakDays) {
    return { ok: false, reason: "streak requirement not met" };
  }
  return { ok: true };
}

/**
 * Request a reward: validates eligibility + id uniqueness, holds the
 * cost (balance -= cost), appends a "hold" history entry.
 * Throws on any validation failure — no partial mutation.
 */
export function requestRedemption(
  state: PointsState,
  catalog: Reward[],
  redemptions: Redemption[],
  req: RedemptionRequest,
): RedemptionResult {
  const reward = catalog.find((r) => r.id === req.rewardId);
  const check = canRedeem(state, reward);
  if (!check.ok) throw new Error(`cannot redeem: ${check.reason}`);
  if (redemptions.some((r) => r.id === req.id)) {
    throw new Error(`duplicate redemption id: ${req.id}`);
  }
  const cost = (reward as Reward).pointCost;
  const redemption: Redemption = {
    id: req.id,
    rewardId: req.rewardId,
    pointCost: cost,
    status: "requested",
    requestedAt: req.date,
    ...(req.note !== undefined ? { note: req.note } : {}),
  };
  const nextState: PointsState = {
    ...state,
    balance: state.balance - cost,
    history: [...state.history, { date: req.date, kind: "hold", points: -cost, note: `hold ${req.id}` }],
  };
  return { state: nextState, redemption };
}

/**
 * Approve a requested redemption. Points stay held — no balance change.
 * Throws unless the redemption is currently "requested".
 */
export function approveRedemption(redemptions: Redemption[], id: string, date: string): Redemption[] {
  return setStatus(redemptions, id, "approved", date, "decidedAt");
}

/**
 * Deny a requested redemption and release the hold: refunds the held
 * cost to balance and appends a "refund" history entry.
 * Throws unless the redemption is currently "requested".
 */
export function denyRedemption(
  state: PointsState,
  redemptions: Redemption[],
  id: string,
  date: string,
): { state: PointsState; redemptions: Redemption[] } {
  const current = redemptions.find((r) => r.id === id);
  if (!current) throw new Error(`unknown redemption: ${id}`);
  if (!canTransition(current.status, "denied")) {
    throw new Error(`cannot deny redemption in status ${current.status}`);
  }
  const nextRedemptions = setStatus(redemptions, id, "denied", date, "decidedAt");
  const nextState: PointsState = {
    ...state,
    balance: state.balance + current.pointCost,
    history: [
      ...state.history,
      { date, kind: "refund" as const, points: current.pointCost, note: `refund ${id}` },
    ],
  };
  return { state: nextState, redemptions: nextRedemptions };
}

/**
 * Fulfill an approved redemption (real-world handoff done).
 * No balance change — points were held at request. Throws unless "approved".
 */
export function fulfillRedemption(redemptions: Redemption[], id: string, date: string): Redemption[] {
  return setStatus(redemptions, id, "fulfilled", date, "fulfilledAt");
}

function setStatus(
  redemptions: Redemption[],
  id: string,
  to: RedemptionStatus,
  date: string,
  stampField: "decidedAt" | "fulfilledAt",
): Redemption[] {
  const idx = redemptions.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`unknown redemption: ${id}`);
  const current = redemptions[idx];
  if (!canTransition(current.status, to)) {
    throw new Error(`cannot move redemption ${id} from ${current.status} to ${to}`);
  }
  const next = { ...current, status: to, [stampField]: date };
  return [...redemptions.slice(0, idx), next, ...redemptions.slice(idx + 1)];
}

/** Spendable balance minus holds is already enforced (holds deduct at request). */
export function heldPoints(redemptions: Redemption[]): number {
  return redemptions
    .filter((r) => r.status === "requested" || r.status === "approved")
    .reduce((sum, r) => sum + r.pointCost, 0);
}

// ---------- persistence (plain JSON, versioned) ----------

export function serializeRewards(doc: RewardsDoc): string {
  return JSON.stringify({ ...doc, version: REWARDS_DOC_VERSION });
}

export function parseRewardsDoc(json: string): RewardsDoc {
  const raw = JSON.parse(json) as Partial<RewardsDoc>;
  if (raw.version !== REWARDS_DOC_VERSION) {
    throw new Error(`unsupported rewards doc version: ${String(raw.version)}`);
  }
  if (!raw.state || !Array.isArray(raw.catalog) || !Array.isArray(raw.redemptions)) {
    throw new Error("malformed rewards doc");
  }
  const state: PointsState = {
    balance: Number(raw.state.balance) || 0,
    lifetime: Number(raw.state.lifetime) || 0,
    streakDays: Number(raw.state.streakDays) || 0,
    lastActiveDate: typeof raw.state.lastActiveDate === "string" ? raw.state.lastActiveDate : "",
    history: Array.isArray(raw.state.history) ? raw.state.history : [],
  };
  return { version: REWARDS_DOC_VERSION, state, catalog: raw.catalog, redemptions: raw.redemptions };
}
