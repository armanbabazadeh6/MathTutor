/**
 * Regression tests for the five measured session-engine defects:
 *
 * 1. mastery double-folded the whole history onto an already-blended value
 *    (three right answers read 98%, unlocking grade-5 content),
 * 2. replaying a finished quest re-paid the completion bonus, the daily bonus
 *    and the streak, without limit,
 * 3. `mt.…lastResult.v1` was parsed unchecked, so a bad payload bricked the
 *    results screen with no way out,
 * 4. the flame and the "in a row" card read two different streaks,
 * 5. stars (progress.xp) and points (the wallet balance) were two ledgers drawn
 *    with the same ⭐.
 *
 * Each test states the measured symptom it pins down.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  awardPoints,
  isQuestDoneToday,
  loadLastResult,
  loadPlanSession,
  loadPointsState,
  loadProgress,
  localDateISO,
  recordGradedAttempt,
  recordResult,
  recordReteachOutcome,
  savePlanSession,
  savePointsState,
  startDailyQuest,
  streakDaysFor,
  xpForResult,
} from "../src/lib/session";
import type { AssignmentState, PracticeResult } from "../src/lib/session";
import { currentStreakDays } from "../src/lib/analytics";
import { GRADUATION_SKILL_MASTERY } from "../src/lib/plan/graduation";
import { DEFAULT_LEVEL } from "../src/lib/plan/levels";
import { QUEST_BONUS_PTS } from "../src/lib/quest/quest";
import { denyRedemption, requestRedemption } from "../src/lib/rewards/redemption";
import { emptyPointsState } from "../src/lib/rewards/types";
import type { Reward } from "../src/lib/rewards/types";

/* In-memory window.localStorage so session persistence works under tsx. */
const backing = new Map<string, string>();
const storage = {
  getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
  setItem: (k: string, v: string) => {
    backing.set(k, String(v));
  },
  removeItem: (k: string) => {
    backing.delete(k);
  },
  clear: () => backing.clear(),
  key: (i: number) => Array.from(backing.keys())[i] ?? null,
  get length() {
    return backing.size;
  },
};
// tsx has no DOM: stand in for window so the localStorage-backed stores work.
const globals = globalThis as unknown as { window?: unknown };
globals.window = { localStorage: storage };

beforeEach(() => backing.clear());

const SKILL = "oa-mult-1digit";
const QUEST_DAY = "2026-09-10";

/** A first-try win on a skill, as the practice player records it. */
function win(skillId: string) {
  return {
    skillId,
    firstTryCorrect: true,
    exhaustedAttempts: false,
    correct: true,
    usedHint: false,
  };
}

/** A finished, all-first-try session over the given assignment. */
function solve(assignment: AssignmentState): PracticeResult {
  const attempts = assignment.problems.map((p) => ({
    problemId: p.id,
    domain: p.domain,
    skillId: p.skillId,
    skillName: p.skillName,
    level: p.level,
    attemptsUsed: 1,
    solved: true,
    correctFirstTry: true,
    timeMs: 1000,
  }));
  return {
    assignmentId: assignment.id,
    finishedAt: Date.now(),
    total: attempts.length,
    solved: attempts.length,
    correctFirst: attempts.length,
    accuracy: 100,
    perDomain: [],
    xpEarned: xpForResult(attempts),
    attempts,
    levelChanges: [],
    reteachSkills: [],
  };
}

/** The day-based recomputation the /progress calendar performs, from the two stamped stores. */
function activityDaySet(): string[] {
  const days = new Set<string>();
  for (const entry of loadPointsState().history) days.add(entry.date);
  for (const entry of loadPlanSession().history) {
    if (typeof entry.at === "number") days.add(localDateISO(new Date(entry.at)));
  }
  return Array.from(days).sort();
}

/* ---------- 1. mastery folds each answer once ---------- */

