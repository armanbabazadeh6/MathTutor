// Unit tests for src/lib/analytics.ts. Zero-dependency: node:test +
// node:assert only. Typechecks under the repo tsconfig; runs compiled:
//   npx tsc src/lib/analytics.ts src/app/admin/__tests__/analytics.test.ts \
//     --outDir <tmp> --module commonjs --target es2020 --esModuleInterop \
//     --skipLibCheck --strict --moduleResolution node
//   node --test <tmp>/app/admin/__tests__/analytics.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  completionPct,
  accuracyOf,
  firstAttemptAccuracyOf,
  totalTimeSec,
  formatDuration,
  completedDates,
  currentStreakDays,
  longestStreakDays,
  masteryBySkill,
  strongestTopics,
  weakestTopics,
  mistakePatterns,
  recommendTomorrow,
  summarizeSession,
  todayStatus,
  type AttemptRecord,
  type AssignmentRecord,
} from "../../../lib/analytics";

function attempt(
  over: Partial<AttemptRecord> & { questionId: string },
): AttemptRecord {
  return {
    id: `att-${over.questionId}-${over.attemptNumber ?? 1}`,
    assignmentId: "a1",
    skillId: "oa-mult-1digit",
    attemptNumber: 1,
    correct: true,
    durationSec: 10,
    givenAnswer: "6",
    expectedAnswer: "6",
    createdAt: "2026-09-06T10:00:00Z",
    ...over,
  };
}

function assignment(over: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    id: "a1",
    date: "2026-09-06",
    skillIds: ["oa-mult-1digit"],
    questionIds: ["q1", "q2", "q3", "q4"],
    completedQuestionIds: [],
    difficulty: "grade",
    status: "in-progress",
    ...over,
  };
}

describe("completionPct", () => {
  it("is 0 for an empty assignment (no divide-by-zero)", () => {
    assert.equal(completionPct(assignment({ questionIds: [] })), 0);
  });
  it("computes partial completion and caps at 100", () => {
    assert.equal(
      completionPct(assignment({ completedQuestionIds: ["q1"] })),
      25,
    );
    assert.equal(
      completionPct(
        assignment({ completedQuestionIds: ["q1", "q2", "q3", "q4", "qx"] }),
      ),
      100,
    );
  });
});

describe("accuracyOf", () => {
  it("is 0 with no attempts and fractional otherwise", () => {
    assert.equal(accuracyOf([]), 0);
    assert.equal(
      accuracyOf([attempt({ questionId: "q1" }), attempt({ questionId: "q2", correct: false })]),
      0.5,
    );
  });
});

describe("firstAttemptAccuracyOf", () => {
  it("counts only each question's first attempt", () => {
    const attempts = [
      attempt({ questionId: "q1", attemptNumber: 1, correct: false }),
      attempt({ questionId: "q1", attemptNumber: 2, correct: true }),
      attempt({ questionId: "q2", attemptNumber: 1, correct: true }),
    ];
    assert.equal(firstAttemptAccuracyOf(attempts), 0.5);
    // Overall accuracy would be 2/3 — first-attempt must differ.
    assert.equal(accuracyOf(attempts), 2 / 3);
  });
  it("is 0 with no attempts", () => {
    assert.equal(firstAttemptAccuracyOf([]), 0);
  });
});

describe("totalTimeSec / formatDuration", () => {
  it("sums durations and clamps negatives", () => {
    assert.equal(
      totalTimeSec([
        attempt({ questionId: "q1", durationSec: 30 }),
        attempt({ questionId: "q2", durationSec: -5 }),
      ]),
      30,
    );
  });
  it("formats seconds, minutes, and zero", () => {
    assert.equal(formatDuration(45), "45s");
    assert.equal(formatDuration(125), "2m 5s");
    assert.equal(formatDuration(180), "3m");
    assert.equal(formatDuration(0), "0s");
  });
});

describe("streaks", () => {
  it("completedDates keeps unique sorted completed days", () => {
    assert.deepEqual(
      completedDates([
        assignment({ id: "a", date: "2026-09-06", status: "completed" }),
        assignment({ id: "b", date: "2026-09-06", status: "completed" }),
        assignment({ id: "c", date: "2026-09-05", status: "in-progress" }),
        assignment({ id: "d", date: "2026-09-04", status: "completed" }),
      ]),
      ["2026-09-04", "2026-09-06"],
    );
  });
  it("current streak runs through yesterday when today is incomplete", () => {
    assert.equal(
      currentStreakDays(["2026-09-04", "2026-09-05", "2026-09-06"], "2026-09-07"),
      3,
    );
    assert.equal(
      currentStreakDays(["2026-09-04", "2026-09-06"], "2026-09-07"),
      1,
    );
    assert.equal(currentStreakDays([], "2026-09-07"), 0);
  });
  it("longest streak finds the best run across gaps", () => {
    assert.equal(
      longestStreakDays(["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-05", "2026-09-06"]),
      3,
    );
    assert.equal(longestStreakDays([]), 0);
  });
});

