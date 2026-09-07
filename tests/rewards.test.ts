import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POINTS_DAILY_BONUS,
  POINTS_PER_COMPLETION,
  POINTS_PER_FIRST_TRY,
  POINTS_PER_LEVEL_UP,
  baseEventPoints,
  nextStreakDays,
  pointsForEvents,
  recordActivity,
  streakMultiplier,
} from "../src/lib/rewards/earning";
import {
  addReward,
  deactivateReward,
  getReward,
  listRedeemable,
  milestonesReached,
  newlyReachedMilestones,
  seedCatalog,
  updateReward,
} from "../src/lib/rewards/goals";
import {
  approveRedemption,
  canRedeem,
  denyRedemption,
  fulfillRedemption,
  heldPoints,
  parseRewardsDoc,
  requestRedemption,
  serializeRewards,
} from "../src/lib/rewards/redemption";
import { emptyPointsState, emptyRewardsDoc } from "../src/lib/rewards/types";
import type { Reward, RewardsDoc } from "../src/lib/rewards/types";

function testReward(over: Partial<Reward> = {}): Reward {
  return {
    id: "r1",
    title: "Test reward",
    description: "test",
    pointCost: 100,
    icon: "🎁",
    active: true,
    ...over,
  };
}

function richState() {
  return { ...emptyPointsState(), balance: 1000, lifetime: 1000, streakDays: 10, lastActiveDate: "2026-09-01" };
}

// ---------- earning math ----------

test("first-try points scale linearly below the streak threshold", () => {
  assert.equal(pointsForEvents({ firstTryCorrect: 3 }, 1), 3 * POINTS_PER_FIRST_TRY);
});

test("completion points pay the per-completion rate", () => {
  assert.equal(pointsForEvents({ completions: 2 }, 1), 2 * POINTS_PER_COMPLETION);
});

test("level-up points pay the per-level-up rate", () => {
  assert.equal(pointsForEvents({ levelUps: 1 }, 1), POINTS_PER_LEVEL_UP);
});

test("7-day streak applies the 1.5x multiplier to event points", () => {
  assert.equal(streakMultiplier(7), 1.5);
  assert.equal(pointsForEvents({ firstTryCorrect: 2 }, 7), Math.round(2 * POINTS_PER_FIRST_TRY * 1.5));
});

test("multiplier stays 1x below 7 days and applies above", () => {
  assert.equal(streakMultiplier(6), 1);
  assert.equal(streakMultiplier(30), 1.5);
  assert.equal(baseEventPoints({ firstTryCorrect: 1, completions: 1, levelUps: 1 }),
    POINTS_PER_FIRST_TRY + POINTS_PER_COMPLETION + POINTS_PER_LEVEL_UP);
});

test("daily bonus is a flat add-on, not multiplied", () => {
  const without = pointsForEvents({ firstTryCorrect: 2 }, 7);
  const withBonus = pointsForEvents({ firstTryCorrect: 2, dailyBonus: true }, 7);
  assert.equal(withBonus - without, POINTS_DAILY_BONUS);
});

// ---------- streak calc ----------

test("first activity starts the streak at 1", () => {
  assert.equal(nextStreakDays(0, "", "2026-09-01"), 1);
});

test("consecutive-day activity increments the streak", () => {
  assert.equal(nextStreakDays(3, "2026-09-01", "2026-09-02"), 4);
});

test("same-day repeats do not double count the streak", () => {
  assert.equal(nextStreakDays(3, "2026-09-01", "2026-09-01"), 3);
});

test("a missed day resets the streak to 1", () => {
  assert.equal(nextStreakDays(9, "2026-09-01", "2026-09-03"), 1);
});

test("recordActivity advances streak, credits points, and appends history", () => {
  const s0 = { ...emptyPointsState() };
  const s1 = recordActivity(s0, "2026-09-01", { firstTryCorrect: 1, dailyBonus: true });
  assert.equal(s1.streakDays, 1);
  assert.equal(s1.balance, POINTS_PER_FIRST_TRY + POINTS_DAILY_BONUS);
  assert.equal(s1.lifetime, s1.balance);
  assert.equal(s1.history.length, 1);
  const s2 = recordActivity(s1, "2026-09-01", { firstTryCorrect: 1 });
  assert.equal(s2.streakDays, 1);
  assert.equal(s2.balance, s1.balance + POINTS_PER_FIRST_TRY);
});

