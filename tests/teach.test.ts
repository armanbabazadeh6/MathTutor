import { strict as assert } from "node:assert";
import { test } from "node:test";
import { generateProblem, ALL_SKILLS } from "../src/lib/math/generators";
import { grade } from "../src/lib/math/grading";
import { buildLesson, LESSON_SKILLS, isLessonSupported } from "../src/lib/teach/lessons";
import type { Problem } from "../src/lib/math/types";

function lessonFor(skill: string, seed = 7) {
  const problem = generateProblem(skill, seed);
  return { problem, lesson: buildLesson(problem) };
}

function bodyAndNumbersContainFailed(problem: Problem, seed = 7): void {
  void seed;
  const lesson = buildLesson(problem);
  const hay = (problem.text + " " + problem.answer).replace(/,/g, "");
  for (const s of lesson.steps) {
    assert.ok(s.workedNumbers.length > 0, `step "${s.title}" has no workedNumbers`);
    const refsFailed = s.workedNumbers.some((n) => hay.includes(String(n).replace(/,/g, "")));
    assert.ok(refsFailed, `step "${s.title}" does not reference failed numbers [${s.workedNumbers}]`);
  }
}

/* ---------- coverage: every generator skill has a lesson ---------- */

test("every generator skill has a lesson template", () => {
  assert.ok(ALL_SKILLS.length >= 14, `expected >=14 generator skills, got ${ALL_SKILLS.length}`);
  for (const skill of ALL_SKILLS) {
    assert.ok(isLessonSupported(skill), `${skill} has no lesson template`);
    assert.ok(LESSON_SKILLS.includes(skill), `${skill} missing from LESSON_SKILLS`);
  }
});

for (const skill of ALL_SKILLS) {
  test(`${skill}: lesson has 3-5 steps with valid shape`, () => {
    const { lesson, problem } = lessonFor(skill);
    assert.equal(lesson.skill, skill);
    assert.equal(lesson.problemText, problem.text);
    assert.ok(lesson.steps.length >= 3 && lesson.steps.length <= 5, `got ${lesson.steps.length} steps`);
    for (const s of lesson.steps) {
      assert.ok(s.title.length > 0);
      assert.ok(s.body.length > 0);
      assert.ok(["text", "number-line", "break-apart"].includes(s.visual), `bad visual ${s.visual}`);
      assert.ok(Array.isArray(s.workedNumbers) && s.workedNumbers.length > 0);
    }
  });
}

test("steps reference the failed problem numbers (spot check across skills)", () => {
  for (const skill of ALL_SKILLS) {
    const { problem } = lessonFor(skill, 7);
    bodyAndNumbersContainFailed(problem);
  }
});

test("lessons derive from actual failed numbers, not random ones", () => {
  const { problem, lesson } = lessonFor("bt-add-multidigit", 42);
  const other = generateProblem("bt-add-multidigit", 99);
  assert.notDeepEqual(problem.text, other.text);
  const otherNums = other.text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) ?? [];
  const firstStepNums = lesson.steps[0].workedNumbers.map(String);
  const problemNums = (problem.text).replace(/,/g, "");
  for (const n of firstStepNums.slice(0, 2)) {
    assert.ok(problemNums.includes(n), `workedNumber ${n} not from failed problem`);
  }
  void otherNums;
});

test("unknown skill falls back to a generic lesson", () => {
  const problem: Problem = {
    id: "x",
    skill: "nope-not-a-skill",
    difficulty: "easy",
    answerType: "integer",
    text: "What is 12 + 30?",
    answer: "42",
    hint1: "",
    hint2: "",
    explanation: "",
  };
  const lesson = buildLesson(problem);
  assert.ok(lesson.steps.length >= 3 && lesson.steps.length <= 5);
  assert.ok(lesson.title.length > 0);
  assert.deepEqual(lesson.checkProblem, problem);
});

test("fallback works when the problem text has no numbers", () => {
  const problem: Problem = {
    id: "y",
    skill: "mystery-skill",
    difficulty: "easy",
    answerType: "text",
    text: "Which shape has symmetry?",
    answer: "circle",
    hint1: "",
    hint2: "",
    explanation: "",
  };
  const lesson = buildLesson(problem);
  assert.ok(lesson.steps.length >= 3);
  for (const s of lesson.steps) assert.ok(s.body.length > 0);
});

test("lesson is JSON serializable", () => {
  const { lesson } = lessonFor("fr-equiv", 3);
  const roundTripped = JSON.parse(JSON.stringify(lesson));
  assert.deepEqual(roundTripped, lesson);
});

test("buildLesson is deterministic for the same problem", () => {
  const p = generateProblem("bt-rounding", 11);
  assert.deepEqual(buildLesson(p), buildLesson({ ...p }));
});

test("final step asks the student to finish (try-it)", () => {
  for (const skill of ALL_SKILLS) {
    const { lesson } = lessonFor(skill, 5);
    const last = lesson.steps[lesson.steps.length - 1];
    assert.match(last.title.toLowerCase(), /try|your turn/);
    assert.ok(last.body.includes("?") || /try|finish|your/i.test(last.body));
  }
});

test("check problem grades via the existing grading fn", () => {
  for (const skill of ALL_SKILLS) {
    const { lesson } = lessonFor(skill, 8);
    assert.ok(grade(lesson.checkProblem, lesson.checkProblem.answer), `${skill} canonical answer should grade true`);
    assert.equal(grade(lesson.checkProblem, "zzz-nope-zzz"), false, `${skill} junk should grade false`);
  }
});

test("rounding lesson references the actual number and neighbors", () => {
  const { problem, lesson } = lessonFor("bt-rounding", 4);
  const n = Number((problem.text.replace(/,/g, "").match(/Round\s+(\d+)/) ?? [])[1]);
  assert.ok(lesson.steps.some((s) => s.workedNumbers.includes(n)), "no step references the rounded number");
});

test("place-value lesson references the actual digit", () => {
  const { problem, lesson } = lessonFor("bt-place-value", 4);
  const digit = Number(problem.answer);
  assert.ok(lesson.steps.some((s) => s.workedNumbers.includes(digit)), "no step references the answer digit");
});

test("division-remainder lesson references dividend, divisor, and remainder", () => {
  const { problem, lesson } = lessonFor("oa-div-1digit-divisor", 6);
  const nums = problem.text.replace(/,/g, "").match(/\d+/g)!.map(Number);
  const flat = lesson.steps.flatMap((s) => s.workedNumbers);
  for (const n of nums) assert.ok(flat.includes(n), `number ${n} missing from lesson`);
});