describe("masteryBySkill", () => {
  it("blends accuracy 70/30 and sorts strongest first", () => {
    const attempts = [
      attempt({ questionId: "q1", skillId: "strong", correct: true }),
      attempt({ questionId: "q2", skillId: "strong", correct: true }),
      attempt({ questionId: "q3", skillId: "weak", correct: false }),
      attempt({ questionId: "q3", skillId: "weak", attemptNumber: 2, correct: true }),
    ];
    const [top, bottom] = masteryBySkill(attempts);
    assert.equal(top.skillId, "strong");
    assert.equal(top.mastery, 100);
    assert.equal(bottom.skillId, "weak");
    // accuracy 1/2, first-attempt 0/1 -> 0.7*0.5 = 35
    assert.equal(bottom.mastery, 35);
    assert.equal(bottom.questions, 1);
    assert.equal(bottom.attempts, 2);
  });
});

describe("strongest / weakest topics", () => {
  const masteries = masteryBySkill([
    attempt({ questionId: "q1", skillId: "a", correct: true }),
    attempt({ questionId: "q2", skillId: "b", correct: false }),
    attempt({ questionId: "q2", skillId: "b", attemptNumber: 2, correct: false }),
    attempt({ questionId: "q3", skillId: "c", correct: true }),
    attempt({ questionId: "q3", skillId: "c", attemptNumber: 2, correct: true }),
  ]);
  it("strongest returns top-n, weakest returns bottom-n weakest-first", () => {
    // "a" and "c" both score 100; "c" has more attempts so it ranks first.
    assert.deepEqual(
      strongestTopics(masteries, 1).map((m) => m.skillId),
      ["c"],
    );
    assert.deepEqual(
      weakestTopics(masteries, 2).map((m) => m.skillId),
      ["b", "c"],
    );
  });
});

describe("mistakePatterns", () => {
  it("clusters misses by skill with capped distinct examples", () => {
    const attempts = [
      attempt({ questionId: "q1", skillId: "s1", correct: false, givenAnswer: "5", expectedAnswer: "6" }),
      attempt({ questionId: "q1", skillId: "s1", attemptNumber: 2, correct: false, givenAnswer: "7", expectedAnswer: "6" }),
      attempt({ questionId: "q2", skillId: "s1", correct: false, givenAnswer: "3", expectedAnswer: "4" }),
      attempt({ questionId: "q9", skillId: "s2", correct: true }),
    ];
    const patterns = mistakePatterns(attempts, 1);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].skillId, "s1");
    assert.equal(patterns[0].misses, 3);
    assert.equal(patterns[0].total, 3);
    assert.equal(patterns[0].examples.length, 1);
    assert.equal(patterns[0].examples[0].questionId, "q1");
  });
  it("is empty when nothing was missed", () => {
    assert.deepEqual(mistakePatterns([attempt({ questionId: "q1" })]), []);
  });
});

describe("recommendTomorrow", () => {
  const masteries = masteryBySkill([
    attempt({ questionId: "q1", skillId: "strong", correct: true }),
    attempt({ questionId: "q2", skillId: "mid", correct: false }),
    attempt({ questionId: "q2", skillId: "mid", attemptNumber: 2, correct: true }),
    attempt({ questionId: "q3", skillId: "weak", correct: false }),
  ]);
  it("orders weakest first and respects excludes", () => {
    assert.deepEqual(recommendTomorrow(masteries, { count: 2 }), ["weak", "mid"]);
    assert.deepEqual(recommendTomorrow(masteries, { count: 2, exclude: ["weak"] }), [
      "mid",
      "strong",
    ]);
  });
  it("returns [] when nothing was practiced or count is 0", () => {
    assert.deepEqual(recommendTomorrow([], { count: 3 }), []);
    assert.deepEqual(recommendTomorrow(masteries, { count: 0 }), []);
  });
});

describe("summarizeSession / todayStatus", () => {
  it("rolls up one assignment end to end", () => {
    const a = assignment({
      completedQuestionIds: ["q1", "q2"],
      status: "completed",
    });
    const attempts = [
      attempt({ questionId: "q1", durationSec: 20 }),
      attempt({ questionId: "q2", attemptNumber: 1, correct: false }),
      attempt({ questionId: "q2", attemptNumber: 2, correct: true, durationSec: 40 }),
    ];
    const s = summarizeSession(a, attempts, [a], "2026-09-06");
    assert.equal(s.completionPct, 50);
    assert.equal(s.questionsTotal, 4);
    assert.equal(s.attempts, 3);
    assert.equal(s.correct, 2);
    assert.equal(s.timeSec, 70);
    assert.equal(s.streakDays, 1);
  });
  it("todayStatus aggregates the day and flags full completion", () => {
    const done = todayStatus(
      [assignment({ status: "completed", completedQuestionIds: ["q1", "q2", "q3", "q4"] })],
      "2026-09-06",
    );
    assert.equal(done.complete, true);
    assert.equal(done.doneQuestions, 4);
    const empty = todayStatus([], "2026-09-06");
    assert.equal(empty.complete, false);
    assert.equal(empty.assigned, 0);
  });
});
