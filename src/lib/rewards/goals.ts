// MathTutor — reward goals: built-in streak milestones + catalog helpers.
//
// The catalog is parent-owned configuration. seedCatalog() ships one
// EXAMPLE placeholder (clearly marked) that a parent is expected to edit,
// replace, or deactivate — it must never be fulfilled as listed.

import type { Reward } from "./types";

export interface Milestone {
  id: string;
  streakDays: number;
  title: string;
  description: string;
}

/** Built-in streak milestone track: 7 / 14 / 30 days. */
export const STREAK_MILESTONES: Milestone[] = [
  { id: "streak-7", streakDays: 7, title: "Week streak", description: "Active 7 days in a row." },
  { id: "streak-14", streakDays: 14, title: "Two-week streak", description: "Active 14 days in a row." },
  { id: "streak-30", streakDays: 30, title: "Month streak", description: "Active 30 days in a row." },
];

/** Milestones reached at the given streak count (ascending). */
export function milestonesReached(streakDays: number): Milestone[] {
  if (!Number.isFinite(streakDays)) return [];
  return STREAK_MILESTONES.filter((m) => Math.floor(streakDays) >= m.streakDays);
}

/** Milestones crossed when moving from prev to next streak (ascending). */
export function newlyReachedMilestones(prevStreak: number, nextStreak: number): Milestone[] {
  const before = new Set(milestonesReached(prevStreak).map((m) => m.id));
  return milestonesReached(nextStreak).filter((m) => !before.has(m.id));
}

/**
 * Seed catalog. Contains ONE example entry — a "$0 gift card" style
 * placeholder (example: true, active: true so it shows up for editing)
 * that demonstrates the 30-day streak + 5000 pt shape. Parents MUST
 * configure a real reward before approving anything against it.
 */
export function seedCatalog(): Reward[] {
  return [
    {
      id: "roblox-gift-card-example",
      title: "Roblox gift card (example)",
      description:
        "EXAMPLE — configurable placeholder, not a real offer. " +
        "Parent edits expected: set a real title, cost, and streak rule before use. " +
        "Shape demonstrated: 30-day streak + 5000 pts.",
      pointCost: 5000,
      minStreakDays: 30,
      icon: "🎮",
      active: true,
      example: true,
    },
  ];
}

/** Active, sorted-by-cost rewards. Inactive and example entries excluded unless requested. */
export function listRedeemable(catalog: Reward[], includeExamples = false): Reward[] {
  return catalog
    .filter((r) => r.active && (includeExamples || !r.example))
    .sort((a, b) => a.pointCost - b.pointCost);
}

export function getReward(catalog: Reward[], id: string): Reward | undefined {
  return catalog.find((r) => r.id === id);
}

/** Append a reward; throws on duplicate id or negative cost. */
export function addReward(catalog: Reward[], reward: Reward): Reward[] {
  if (catalog.some((r) => r.id === reward.id)) {
    throw new Error(`duplicate reward id: ${reward.id}`);
  }
  if (!Number.isFinite(reward.pointCost) || reward.pointCost < 0) {
    throw new Error(`invalid pointCost for reward ${reward.id}`);
  }
  return [...catalog, { ...reward }];
}

/** Replace a reward by id; throws when missing. */
export function updateReward(catalog: Reward[], id: string, patch: Partial<Reward>): Reward[] {
  const idx = catalog.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`unknown reward: ${id}`);
  const next = { ...catalog[idx], ...patch, id: catalog[idx].id };
  if (!Number.isFinite(next.pointCost) || next.pointCost < 0) {
    throw new Error(`invalid pointCost for reward ${id}`);
  }
  return [...catalog.slice(0, idx), next, ...catalog.slice(idx + 1)];
}

/** Deactivate a reward by id; throws when missing. */
export function deactivateReward(catalog: Reward[], id: string): Reward[] {
  return updateReward(catalog, id, { active: false });
}