test("mastery reads 58 / 66 / 74 / 82, not 58 / 74 / 98 / 100", () => {
  let recorded = 0;
  const after = (total: number): number => {
    while (recorded < total) {
      recordGradedAttempt(win(SKILL));
      recorded += 1;
    }
    return loadPlanSession().mastery[SKILL] ?? -1;
  };
  assert.equal(after(1), 58);
  assert.equal(after(2), 66);
  assert.equal(after(3), 74);
  // Three answers a kid actually answered: below the per-skill grade-5 bar.
  assert.ok(
    (loadPlanSession().mastery[SKILL] ?? 0) < GRADUATION_SKILL_MASTERY,
    "three right answers must not clear the grade-5 mastery bar",
  );
  assert.equal(after(4), 82);
});

/* ---------- 2. a finished quest cannot be farmed ---------- */

test("a quest pays its bonus once per day; a replay pays effort stars only", () => {
  const day1 = startDailyQuest(QUEST_DAY);
  const result = solve(day1.assignment);
  const first = recordResult(result, undefined, { quest: day1.quest, today: QUEST_DAY });
  assert.equal(isQuestDoneToday(day1.quest.id), true);
  // Completion event + daily bonus, once.
  assert.equal(loadPointsState().balance, result.xpEarned + QUEST_BONUS_PTS);
  const streakAfterFirst = first.points.streakDays;

  const replay = recordResult(result, undefined, { quest: day1.quest, today: QUEST_DAY });
  assert.equal(
    loadPointsState().balance,
    result.xpEarned + QUEST_BONUS_PTS + result.xpEarned,
    "a same-day replay must not re-pay the quest bonus",
  );
  assert.equal(replay.points.streakDays, streakAfterFirst);
  assert.equal(replay.progress.streakCount, first.progress.streakCount);

  // A new day is a new quest id and pays again.
  const day2 = startDailyQuest("2026-09-11");
  const fresh = solve(day2.assignment);
  const beforeNewDay = loadPointsState().balance;
  recordResult(fresh, undefined, { quest: day2.quest, today: "2026-09-11" });
  assert.equal(loadPointsState().balance, beforeNewDay + fresh.xpEarned + QUEST_BONUS_PTS);
});

/* ---------- 3. a bad stored result reads as null ---------- */

test("a malformed lastResult payload reads as null instead of bricking the page", () => {
  backing.set("mt.lastResult.v1", JSON.stringify({ foo: 1 }));
  assert.equal(loadLastResult(null), null);

  // Numbers where the arrays belong are equally unreadable.
  backing.set(
    "mt.lastResult.v1",
    JSON.stringify({
      assignmentId: "a-1",
      finishedAt: 1,
      total: 3,
      solved: 3,
      correctFirst: 3,
      accuracy: 100,
      xpEarned: 30,
      attempts: 5,
      perDomain: [],
    }),
  );
  assert.equal(loadLastResult(null), null);
});

test("a legacy result without levelChanges/reteachSkills still loads, arrays defaulted", () => {
  backing.set(
    "mt.lastResult.v1",
    JSON.stringify({
      assignmentId: "a-legacy",
      finishedAt: 1,
      total: 3,
      solved: 2,
      correctFirst: 1,
      accuracy: 67,
      xpEarned: 25,
      perDomain: [{ domain: "fractions", domainName: "Pizza Fractions", total: 3, solved: 2 }],
      attempts: [
        {
          problemId: "p1",
          domain: "fractions",
          attemptsUsed: 2,
          solved: true,
          correctFirstTry: false,
          timeMs: 900,
        },
      ],
    }),
  );
  const loaded = loadLastResult(null);
  assert.ok(loaded, "a legacy result must still load");
  assert.deepEqual(loaded.levelChanges, []);
  assert.deepEqual(loaded.reteachSkills, []);
  assert.equal(loaded.total, 3);
  assert.equal(loaded.xpEarned, 25);
  assert.equal(loaded.attempts.length, 1);
  assert.equal(loaded.attempts[0].level, DEFAULT_LEVEL);
  assert.equal(loaded.attempts[0].solved, true);
});

/* ---------- 4. one canonical streak ---------- */

