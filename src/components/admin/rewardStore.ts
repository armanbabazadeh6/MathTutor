// MathTutor admin reward store (points-economy parent controls).
//
// Local, versioned (mathtutor.rewards.v1) catalog + redemptions ledger,
// persisted to localStorage. Kid-side request creation lives here too
// (requestRedemption) so the requested -> approve/deny/fulfill loop resolves
// end-to-end without a student UI dependency.
//
// Types are imported from the canonical read-only module
// src/lib/rewards/types.ts (Reward / Redemption / RedemptionStatus). This
// store keeps no parallel shapes: catalog rows are Reward, ledger rows are
// Redemption, and "pending" means status === "requested".
//
// SUPABASE SWAP (documented, not yet wired):
//   - table `rewards` (id uuid pk, title text, description text,
//     point_cost int > 0, min_streak_days int null, icon text, active bool,
//     is_example bool, created_at timestamptz):
//       load: supabase.from("rewards").select(...) -> catalog
//       create/update/toggle: insert/update on the same table, keeping these
//         action signatures so RewardManager does not change.
//   - table `redemptions` (id uuid pk, reward_id uuid fk -> rewards.id,
//     point_cost int snapshot, status text
//     check in ('requested','approved','denied','fulfilled'),
//     requested_at timestamptz, decided_at timestamptz null,
//     fulfilled_at timestamptz null, note text null):
//       request: insert {status:'requested'}; approve/deny: update status +
//         decided_at where id; fulfill: update status + fulfilled_at.
//   - Realtime (optional): subscribe to redemptions INSERTs and merge the
//     payload into state via setState.
// Until then everything runs locally against the example seed below.
"use client";

import { useSyncExternalStore } from "react";
import { currentProfileId, loadPointsState, savePointsState } from "@/lib/session";
import { profileKey } from "@/lib/profile/store";
import {
  denyRedemption as denyWithRefund,
  requestRedemption as requestWithHold,
} from "@/lib/rewards/redemption";
import type {
  Redemption,
  RedemptionStatus,
  Reward,
} from "@/lib/rewards/types";

export type { Redemption, RedemptionStatus, Reward };

export interface RewardState {
  version: 1;
  catalog: Reward[];
  redemptions: Redemption[];
}

const STORAGE_KEY = "mathtutor.rewards.v1";
export const REWARD_STORE_VERSION = 1 as const;
/**
 * Per-profile redemption ledger suffix. The prize CATALOG stays parent-global
 * (one shared list under STORAGE_KEY); each kid's request/approve/fulfill
 * HISTORY lives under mt.p.<profileId>.redemptions.v1 so siblings never see
 * each other's prizes. The global doc keeps a copy of the last-written
 * ledger as a crude backup; per-profile keys are the source of truth.
 * NOTE: the JSON backup (lib/profile/store.ts BACKUP_SUFFIXES) does not yet
 * cover redemptions.v1 — catalog + ledgers restore only via device storage
 * until that suffix is added to the backup set.
 */
export const REDEMPTIONS_NS = "redemptions.v1";
/** "Pending" for the parent inbox = canonical "requested" status. */
export const PENDING_STATUS: RedemptionStatus = "requested";

/**
 * Reward input ceilings, enforced in validateRewardInput, on every write and
 * again when a stored catalog is loaded — the kid's list can never render a
 * title or cost outside these bounds. The form's maxLength/max attributes are
 * only the first line of defence.
 */
export const MAX_REWARD_TITLE = 60;
/** 20× the shipped example reward (500 pts): far above real saving, far below nonsense. */
export const MAX_REWARD_COST = 10_000;
export const MAX_REWARD_STREAK = 365;

/** Trimmed, never longer than MAX_REWARD_TITLE. */
function clampTitle(raw: string): string {
  return raw.trim().slice(0, MAX_REWARD_TITLE);
}

/** Whole points inside 1..MAX_REWARD_COST. */
function clampCost(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.min(MAX_REWARD_COST, Math.max(1, Math.round(raw)));
}

