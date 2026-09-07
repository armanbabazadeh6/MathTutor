import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "../src/lib/plan/plan";
import type { SkillHistoryEntry } from "../src/lib/plan/rules";
import { SKILLS } from "../src/lib/skills";
import {
  POINTS_DAILY_BONUS,
  POINTS_PER_COMPLETION,
} from "../src/lib/rewards/earning";
import { emptyPointsState } from "../src/lib/rewards/types";
import {
  MAX_PER_SKILL_PER_QUEST,
  QUEST_ASSIGNMENT_NOTE,
  QUEST_BONUS_PTS,
  QUEST_MAX_ITEMS,
  QUEST_MIN_ITEMS,
  QUEST_VERSION,
  awardQuestCompletion,
  buildDailyQuest,
  deserializeQuest,
  hashSeed,
  isChallengeUnlocked,
  isQuestComplete,
  isQuestExpired,
  nextStreakAfterQuest,
  pointsForQuestCompletion,
  questId,
  questSizeFor,
  questTitleFor,
  regenerateQuest,
  resolveDailyQuest,
  serializeQuest,
  startQuest,
} from "../src/lib/quest/quest";

function losses(skillId: string, n: number): SkillHistoryEntry[] {
  return Array.from({ length: n }, () => ({
    skillId,
    firstTryCorrect: false,
    exhaustedAttempts: true,
    correct: false,
    usedHint: false,
  }));
}

function planWithReteach() {
  return buildPlan({ levelsMap: { "bt-add-multidigit": 3 }, history: losses("bt-add-multidigit", 2), size: 12 });
}

function highPlan() {
  const levelsMap: Record<string, 4> = {};
  for (const s of SKILLS) levelsMap[s.id] = 4;
  return buildPlan({ levelsMap, size: 12 });
}

function countBy<T>(xs: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) {
    const k = key(x);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/* ---------- determinism ---------- */

test("same inputs build the same quest (stable across restarts)", () => {
  const plan = planWithReteach();
  const a = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: plan });
  const b = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: plan });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("seed is the hash of profileId + date", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan() });
  assert.equal(q.seed, hashSeed("kid-1|2026-09-07"));
});

test("quest id is profile + date (one quest per kid per day)", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan() });
  assert.equal(q.id, "kid-1:2026-09-07");
  assert.equal(q.id, questId("kid-1", "2026-09-07"));
});

test("different day gives a different quest", () => {
  const plan = buildPlan();
  const a = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: plan });
  const b = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-08", planState: plan });
  assert.notEqual(a.id, b.id);
  assert.notDeepEqual(a, b);
});

test("different profile gives a different quest", () => {
  const plan = buildPlan();
  const a = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: plan });
  const b = buildDailyQuest({ profileId: "kid-2", dateISO: "2026-09-07", planState: plan });
  assert.notEqual(a.id, b.id);
  assert.notDeepEqual(a, b);
});

/* ---------- shape ---------- */

test("quest holds 10-12 items across many day seeds", () => {
  for (let d = 1; d <= 12; d++) {
    const date = `2026-09-${String(d).padStart(2, "0")}`;
    const q = buildDailyQuest({ profileId: "kid-1", dateISO: date, planState: buildPlan({ size: 12 }) });
    assert.ok(q.items.length >= QUEST_MIN_ITEMS && q.items.length <= QUEST_MAX_ITEMS, `${date}: ${q.items.length}`);
    assert.equal(q.items.length, questSizeFor(q.seed));
  }
});

test("quest title is a kid-friendly non-empty string, deterministic per seed", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan() });
  assert.equal(typeof q.questTitle, "string");
  assert.ok(q.questTitle.length > 0);
  assert.equal(q.questTitle, questTitleFor(q.seed));
});

test("quest items carry position, level, difficulty, and reason", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan({ size: 12 }) });
  q.items.forEach((item, i) => {
    assert.equal(item.position, i);
    assert.ok(item.skillId.length > 0);
    assert.ok(item.level >= 1 && item.level <= 5);
    assert.ok(["easy", "medium", "challenge"].includes(item.difficulty));
    assert.ok(["reteach", "today", "weak", "review", "challenge"].includes(item.reason));
  });
});

test("cold start without a plan still builds a full quest", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07" });
  assert.ok(q.items.length >= QUEST_MIN_ITEMS && q.items.length <= QUEST_MAX_ITEMS);
  assert.ok(q.items.some((i) => i.reason === "today"));
});

/* ---------- plan mix ---------- */

test("reteach items come first", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: planWithReteach() });
  assert.equal(q.items[0].reason, "reteach");
  assert.equal(q.items[0].skillId, "bt-add-multidigit");
});

