import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEMOTION_EXHAUSTED_COUNT,
  PROMOTION_STREAK,
  applyRulesForSkill,
  blendMastery,
  isPromotionEligible,
  trailingFirstTryStreak,
} from "../src/lib/plan/rules";
import type { SkillHistoryEntry } from "../src/lib/plan/rules";
import { CHALLENGE_MIN_AVG_LEVEL, buildPlan, planAverageLevel } from "../src/lib/plan/plan";
import {
  GRADUATION_MIN_AVG_LEVEL,
  GRADUATION_MIN_AVG_MASTERY,
  domainGraduationStatus,
} from "../src/lib/plan/graduation";
import { DAY_MS, isDue, reviewIntervalDays } from "../src/lib/plan/srs";
import { ALL_SKILLS, generatorGradeFor } from "../src/lib/math/generators";
import { SKILLS } from "../src/lib/skills";
import type { SkillDomain } from "../src/lib/skills";
import type { LevelsMap } from "../src/lib/plan/levels";
import type { MasteryMap } from "../src/lib/math/types";
import { QUEST_MIN_ITEMS, buildDailyQuest } from "../src/lib/quest/quest";

function win(skillId: string, n: number): SkillHistoryEntry[] {
  return Array.from({ length: n }, () => ({
    skillId,
    firstTryCorrect: true,
    exhaustedAttempts: false,
    correct: true,
    usedHint: false,
  }));
}

function losses(skillId: string, n: number): SkillHistoryEntry[] {
  return Array.from({ length: n }, () => ({
    skillId,
    firstTryCorrect: false,
    exhaustedAttempts: true,
    correct: false,
    usedHint: false,
  }));
}

/* ---------- 1. promotion/demotion fire once per crossing ---------- */

test("re-evaluating the same 3-win history promotes exactly once", () => {
  const recent = win("s", PROMOTION_STREAK);
  let level = 2;
  let promotedAtStreak = 0;
  let demotedAtExhausted = 0;
  const levels: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = applyRulesForSkill({ level, mastery: 60, recent, promotedAtStreak, demotedAtExhausted });
    level = r.level;
    promotedAtStreak = r.promotedAtStreak;
    demotedAtExhausted = r.demotedAtExhausted;
    levels.push(r.level);
  }
  assert.equal(levels[0], 3, "the first full run promotes one level");
  assert.deepEqual(levels.slice(1), [3, 3, 3, 3], "identical evaluations must not keep climbing");
});

test("a growing first-try run promotes once per full streak, not per win", () => {
  let level = 2;
  let promotedAtStreak = 0;
  let demotedAtExhausted = 0;
  const levels: number[] = [];
  for (let n = 1; n <= PROMOTION_STREAK + 2; n++) {
    const r = applyRulesForSkill({
      level,
      mastery: 60,
      recent: win("s", n),
      promotedAtStreak,
      demotedAtExhausted,
    });
    level = r.level;
    promotedAtStreak = r.promotedAtStreak;
    demotedAtExhausted = r.demotedAtExhausted;
    levels.push(r.level);
  }
  assert.deepEqual(levels, [2, 2, 3, 3, 3]);
});

test("two exhausted entries demote once and re-evaluation does not demote again", () => {
  const recent = losses("s", DEMOTION_EXHAUSTED_COUNT);
  const first = applyRulesForSkill({ level: 3, mastery: 60, recent });
  assert.equal(first.level, 2);
  assert.ok(first.demoted && first.reteach);
  const second = applyRulesForSkill({
    level: first.level,
    mastery: first.mastery,
    recent,
    promotedAtStreak: first.promotedAtStreak,
    demotedAtExhausted: first.demotedAtExhausted,
  });
  assert.equal(second.level, 2);
  assert.ok(!second.demoted && !second.promoted);
});

test("a low-mastery window demotes once, not on every evaluation", () => {
  const first = applyRulesForSkill({ level: 3, mastery: 5, recent: [] });
  assert.equal(first.level, 2);
  assert.ok(first.demoted && first.reteach);
  const second = applyRulesForSkill({
    level: first.level,
    mastery: first.mastery,
    recent: [],
    promotedAtStreak: first.promotedAtStreak,
    demotedAtExhausted: first.demotedAtExhausted,
  });
  assert.equal(second.level, 2);
  assert.ok(!second.demoted);
});

/* ---------- 3. reteach wins count toward promotion ---------- */

test("a correct reteach win keeps the promotion run alive", () => {
  const recent: SkillHistoryEntry[] = [
    ...win("s", PROMOTION_STREAK - 1),
    { skillId: "s", firstTryCorrect: false, exhaustedAttempts: false, correct: true, usedHint: true },
  ];
  assert.ok(isPromotionEligible(recent[recent.length - 1]));
  assert.equal(trailingFirstTryStreak(recent), PROMOTION_STREAK);
  const r = applyRulesForSkill({ level: 2, mastery: 50, recent });
  assert.equal(r.level, 3);
  assert.ok(r.promoted);
});