/** Whole days inside 0..MAX_REWARD_STREAK. */
function clampStreak(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(MAX_REWARD_STREAK, Math.max(0, Math.round(raw)));
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Seed catalog. ONLY used when no stored state exists at all — a parent who
 * deactivates every reward stays at an empty/active-free catalog (never
 * reseeded). The Roblox row is a flagged demo (example: true): a placeholder
 * the parent edits, replaces, or deactivates — never fulfilled as listed.
 */
function seedCatalog(): Reward[] {
  return [
    {
      id: "reward-example-roblox",
      title: "Roblox $10 gift card (example)",
      description: "Example placeholder — set your own real-world reward.",
      pointCost: 500,
      minStreakDays: 7,
      icon: "🎮",
      active: true,
      example: true,
    },
  ];
}

/**
 * Coerce one stored catalog row into the input ceilings. A payload written
 * before the ceilings existed (or in devtools) is clamped here, so the kid's
 * screen can never render a 200-character title or a 999999999999 cost.
 */
function normalizeReward(v: unknown): Reward | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.title !== "string") return null;
  if (typeof r.pointCost !== "number") return null;
  const row: Reward = {
    id: r.id,
    title: clampTitle(r.title) || "Reward",
    description: typeof r.description === "string" ? r.description : "",
    pointCost: clampCost(r.pointCost),
    minStreakDays: clampStreak(typeof r.minStreakDays === "number" ? r.minStreakDays : 0),
    icon: typeof r.icon === "string" ? r.icon : "🎁",
    active: r.active === true,
  };
  if (r.example === true) row.example = true;
  if (typeof r.archivedAt === "string") row.archivedAt = r.archivedAt;
  return row;
}

function isRedemption(v: unknown): v is Redemption {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.rewardId === "string" &&
    typeof r.pointCost === "number" &&
    (r.status === "requested" ||
      r.status === "approved" ||
      r.status === "denied" ||
      r.status === "fulfilled") &&
    typeof r.requestedAt === "string"
  );
}

function activePid(): string | null {
  try {
    return currentProfileId();
  } catch {
    return null;
  }
}
function loadProfileRedemptions(pid: string): Redemption[] | null {
  try {
    const raw = window.localStorage.getItem(profileKey(REDEMPTIONS_NS, pid));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRedemption) : null;
  } catch {
    return null;
  }
}
function saveProfileRedemptions(pid: string, redemptions: Redemption[]): void {
  try {
    window.localStorage.setItem(profileKey(REDEMPTIONS_NS, pid), JSON.stringify(redemptions));
  } catch {
    // Storage full/blocked: manager still works in memory.
  }
}
function withLedger(catalog: Reward[], redemptions: Redemption[]): RewardState {
  return { version: 1, catalog, redemptions };
}
/** Marker set once the pre-profile shared ledger is adopted, so later siblings start empty. */
const REDEMPTIONS_ADOPTED_KEY = "mt.redemptions.legacyAdopted.v1";
function wasLegacyAdopted(): boolean {
  try {
    return window.localStorage.getItem(REDEMPTIONS_ADOPTED_KEY) !== null;
  } catch {
    return true;
  }
}
function profileCount(): number {
  try {
    const raw = window.localStorage.getItem("mt.profiles.v1");
    if (!raw) return 0;
    const doc = JSON.parse(raw) as { profiles?: unknown };
    return Array.isArray(doc.profiles) ? doc.profiles.length : 0;
  } catch {
    return 0;
  }
}
/**
 * First run for a profile with no ledger yet. Adopts the pre-profile shared
 * ledger exactly once (single-kid era, one profile at most); every later
 * sibling starts with an empty ledger so kids never inherit each other.
 */
function adoptOrFresh(globalRedemptions: Redemption[]): Redemption[] {
  if (globalRedemptions.length > 0 && !wasLegacyAdopted() && profileCount() <= 1) {
    try {
      window.localStorage.setItem(REDEMPTIONS_ADOPTED_KEY, "1");
    } catch {
      /* adoption still counts in memory for this run */
    }
    return globalRedemptions;
  }
  return [];
}
function loadInitial(): RewardState {
  if (typeof window === "undefined") {
    return { version: 1, catalog: seedCatalog(), redemptions: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // No stored state: seed the example catalog once.
      return { version: 1, catalog: seedCatalog(), redemptions: [] };
    }
    const parsed = JSON.parse(raw) as Partial<RewardState>;
    // Stored state wins as-is, even with an empty catalog (never reseed).
    if (Array.isArray(parsed.catalog) && Array.isArray(parsed.redemptions)) {
      const catalog = parsed.catalog
        .map(normalizeReward)
        .filter((r): r is Reward => r !== null);
      // Self-heal: a payload written before the ceilings (or by hand) is
      // clamped in memory above; write the clamped rows back so the bad value
      // cannot come back on the next read either.
      if (JSON.stringify(catalog) !== JSON.stringify(parsed.catalog)) {
        try {
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...parsed, catalog, version: 1 }),
          );
        } catch {
          // Storage full/blocked: the in-memory clamp still holds.
        }
      }
      const globalRedemptions = parsed.redemptions.filter(isRedemption);
      const pid = activePid();
      if (!pid) return withLedger(catalog, globalRedemptions);
      const per = loadProfileRedemptions(pid);
      if (per !== null) return withLedger(catalog, per);
      const first = adoptOrFresh(globalRedemptions);
      saveProfileRedemptions(pid, first);
      return withLedger(catalog, first);
    }
  } catch {
    // Corrupt cache: fall through to the seed.
  }
  return { version: 1, catalog: seedCatalog(), redemptions: [] };
}
function persist(s: RewardState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage full/blocked: manager still works in memory.
  }
  const pid = activePid();
  if (pid) saveProfileRedemptions(pid, s.redemptions);
}