test("today focus skill is in the quest", () => {
  const plan = buildPlan({ levelsMap: { "fr-equiv": 4 }, todayTopic: "fr-equiv", size: 12 });
  const q = buildDailyQuest({ profileId: "kid-7", dateISO: "2026-09-03", planState: plan });
  const today = q.items.filter((i) => i.reason === "today");
  assert.ok(today.length > 0);
  assert.ok(today.every((i) => i.skillId === "fr-equiv"));
});

test("challenge is gated off when the plan average is low", () => {
  const plan = buildPlan({ size: 10 });
  assert.equal(isChallengeUnlocked(plan), false);
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: plan });
  assert.ok(!q.items.some((i) => i.reason === "challenge"));
});

test("challenge-only source is filtered when locked (no challenge leaks in)", () => {
  const locked = {
    levels: Object.fromEntries(SKILLS.map((s) => [s.id, 1])),
    items: SKILLS.slice(0, 10).map((s) => ({ skillId: s.id, level: 1, difficulty: "easy", reason: "challenge" })),
  };
  assert.equal(isChallengeUnlocked(locked), false);
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: locked });
  assert.ok(!q.items.some((i) => i.reason === "challenge"));
  assert.ok(q.items.length >= QUEST_MIN_ITEMS);
});

test("challenge survives when unlocked", () => {
  const plan = highPlan();
  assert.equal(isChallengeUnlocked(plan), true);
  const onlyChallenge = {
    levels: Object.fromEntries(SKILLS.map((s) => [s.id, 4])),
    items: SKILLS.slice(0, 10).map((s) => ({ skillId: s.id, level: 5, difficulty: "challenge", reason: "challenge" })),
  };
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: onlyChallenge });
  assert.ok(q.items.some((i) => i.reason === "challenge"));
});

test("no skill appears more than 3x per quest (fuzzed)", () => {
  const profiles = ["kid-1", "kid-2", "kid-3"];
  const plans = [buildPlan({ size: 12 }), planWithReteach(), highPlan()];
  for (const profileId of profiles) {
    for (let d = 1; d <= 6; d++) {
      for (const plan of plans) {
        const q = buildDailyQuest({ profileId, dateISO: `2026-08-${String(d).padStart(2, "0")}`, planState: plan });
        const counts = countBy(q.items, (i) => i.skillId);
        for (const [skill, n] of Object.entries(counts)) assert.ok(n <= MAX_PER_SKILL_PER_QUEST, `${skill}: ${n}`);
      }
    }
  }
});

/* ---------- lock ---------- */

test("locked quest is stable mid-day even when mastery shifts", () => {
  const morning = planWithReteach();
  const quest = startQuest(
    buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: morning }),
    "2026-09-07T08:00:00",
  );
  const eveningPlan = highPlan(); // mastery shifted mid-day
  const resolved = resolveDailyQuest({ ...quest }, {
    profileId: "kid-1",
    dateISO: "2026-09-07",
    planState: eveningPlan,
  });
  assert.deepEqual(resolved.items, quest.items);
  assert.equal(resolved.startedAt, quest.startedAt);
});

test("unlocked quest rebuilds from the latest plan (pre-start)", () => {
  const input = { profileId: "kid-1", dateISO: "2026-09-07", planState: highPlan() };
  const fresh = buildDailyQuest(input);
  const resolved = resolveDailyQuest(null, input);
  assert.deepEqual(resolved, fresh);
});

test("startQuest locks without changing items; re-start keeps the original timestamp", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan({ size: 12 }) });
  assert.equal(q.startedAt, undefined);
  const started = startQuest(q, "2026-09-07T08:00:00");
  assert.equal(started.startedAt, "2026-09-07T08:00:00");
  assert.deepEqual(started.items, q.items);
  const again = startQuest(started, "2026-09-07T09:00:00");
  assert.equal(again.startedAt, "2026-09-07T08:00:00");
  assert.deepEqual(again.items, q.items);
});

/* ---------- expiry + rollover ---------- */

test("quest expires on any other day (no backlog)", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan() });
  assert.equal(isQuestExpired(q, "2026-09-07"), false);
  assert.equal(isQuestExpired(q, "2026-09-08"), true);
  assert.equal(isQuestExpired(q, "2026-09-06"), true);
});

test("next day rolls over to a new quest id", () => {
  const plan = buildPlan();
  const today = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: plan });
  const tomorrow = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-08", planState: plan });
  assert.equal(isQuestExpired(today, "2026-09-08"), true);
  assert.equal(isQuestExpired(tomorrow, "2026-09-08"), false);
  assert.notEqual(today.id, tomorrow.id);
});

/* ---------- bonus + streak ---------- */

