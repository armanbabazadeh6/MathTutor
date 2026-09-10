import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { shouldShowInstallPrompt } from "../src/components/effects/InstallPrompt";
import { grade } from "../src/lib/math/grading";
import type { Problem } from "../src/lib/math/types";
import {
  ANSWER_INPUT_MODE,
  ANSWER_KEYPAD_CHARS,
  appendKeypadChar,
} from "../src/lib/answerInput";
import { SKILL_DOMAINS } from "../src/lib/skills";
import {
  checkAnswer,
  generateAssignment,
  localDateISO,
  recordGradedAttempt,
  recordResult,
} from "../src/lib/session";
import type { PracticeResult } from "../src/lib/session";

/* In-memory window.localStorage so session persistence works under tsx. */
const backing = new Map<string, string>();
function installStorage(): void {
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
  (globalThis as unknown as { window?: unknown }).window = { localStorage: storage };
}
installStorage();

beforeEach(() => backing.clear());

function emptyResult(): PracticeResult {
  return {
    assignmentId: "a-test",
    finishedAt: 0,
    total: 0,
    solved: 0,
    correctFirst: 0,
    accuracy: 0,
    perDomain: [],
    xpEarned: 0,
    attempts: [],
    levelChanges: [],
    reteachSkills: [],
  };
}

function problem(answer: string, answerType: Problem["answerType"]): Problem {
  return {
    id: "p-test",
    skill: "bt-add-multidigit",
    difficulty: "easy",
    answerType,
    text: "test problem",
    answer,
    hint1: "h1",
    hint2: "h2",
    explanation: "e",
  };
}

/* ---------- P0-1: InstallPrompt gate ---------- */

test("install prompt shows for an undismissed iPad browser session", () => {
  assert.equal(shouldShowInstallPrompt({ standalone: false, dismissed: false, isIPad: true }), true);
});

test("install prompt hides when running standalone", () => {
  assert.equal(shouldShowInstallPrompt({ standalone: true, dismissed: false, isIPad: true }), false);
});

test("install prompt stays hidden after dismissal", () => {
  assert.equal(shouldShowInstallPrompt({ standalone: false, dismissed: true, isIPad: true }), false);
});

test("install prompt hides on non-iPad devices", () => {
  assert.equal(shouldShowInstallPrompt({ standalone: false, dismissed: false, isIPad: false }), false);
});

/* ---------- P0-2: unified grading ---------- */

test("player and teach-check agree on decimal tolerance", () => {
  const p = problem("2.50", "decimal");
  assert.equal(grade(p, "2.501"), true);
  assert.equal(checkAnswer("2.501", p.answer, p.answerType), true);
});

test("player and teach-check agree on remainder spacing", () => {
  const p = problem("6 R 2", "text");
  assert.equal(grade(p, "6R2"), true);
  assert.equal(checkAnswer("6R2", p.answer, p.answerType), true);
});

test("player and teach-check agree on thousands separators", () => {
  const p = problem("1,000", "integer");
  assert.equal(grade(p, "1000"), true);
  assert.equal(checkAnswer("1000", p.answer, p.answerType), true);
});

test("player and teach-check agree on equivalent fractions", () => {
  const p = problem("1/2", "fraction");
  assert.equal(grade(p, "2/4"), true);
  assert.equal(checkAnswer("2/4", p.answer, p.answerType), true);
});

test("player and teach-check agree on fraction-as-decimal", () => {
  const p = problem("1/2", "fraction");
  assert.equal(grade(p, "0.5"), true);
  assert.equal(checkAnswer("0.5", p.answer, p.answerType), true);
});

test("integer grading rejects float dust both paths agree on", () => {
  const p = problem("42", "integer");
  assert.equal(grade(p, "42.0000000001"), false);
  assert.equal(checkAnswer("42.0000000001", p.answer, p.answerType), false);
});

test("typeless legacy answers infer their type", () => {
  assert.equal(checkAnswer("2/4", "1/2"), true);
  assert.equal(checkAnswer("6R2", "6 R 2"), true);
  assert.equal(checkAnswer("1000", "1,000"), true);
});

test("wrong answers fail on both paths for every answer type", () => {
  const cases: Array<[string, Problem["answerType"], string]> = [
    ["42", "integer", "43"],
    ["2.50", "decimal", "2.9"],
    ["1/2", "fraction", "1/3"],
    ["6 R 2", "text", "6 R 3"],
  ];
  for (const [answer, answerType, wrong] of cases) {
    const p = problem(answer, answerType);
    assert.equal(grade(p, wrong), false, `${answerType} grade`);
    assert.equal(checkAnswer(wrong, answer, answerType), false, `${answerType} player`);
  }
});

test("generated assignments carry answerType and self-grade", () => {
  const a = generateAssignment([SKILL_DOMAINS[0].id], "", 3);
  assert.ok(a.problems.length > 0);
  for (const p of a.problems) {
    assert.ok(p.answerType, "answerType threaded");
    assert.equal(checkAnswer(p.answer, p.answer, p.answerType), true);
  }
});

/* ---------- P0-3: local calendar-day streaks ---------- */

test("streak increments on the next local day", () => {
  const d1 = recordResult(emptyResult(), undefined, { today: "2026-09-06" });
  assert.equal(d1.progress.streakCount, 1);
  const d2 = recordResult(emptyResult(), undefined, { today: "2026-09-07" });
  assert.equal(d2.progress.streakCount, 2);
  assert.equal(d2.progress.lastPlayedDate, "2026-09-07");
});

test("same-day replay holds the streak", () => {
  recordResult(emptyResult(), undefined, { today: "2026-09-06" });
  const again = recordResult(emptyResult(), undefined, { today: "2026-09-06" });
  assert.equal(again.progress.streakCount, 1);
});

test("a missed local day resets the streak", () => {
  recordResult(emptyResult(), undefined, { today: "2026-09-06" });
  const gap = recordResult(emptyResult(), undefined, { today: "2026-09-09" });
  assert.equal(gap.progress.streakCount, 1);
});

test("streak survives a month boundary", () => {
  recordResult(emptyResult(), undefined, { today: "2026-01-31" });
  const next = recordResult(emptyResult(), undefined, { today: "2026-02-01" });
  assert.equal(next.progress.streakCount, 2);
});

test("graded attempts stamp the injected day, not UTC today", () => {
  const out = recordGradedAttempt(
    { skillId: "bt-add-multidigit", firstTryCorrect: true, exhaustedAttempts: false, correct: true, usedHint: false },
    undefined,
    { today: "2026-02-01" },
  );
  assert.equal(out.points.lastActiveDate, "2026-02-01");
  assert.equal(localDateISO(new Date(2026, 1, 1)), "2026-02-01");
});

/* ---------- P0-4: fraction-friendly input ---------- */

test("answer inputs use a slash-capable keyboard mode", () => {
  assert.equal(ANSWER_INPUT_MODE, "text");
  assert.notEqual(ANSWER_INPUT_MODE, "decimal");
});

test("the keypad offers a fraction bar", () => {
  assert.ok((ANSWER_KEYPAD_CHARS as readonly string[]).includes("/"));
});

test("keypad-built fractions grade correctly", () => {
  let v = "";
  for (const ch of ["3", "/", "4"]) v = appendKeypadChar(v, ch);
  assert.equal(v, "3/4");
  assert.equal(checkAnswer(v, "3/4", "fraction"), true);
});