let state: RewardState = loadInitial();
/** Profile the in-memory ledger was last synced to; syncProfileLedger keys off this. */
let lastPid: string | null = activePid();
const listeners = new Set<() => void>();

function setState(next: RewardState): void {
  state = next;
  persist(state);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shared-ledger snapshot from the parent-global doc (adoption source). Never throws. */
function loadGlobalRedemptions(): Redemption[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<RewardState> | null;
    return Array.isArray(parsed?.redemptions) ? parsed.redemptions.filter(isRedemption) : [];
  } catch {
    return [];
  }
}
/**
 * Profile switch guard. Module state is a singleton loaded for the profile
 * active at import time; switching kids in /profiles then navigating (no
 * full reload) would otherwise show the previous kid's ledger. Every read
 * and action re-checks the active profile and swaps in that kid's ledger
 * (adopting the shared one on first run), so state follows the switch.
 */
function syncProfileLedger(): void {
  if (typeof window === "undefined") return;
  const pid = activePid();
  if (pid === lastPid) return;
  lastPid = pid;
  if (!pid) return;
  const per = loadProfileRedemptions(pid);
  if (per !== null) {
    state = withLedger(state.catalog, per);
    return;
  }
  const fresh = adoptOrFresh(loadGlobalRedemptions());
  state = withLedger(state.catalog, fresh);
  saveProfileRedemptions(pid, fresh);
}
function getSnapshot(): RewardState {
  syncProfileLedger();
  return state;
}
/** Read access for non-React callers (student request flow, smoke checks). */
export function getRewardState(): RewardState {
  syncProfileLedger();
  return state;
}

export interface RewardInput {
  title: string;
  pointCost: number;
  minStreakDays?: number;
  description?: string;
}

/** Shared validation: non-empty title, positive integer cost, streak >= 0, all within the ceilings. */
export function validateRewardInput(input: RewardInput): string | null {
  const title = input.title.trim();
  if (!title) return "Title is required.";
  if (title.length > MAX_REWARD_TITLE) {
    return `Titles can be at most ${MAX_REWARD_TITLE} characters.`;
  }
  if (!Number.isInteger(input.pointCost) || input.pointCost <= 0) {
    return "Cost must be a positive whole number of points.";
  }
  if (input.pointCost > MAX_REWARD_COST) {
    return `Costs can be at most ${MAX_REWARD_COST.toLocaleString()} points.`;
  }
  const streak = input.minStreakDays ?? 0;
  if (!Number.isInteger(streak) || streak < 0) {
    return "Streak requirement must be 0 or more days.";
  }
  if (streak > MAX_REWARD_STREAK) {
    return `Streak requirements can be at most ${MAX_REWARD_STREAK} days.`;
  }
  return null;
}

/** Catalog title for a ledger row (rewards are deactivated, never deleted). */
export function rewardTitleFor(s: RewardState, r: Redemption): string {
  return s.catalog.find((c) => c.id === r.rewardId)?.title ?? "Removed reward";
}