test("completion bonus equals the completion event plus the daily bonus", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan() });
  assert.equal(q.bonusRewardPts, POINTS_PER_COMPLETION + POINTS_DAILY_BONUS);
  assert.equal(q.bonusRewardPts, QUEST_BONUS_PTS);
  assert.equal(pointsForQuestCompletion(1), q.bonusRewardPts);
});

test("quest points scale with the 7-day streak multiplier", () => {
  assert.ok(pointsForQuestCompletion(7) > pointsForQuestCompletion(1));
  assert.equal(pointsForQuestCompletion(6), pointsForQuestCompletion(1));
});

test("finishing the quest advances the streak via existing rules", () => {
  assert.equal(nextStreakAfterQuest(0, "", "2026-09-07"), 1);
  assert.equal(nextStreakAfterQuest(3, "2026-09-06", "2026-09-07"), 4);
  assert.equal(nextStreakAfterQuest(9, "2026-09-05", "2026-09-07"), 1);
});

test("awardQuestCompletion credits points and advances the streak", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan() });
  const after = awardQuestCompletion(emptyPointsState(), q, "2026-09-07");
  assert.equal(after.streakDays, 1);
  assert.equal(after.lastActiveDate, "2026-09-07");
  assert.ok(after.balance >= QUEST_BONUS_PTS);
  const repeat = awardQuestCompletion(after, q, "2026-09-07");
  assert.equal(repeat.streakDays, 1); // same-day repeats don't double count
});

test("awardQuestCompletion refuses an expired quest", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan() });
  assert.throws(() => awardQuestCompletion(emptyPointsState(), q, "2026-09-08"));
});

test("quest completion needs every item solved", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan() });
  assert.equal(isQuestComplete(q, q.items.length), true);
  assert.equal(isQuestComplete(q, q.items.length - 1), false);
  assert.equal(isQuestComplete(q, 0), false);
});

/* ---------- parent override ---------- */

test("regenerateQuest keeps the shape and id but reshuffles unlocked", () => {
  const plan = planWithReteach();
  const q = startQuest(
    buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: plan }),
    "2026-09-07T08:00:00",
  );
  const next = regenerateQuest({ quest: q, reason: "too hard", planState: plan });
  assert.equal(next.id, q.id);
  assert.equal(next.version, QUEST_VERSION);
  assert.equal(next.profileId, q.profileId);
  assert.equal(next.dateISO, q.dateISO);
  assert.equal(next.parentReason, "too hard");
  assert.equal(next.startedAt, undefined);
  assert.ok(next.items.length >= QUEST_MIN_ITEMS && next.items.length <= QUEST_MAX_ITEMS);
  assert.ok(typeof next.seed === "number" && typeof next.questTitle === "string");
  assert.ok(typeof next.bonusRewardPts === "number" && Array.isArray(next.items));
});

test("regenerateQuest is deterministic per reason", () => {
  const plan = buildPlan({ size: 12 });
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: plan });
  const a = regenerateQuest({ quest: q, reason: "too easy", planState: plan });
  const b = regenerateQuest({ quest: q, reason: "too easy", planState: plan });
  const c = regenerateQuest({ quest: q, reason: "too hard", planState: plan });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("regenerateQuest rejects an empty reason", () => {
  const q = buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan() });
  assert.throws(() => regenerateQuest({ quest: q, reason: "   ", planState: buildPlan() }));
});

/* ---------- persistence ---------- */

test("quest serializes to plain JSON and round-trips", () => {
  const q = startQuest(
    buildDailyQuest({ profileId: "kid-1", dateISO: "2026-09-07", planState: buildPlan({ size: 12 }) }),
    "2026-09-07T08:00:00",
  );
  const json = serializeQuest(q);
  assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(json))), JSON.parse(json));
  assert.deepEqual(deserializeQuest(json), q);
});

test("deserializeQuest rejects version mismatch", () => {
  assert.throws(() => deserializeQuest(JSON.stringify({ version: 999, id: "x", items: [] })));
});

/* ---------- validation + docs ---------- */

test("invalid profile and date inputs throw", () => {
  assert.throws(() => buildDailyQuest({ profileId: "", dateISO: "2026-09-07" }));
  assert.throws(() => buildDailyQuest({ profileId: "kid-1", dateISO: "not-a-date" }));
  assert.throws(() => buildDailyQuest({ profileId: "kid-1", dateISO: "2026-13-40" }));
});

test("assignment note documents quest-first, free-pick as extra practice", () => {
  assert.ok(QUEST_ASSIGNMENT_NOTE.includes("extra practice"));
  assert.match(QUEST_ASSIGNMENT_NOTE, /assignment/i);
});
