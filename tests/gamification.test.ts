import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_REWARD_XP,
  XP_FIRST_TRY_BONUS,
  XP_PER_LEVEL,
  XP_PER_SOLVED,
  dailyReward,
  evaluateBadges,
  isYesterday,
  levelForXp,
  nextStreak,
  xpForAttempt,
  xpForLevel,
  xpForSession,
  xpProgressInLevel,
  xpToNextLevel,
} from "../src/lib/gamification";

test("xpForAttempt pays 10 solved + 5 first-try bonus", () => {
  assert.equal(xpForAttempt({ solved: true, correctFirstTry: true }), XP_PER_SOLVED + XP_FIRST_TRY_BONUS);
  assert.equal(xpForAttempt({ solved: true, correctFirstTry: false }), XP_PER_SOLVED);
  assert.equal(xpForAttempt({ solved: false, correctFirstTry: false }), 0);
});

test("xpForSession adds the 20 XP perfect bonus only when all first-try", () => {
  const perfect = [
    { solved: true, correctFirstTry: true },
    { solved: true, correctFirstTry: true },
  ];
  const mixed = [
    { solved: true, correctFirstTry: true },
    { solved: true, correctFirstTry: false },
  ];
  assert.equal(xpForSession(perfect), 2 * (XP_PER_SOLVED + XP_FIRST_TRY_BONUS) + 20);
  assert.equal(xpForSession(mixed), 2 * XP_PER_SOLVED + XP_FIRST_TRY_BONUS);
  assert.equal(xpForSession([]), 0);
});

test("levels advance every 100 XP starting at level 1", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(250), 3);
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(3), 2 * XP_PER_LEVEL);
});

test("level progress reports position inside the band", () => {
  assert.deepEqual(xpProgressInLevel(30), { level: 1, intoLevel: 30, needed: 100 });
  assert.deepEqual(xpProgressInLevel(100), { level: 2, intoLevel: 0, needed: 100 });
  assert.equal(xpToNextLevel(30), 70);
  assert.equal(xpToNextLevel(100), 100);
});

test("nextStreak increments on consecutive days and holds on same-day replay", () => {
  assert.deepEqual(nextStreak({ streakCount: 2, lastPlayedDate: "2026-09-06" }, "2026-09-07"), {
    streakCount: 3,
    lastPlayedDate: "2026-09-07",
  });
  assert.deepEqual(nextStreak({ streakCount: 2, lastPlayedDate: "2026-09-07" }, "2026-09-07"), {
    streakCount: 2,
    lastPlayedDate: "2026-09-07",
  });
});

test("nextStreak resets to 1 after a gap and starts at 1 for first session", () => {
  assert.deepEqual(nextStreak({ streakCount: 5, lastPlayedDate: "2026-09-04" }, "2026-09-07"), {
    streakCount: 1,
    lastPlayedDate: "2026-09-07",
  });
  assert.deepEqual(nextStreak({ streakCount: 0, lastPlayedDate: "" }, "2026-09-07"), {
    streakCount: 1,
    lastPlayedDate: "2026-09-07",
  });
});

test("isYesterday compares calendar days", () => {
  assert.equal(isYesterday("2026-09-06", "2026-09-07"), true);
  assert.equal(isYesterday("2026-09-07", "2026-09-07"), false);
  assert.equal(isYesterday("2026-09-05", "2026-09-07"), false);
});

test("evaluateBadges awards session, streak, XP, and effort badges", () => {
  const badges = evaluateBadges({
    sessionsCompleted: 1,
    streakCount: 3,
    lifetimeXp: 120,
    fractionsSolved: 5,
    perfectSession: true,
    solvedAfterRetry: true,
  });
  for (const id of ["first-session", "perfect-10", "streak-3", "xp-100", "fraction-friend", "persistent"]) {
    assert.ok(badges.includes(id as never), `missing ${id}`);
  }
  assert.ok(!badges.includes("streak-7" as never));
  assert.ok(!badges.includes("xp-500" as never));
});

test("evaluateBadges stays empty for a blank profile", () => {
  assert.deepEqual(
    evaluateBadges({
      sessionsCompleted: 0,
      streakCount: 0,
      lifetimeXp: 0,
      fractionsSolved: 0,
      perfectSession: false,
      solvedAfterRetry: false,
    }),
    [],
  );
});

test("dailyReward pays once per day and rejects same-day re-claims", () => {
  assert.deepEqual(dailyReward("", "2026-09-07"), { awarded: true, xp: DAILY_REWARD_XP });
  assert.deepEqual(dailyReward("2026-09-06", "2026-09-07"), { awarded: true, xp: DAILY_REWARD_XP });
  assert.deepEqual(dailyReward("2026-09-07", "2026-09-07"), { awarded: false, xp: 0 });
});