// ---------- request validation ----------

test("request holds points: balance drops, lifetime untouched", () => {
  const s = richState();
  const { state, redemption } = requestRedemption(s, [testReward()], [], {
    id: "x1", rewardId: "r1", date: "2026-09-02",
  });
  assert.equal(state.balance, 900);
  assert.equal(state.lifetime, 1000);
  assert.equal(redemption.status, "requested");
  assert.equal(redemption.pointCost, 100);
});

test("request rejects insufficient balance", () => {
  const s = { ...emptyPointsState(), balance: 10, streakDays: 10, lastActiveDate: "2026-09-01" };
  assert.throws(() => requestRedemption(s, [testReward({ pointCost: 100 })], [], {
    id: "x1", rewardId: "r1", date: "2026-09-02",
  }), /insufficient balance/);
});

test("request rejects unmet streak minimum", () => {
  const s = { ...emptyPointsState(), balance: 9999, streakDays: 5, lastActiveDate: "2026-09-01" };
  assert.throws(() => requestRedemption(s, [testReward({ minStreakDays: 7 })], [], {
    id: "x1", rewardId: "r1", date: "2026-09-02",
  }), /streak requirement/);
});

test("request rejects inactive and example rewards", () => {
  const s = richState();
  assert.throws(() => requestRedemption(s, [testReward({ active: false })], [], {
    id: "a", rewardId: "r1", date: "2026-09-02",
  }), /inactive/);
  assert.throws(() => requestRedemption(s, [testReward({ example: true })], [], {
    id: "b", rewardId: "r1", date: "2026-09-02",
  }), /example/);
  assert.ok(!canRedeem(s, undefined).ok);
});

// ---------- double-spend + transitions ----------

test("second request cannot spend held points (double-spend blocked)", () => {
  const s = { ...emptyPointsState(), balance: 100, streakDays: 10, lastActiveDate: "2026-09-01" };
  const r1 = requestRedemption(s, [testReward({ pointCost: 100 })], [], {
    id: "x1", rewardId: "r1", date: "2026-09-02",
  });
  assert.throws(() => requestRedemption(r1.state, [testReward({ pointCost: 100 })],
    [r1.redemption], { id: "x2", rewardId: "r1", date: "2026-09-02" }), /insufficient balance/);
});

test("deny releases the hold back to balance", () => {
  const s = richState();
  const r1 = requestRedemption(s, [testReward()], [], { id: "x1", rewardId: "r1", date: "2026-09-02" });
  const out = denyRedemption(r1.state, [r1.redemption], "x1", "2026-09-03");
  assert.equal(out.state.balance, 1000);
  assert.equal(out.redemptions[0].status, "denied");
});

test("full earn->request->approve->fulfill cycle keeps held points spent", () => {
  let s = recordActivity(emptyPointsState(), "2026-09-01", { completions: 4, dailyBonus: true });
  assert.ok(s.balance >= 100);
  const catalog = [testReward({ pointCost: 100 })];
  const r1 = requestRedemption(s, catalog, [], { id: "x1", rewardId: "r1", date: "2026-09-01" });
  const afterApprove = approveRedemption([r1.redemption], "x1", "2026-09-02");
  assert.equal(afterApprove[0].status, "approved");
  assert.equal(r1.state.balance, s.balance - 100);
  const afterFulfill = fulfillRedemption(afterApprove, "x1", "2026-09-03");
  assert.equal(afterFulfill[0].status, "fulfilled");
  assert.equal(heldPoints(afterFulfill), 0);
});

