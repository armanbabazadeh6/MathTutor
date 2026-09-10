// MathTutor — rewards types (pure, serializable, versioned).
//
// Plain JSON only: no Dates, Maps, or class instances. Persist with
// JSON.stringify / parseRewardsDoc in redemption.ts.

/** Redeemable real-world-linked reward. Parent edits expected. */
export interface Reward {
  id: string;
  title: string;
  description: string;
  /** Points held (deducted) at request time, refunded on deny. */
  pointCost: number;
  /** Minimum streakDays required to request. Undefined = no minimum. */
  minStreakDays?: number;
  icon: string;
  active: boolean;
  /**
   * Soft delete. A reward removed from the catalog keeps its row (and any
   * redemption that points at it) so history stays readable; `active` alone
   * cannot express "deleted" vs "switched off".
   */
  archivedAt?: string;
  /**
   * True for seed examples shipped as configuration placeholders.
   * Example rewards are real catalog entries a parent is expected to
   * edit, replace, or deactivate — never fulfilled as listed.
   */
  example?: boolean;
}

export type PointsEventKind =
  | "first-try"
  | "completion"
  | "level-up"
  | "daily-bonus"
  | "hold"
  | "refund"
  | "grant";

export interface PointsHistoryEntry {
  /** Local "YYYY-MM-DD" active date. */
  date: string;
  kind: PointsEventKind;
  points: number;
  note?: string;
}

export interface PointsState {
  /** Spendable balance (holds already deducted). */
  balance: number;
  /** All-time earned points (never decreases). */
  lifetime: number;
  /** Consecutive active dates. Same-day repeats don't double count. */
  streakDays: number;
  /** Local "YYYY-MM-DD" of last activity, "" when never active. */
  lastActiveDate: string;
  history: PointsHistoryEntry[];
}

export type RedemptionStatus = "requested" | "approved" | "denied" | "fulfilled";

export interface Redemption {
  id: string;
  rewardId: string;
  /** Cost snapshot taken at request time (catalog may change later). */
  pointCost: number;
  status: RedemptionStatus;
  requestedAt: string;
  decidedAt?: string;
  fulfilledAt?: string;
  note?: string;
}

/** Versioned persisted document. Bump REWARDS_DOC_VERSION on shape change. */
export interface RewardsDoc {
  version: number;
  state: PointsState;
  catalog: Reward[];
  redemptions: Redemption[];
}

export const REWARDS_DOC_VERSION = 1;

export function emptyPointsState(): PointsState {
  return { balance: 0, lifetime: 0, streakDays: 0, lastActiveDate: "", history: [] };
}

export function emptyRewardsDoc(catalog: Reward[] = []): RewardsDoc {
  return { version: REWARDS_DOC_VERSION, state: emptyPointsState(), catalog, redemptions: [] };
}