test("the streak is a day-based recomputation after mixed play, not a session counter", () => {
  const today = localDateISO();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  // Yesterday left both stamps the calendar reads: a graded attempt and a ledger day.
  const session = loadPlanSession();
  savePlanSession({
    ...session,
    history: [
      ...session.history,
      {
        skillId: SKILL,
        firstTryCorrect: true,
        exhaustedAttempts: false,
        correct: true,
        usedHint: false,
        at: yesterday.getTime(),
      },
    ],
  });
  awardPoints({ firstTryCorrect: 1 }, localDateISO(yesterday));

  // Today: a completed session, a partial one, and a teach-mode check.
  const { assignment } = startDailyQuest(today);
  recordResult(solve(assignment), undefined, { today });
  recordResult({ ...solve(assignment), solved: 4, correctFirst: 2 }, undefined, { countStreak: false, today });
  recordReteachOutcome(SKILL, true, undefined, { today });

  const progress = loadProgress();
  assert.equal(progress.streakCount, 2, "yesterday + today");
  assert.equal(progress.streakCount, currentStreakDays(activityDaySet(), today));
  assert.equal(progress.streakCount, streakDaysFor(undefined, today));
  assert.equal(loadPointsState().streakDays, progress.streakCount, "the wallet gates on the same streak");
});

/* ---------- 5. one currency: stars ---------- */

test("stars are one balance: the wallet and progress.xp are the same number", () => {
  const today = localDateISO();
  const { assignment } = startDailyQuest(today);
  recordResult(solve(assignment), undefined, { today });
  recordGradedAttempt(win(SKILL), undefined, { countStreak: false, today });

  const wallet = loadPointsState();
  assert.ok(wallet.balance > 0);
  assert.equal(loadProgress().xp, wallet.balance);

  const prize: Reward = {
    id: "r1",
    title: "Ice cream",
    description: "",
    pointCost: 100,
    icon: "🍦",
    active: true,
  };
  const before = wallet.balance;
  const { state: held, redemption } = requestRedemption(loadPointsState(), [prize], [], {
    id: "x1",
    rewardId: "r1",
    date: today,
  });
  savePointsState(held);
  assert.equal(loadPointsState().balance, before - 100);
  assert.equal(loadProgress().xp, before - 100, "spending moves the one number");

  const { state: refunded } = denyRedemption(loadPointsState(), [redemption], "x1", today);
  savePointsState(refunded);
  assert.equal(loadPointsState().balance, before, "a denied request refunds the hold");
  assert.equal(loadProgress().xp, before);

  // Over-spending is rejected, so the balance can never go negative.
  const tooExpensive: Reward = { ...prize, id: "r2", pointCost: before + 1 };
  assert.throws(
    () =>
      requestRedemption(loadPointsState(), [tooExpensive], [], {
        id: "x2",
        rewardId: "r2",
        date: today,
      }),
    /insufficient balance/,
  );
  assert.equal(loadPointsState().balance, before);
});

test("the merge keeps the larger tally and any existing hold", () => {
  const progressDoc = (xp: number) =>
    JSON.stringify({ xp, streakCount: 0, lastPlayedDate: "", sessionsCompleted: 1, perfectSessions: 0, badges: [] });
  const v1Wallet = (balance: number, lifetime: number) =>
    JSON.stringify({
      version: 1,
      state: { ...emptyPointsState(), balance, lifetime, streakDays: 3, lastActiveDate: "2026-09-01" },
    });

  // 1,240 stars and 320 points counted the same practice: one balance, the larger.
  backing.set("mt.progress.v1", progressDoc(1240));
  backing.set("mt.points.v1", v1Wallet(320, 320));
  assert.equal(loadPointsState().balance, 1240);
  assert.equal(loadProgress().xp, 1240);

  // A kid whose wallet outran their XP keeps the wallet number.
  backing.clear();
  backing.set("mt.progress.v1", progressDoc(100));
  backing.set("mt.points.v1", v1Wallet(500, 500));
  assert.equal(loadPointsState().balance, 500);
  assert.equal(loadProgress().xp, 500);

  // A hold taken before the merge survives it: 900 spendable of 1,000 earned.
  backing.clear();
  backing.set("mt.progress.v1", progressDoc(800));
  backing.set("mt.points.v1", v1Wallet(900, 1000));
  assert.equal(loadPointsState().balance, 900);
});