test("illegal transitions throw: fulfill-before-approve, double approve, deny-after-approve", () => {
  const s = richState();
  const r1 = requestRedemption(s, [testReward()], [], { id: "x1", rewardId: "r1", date: "2026-09-02" });
  assert.throws(() => fulfillRedemption([r1.redemption], "x1", "2026-09-03"), /requested to fulfilled/);
  const approved = approveRedemption([r1.redemption], "x1", "2026-09-03");
  assert.throws(() => approveRedemption(approved, "x1", "2026-09-04"), /approved to approved/);
  assert.throws(() => denyRedemption(s, approved, "x1", "2026-09-04"), /approved/);
});

test("heldPoints counts requested+approved only; duplicate ids rejected", () => {
  const s = richState();
  const catalog = [testReward()];
  const r1 = requestRedemption(s, catalog, [], { id: "x1", rewardId: "r1", date: "2026-09-02" });
  assert.throws(() => requestRedemption(r1.state, catalog, [r1.redemption],
    { id: "x1", rewardId: "r1", date: "2026-09-02" }), /duplicate redemption id/);
  assert.equal(heldPoints([r1.redemption]), 100);
  const approved = approveRedemption([r1.redemption], "x1", "2026-09-03");
  assert.equal(heldPoints(approved), 100);
});

// ---------- milestones + catalog ----------

test("milestone track detects 7/14/30-day streaks", () => {
  assert.deepEqual(milestonesReached(6).map((m) => m.id), []);
  assert.deepEqual(milestonesReached(7).map((m) => m.id), ["streak-7"]);
  assert.deepEqual(milestonesReached(14).map((m) => m.id), ["streak-7", "streak-14"]);
  assert.deepEqual(milestonesReached(30).map((m) => m.id), ["streak-7", "streak-14", "streak-30"]);
  assert.deepEqual(newlyReachedMilestones(6, 14).map((m) => m.id), ["streak-7", "streak-14"]);
  assert.deepEqual(newlyReachedMilestones(7, 7).map((m) => m.id), []);
});

test("seed catalog ships the marked Roblox example (configurable placeholder)", () => {
  const catalog = seedCatalog();
  const ex = catalog[0];
  assert.equal(catalog.length, 1);
  assert.equal(ex.pointCost, 5000);
  assert.equal(ex.minStreakDays, 30);
  assert.equal(ex.example, true);
  assert.match(ex.title + ex.description, /[Rr]oblox/);
  assert.match(ex.description, /EXAMPLE/);
  // Example excluded from redeemable list by default, visible for editing when asked.
  assert.equal(listRedeemable(catalog).length, 0);
  assert.equal(listRedeemable(catalog, true).length, 1);
});

test("catalog helpers add/update/deactivate with validation", () => {
  let catalog: Reward[] = [];
  catalog = addReward(catalog, testReward());
  assert.equal(getReward(catalog, "r1")?.title, "Test reward");
  assert.throws(() => addReward(catalog, testReward()), /duplicate/);
  assert.throws(() => addReward(catalog, testReward({ id: "r2", pointCost: -5 })), /invalid/);
  catalog = updateReward(catalog, "r1", { pointCost: 50 });
  assert.equal(getReward(catalog, "r1")?.pointCost, 50);
  assert.throws(() => updateReward(catalog, "nope", { pointCost: 1 }), /unknown reward/);
  catalog = deactivateReward(catalog, "r1");
  assert.equal(listRedeemable(catalog).length, 0);
});

// ---------- persistence round-trip ----------

test("rewards doc serializes to plain JSON and round-trips versioned", () => {
  const doc: RewardsDoc = {
    ...emptyRewardsDoc(seedCatalog()),
    state: recordActivity(emptyPointsState(), "2026-09-01", { firstTryCorrect: 2 }),
    redemptions: [],
  };
  const json = serializeRewards(doc);
  const revived = JSON.parse(json) as RewardsDoc;
  assert.equal(revived.version, 1);
  assert.equal(typeof revived.state.balance, "number");
  assert.ok(Array.isArray(revived.catalog) && Array.isArray(revived.redemptions));
  const back = parseRewardsDoc(json);
  assert.deepEqual(back, { ...doc, version: 1 });
  assert.throws(() => parseRewardsDoc(JSON.stringify({ ...doc, version: 999 })), /unsupported/);
  assert.throws(() => parseRewardsDoc(JSON.stringify({ version: 1 })), /malformed/);
});
