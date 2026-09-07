import { isCorrectAnswer } from "./answers";
import type { AttemptResult, Problem } from "./types";

/**
 * Deterministic grading against the problem's canonical answer only.
 * Pure function — no LLM or network in this path.
 */
export function grade(problem: Problem, submitted: string): boolean {
  return isCorrectAnswer(problem.answer, submitted, problem.answerType);
}

/** Grade and package the result for the mastery pipeline. */
export function gradeAttempt(problem: Problem, submitted: string, usedHint = false): AttemptResult {
  return { correct: grade(problem, submitted), usedHint, submitted };
}