export const rewardActions = {
  /** Parent creates a catalog row. Returns { ok:false, error } on bad input. */
  createReward(input: RewardInput): { ok: boolean; error?: string; id?: string } {
    syncProfileLedger();
    const error = validateRewardInput(input);
    if (error) return { ok: false, error };
    const item: Reward = {
      id: newId("reward"),
      title: clampTitle(input.title),
      description: input.description?.trim() ?? "",
      pointCost: clampCost(input.pointCost),
      minStreakDays: clampStreak(input.minStreakDays ?? 0),
      icon: "🎁",
      active: true,
    };
    setState({ ...state, catalog: [...state.catalog, item] });
    return { ok: true, id: item.id };
  },

  /** Parent edits title/cost/streak. Same validation as create. */
  updateReward(
    id: string,
    input: RewardInput,
  ): { ok: boolean; error?: string } {
    syncProfileLedger();
    const error = validateRewardInput(input);
    if (error) return { ok: false, error };
    if (!state.catalog.some((r) => r.id === id)) {
      return { ok: false, error: "Reward not found." };
    }
    setState({
      ...state,
      catalog: state.catalog.map((r) =>
        r.id === id
          ? {
              ...r,
              title: clampTitle(input.title),
              description: input.description?.trim() ?? r.description,
              pointCost: clampCost(input.pointCost),
              minStreakDays: clampStreak(input.minStreakDays ?? 0),
            }
          : r,
      ),
    });
    return { ok: true };
  },

  /**
   * Flip availability. No hard delete: past redemptions resolve their titles
   * through the catalog, so rows are deactivated instead of removed.
   */
  setActive(id: string, active: boolean): void {
    syncProfileLedger();
    setState({
      ...state,
      catalog: state.catalog.map((r) => (r.id === id ? { ...r, active } : r)),
    });
  },

  /**
   * Soft delete. The row stays in the catalog so every past redemption keeps
   * resolving its title, but it is inactive (gone from the kid's list) and
   * archivedAt moves it to the parent's "Removed" shelf. A hard delete would
   * erase the title of each historical redemption instead.
   */
  archiveReward(id: string): void {
    syncProfileLedger();
    setState({
      ...state,
      catalog: state.catalog.map((r) =>
        r.id === id ? { ...r, active: false, archivedAt: nowIso() } : r,
      ),
    });
  },

  /** Undo a soft delete: back in the catalog and available to the kid again. */
  restoreReward(id: string): void {
    syncProfileLedger();
    setState({
      ...state,
      catalog: state.catalog.map((r) => {
        if (r.id !== id) return r;
        const restored: Reward = { ...r, active: true };
        delete restored.archivedAt;
        return restored;
      }),
    });
  },

  /**
   * Kid-side request. Holds the cost against the active kid's points wallet via
   * the canonical redemption rules (balance/streak/example checks, no
   * double-spend): balance is deducted at request and refunded on deny.
   * A second request for the same reward is rejected while one is pending
   * (requested) or approved-but-unfulfilled.
   */
  requestRedemption(rewardId: string): { ok: boolean; error?: string; id?: string } {
    syncProfileLedger();
    const reward = state.catalog.find((r) => r.id === rewardId);
    if (!reward) return { ok: false, error: "Reward not found." };
    if (!reward.active) return { ok: false, error: "That reward is not available right now." };
    if (reward.example) return { ok: false, error: "That prize is an example — ask a grown-up to set up a real one." };
    const open = state.redemptions.some(
      (r) => r.rewardId === rewardId && (r.status === "requested" || r.status === "approved"),
    );
    if (open) return { ok: false, error: "Already asked — waiting on a grown-up." };
    const id = newId("redeem");
    try {
      const points = loadPointsState();
      const { state: nextPoints, redemption } = requestWithHold(points, state.catalog, state.redemptions, {
        id,
        rewardId: reward.id,
        date: todayLocal(),
      });
      savePointsState(nextPoints);
      setState({ ...state, redemptions: [{ ...redemption, requestedAt: nowIso() }, ...state.redemptions] });
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not request that reward." };
    }
  },

  /** Requested -> approved. */
  approveRedemption(id: string): void {
    syncProfileLedger();
    setState({
      ...state,
      redemptions: state.redemptions.map((r) =>
        r.id === id && r.status === "requested"
          ? { ...r, status: "approved", decidedAt: nowIso() }
          : r,
      ),
    });
  },

  /** Requested -> denied. Releases the hold: refunds the cost to the points wallet. */
  denyRedemption(id: string): void {
    syncProfileLedger();
    const current = state.redemptions.find((r) => r.id === id);
    if (!current || current.status !== "requested") return;
    const points = loadPointsState();
    const { state: nextPoints, redemptions } = denyWithRefund(points, state.redemptions, id, todayLocal());
    savePointsState(nextPoints);
    setState({
      ...state,
      redemptions: redemptions.map((r) =>
        r.id === id && r.decidedAt ? { ...r, decidedAt: nowIso() } : r,
      ),
    });
  },

  /** Approved -> fulfilled (parent bought / delivered the real-world item). */
  markFulfilled(id: string): void {
    syncProfileLedger();
    setState({
      ...state,
      redemptions: state.redemptions.map((r) =>
        r.id === id && r.status === "approved"
          ? {
              ...r,
              status: "fulfilled",
              decidedAt: r.decidedAt ?? nowIso(),
              fulfilledAt: nowIso(),
            }
          : r,
      ),
    });
  },

  /** Wipe back to the example seed (demo escape hatch). */
  resetAll(): void {
    syncProfileLedger();
    setState({ version: 1, catalog: seedCatalog(), redemptions: [] });
  },

  /** Test seam: replace state without touching storage listeners. */
  __replaceForTests(next: RewardState): void {
    state = next;
    lastPid = activePid();
  },
};

export function pendingRedemptions(s: RewardState): Redemption[] {
  return s.redemptions.filter((r) => r.status === PENDING_STATUS);
}

export function redemptionHistory(s: RewardState): Redemption[] {
  return s.redemptions.filter((r) => r.status !== PENDING_STATUS);
}

export function useRewardStore(): {
  state: RewardState;
  actions: typeof rewardActions;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => state);
  return { state: snapshot, actions: rewardActions };
}