test("a correct non-first-try win earns the smaller hint-sized mastery nudge", () => {
  const firstTry = blendMastery(50, win("s", 1));
  const retry = blendMastery(50, [
    { skillId: "s", firstTryCorrect: false, exhaustedAttempts: false, correct: true, usedHint: false },
  ]);
  assert.ok(firstTry > retry, `first-try ${firstTry} should beat retry ${retry}`);
});

/* ---------- 2. graduation is reachable ---------- */

test("every domain graduates when all its generator-backed grade-4 skills qualify", () => {
  const domains: SkillDomain[] = [
    "operations-algebraic",
    "base-ten",
    "fractions",
    "measurement-data",
    "geometry",
  ];
  const backed = new Set(ALL_SKILLS);
  for (const domain of domains) {
    const levels: LevelsMap = {};
    const mastery: MasteryMap = {};
    for (const s of SKILLS) {
      if (s.grade === 4 && s.domain === domain && backed.has(s.id)) {
        levels[s.id] = 4;
        mastery[s.id] = 80;
      }
    }
    const st = domainGraduationStatus(domain, levels, mastery);
    assert.ok(st.total > 0, `${domain} has no generator-backed grade-4 skills`);
    assert.ok(st.coverage >= 0.8, `${domain} coverage ${st.coverage} unreachable`);
    assert.ok(st.avgLevel >= GRADUATION_MIN_AVG_LEVEL && st.avgMastery >= GRADUATION_MIN_AVG_MASTERY);
    assert.equal(st.graduated, true, `${domain} should graduate`);
  }
});

/* ---------- 4. SRS scheduler ---------- */

test("review interval ladder is monotonically non-decreasing in successes", () => {
  let prev = 0;
  for (let n = 0; n <= 6; n++) {
    const days = reviewIntervalDays(3, 60, n);
    assert.ok(days >= prev, `n=${n}: ${days} < ${prev}`);
    prev = days;
  }
  assert.ok(reviewIntervalDays(5, 100, 4) > reviewIntervalDays(1, 0, 0), "level + mastery stretch the gap");
});

test("isDue: unseen skills are due, freshly reviewed ones are not", () => {
  const now = 1_700_000_000_000;
  assert.equal(isDue(undefined, 3, now), true);
  const interval = reviewIntervalDays(2, 50, 0);
  assert.equal(isDue(now, interval, now), false);
  assert.equal(isDue(now - 10 * DAY_MS, interval, now), true);
});

test("spaced review prefers the most overdue skill and skips unseen material", () => {
  // A: seen early but with a long interval (strong, high level).
  // B: seen late but with a short interval (weak, low level), so more overdue.
  const a = "oa-mult-digit-1digit";
  const b = "oa-div-facts";
  const history: SkillHistoryEntry[] = [...win(a, 5), ...losses(b, 1)];
  const p = buildPlan({ history, levelsMap: { [a]: 5, [b]: 2 }, size: 12 });
  const reviewIds = p.items.filter((i) => i.reason === "review").map((i) => i.skillId);
  assert.equal(reviewIds[0], b, `expected ${b} first, got ${reviewIds.join(", ")}`);
  assert.ok(reviewIds.includes(a));
});

/* ---------- 5. cold start follows the curriculum, not the alphabet ---------- */

test("cold start serves the curriculum head as today's topic", () => {
  const p = buildPlan();
  const today = p.items.find((i) => i.reason === "today");
  assert.ok(today);
  assert.equal(today.skillId, "oa-mult-1digit");
  assert.notEqual(today.skillId, "bt-add-multidigit");
});

/* ---------- 6. challenge gating ignores locked grade-5 skills ---------- */

test("challenge gating averages only unlocked skills", () => {
  const levelsMap: LevelsMap = {};
  for (const s of SKILLS) levelsMap[s.id] = s.grade === 5 ? 1 : 3;
  const p = buildPlan({ levelsMap, size: 12 });
  assert.ok(planAverageLevel(p) >= CHALLENGE_MIN_AVG_LEVEL);
  assert.ok(p.items.some((i) => i.reason === "challenge"));
});

/* ---------- 7. quest fallback never serves locked grade-5 content ---------- */

test("quest fallback emits no grade-5 skill before any graduation", () => {
  const planState = { levels: {}, items: [] };
  for (const profile of ["kid-a", "kid-b", "kid-c"]) {
    for (let day = 1; day <= 10; day++) {
      const dateISO = `2026-09-${String(day).padStart(2, "0")}`;
      const q = buildDailyQuest({ profileId: profile, dateISO, planState });
      assert.ok(q.items.length >= QUEST_MIN_ITEMS, `${profile} ${dateISO}: short quest`);
      for (const item of q.items) {
        assert.notEqual(generatorGradeFor(item.skillId), 5, `${profile} ${dateISO}: ${item.skillId}`);
      }
    }
  }
});
