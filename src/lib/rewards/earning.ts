// MathTutor — deterministic points earning rules (pure, no I/O).
//
// All date inputs are local "YYYY-MM-DD" strings passed by the caller;
// this module never calls Date.now(), so results are deterministic.

import { isYesterday } from "../gamification";
import type { PointsHistoryEntry, PointsState } from "./types";

/** Points per first-try correct answer (before streak multiplier). */
export const POINTS_PER_FIRST_TRY = 10;
/** Points per completed session/assignment (before multiplier). */
export const POINTS_PER_COMPLETION = 25;
/** Points per level-up (before multiplier). */
export const POINTS_PER_LEVEL_UP = 50;
/** Flat daily activity bonus (NOT multiplied — one per active date). */
export const POINTS_DAILY_BONUS = 5;
/** Streak threshold + multiplier: 7+ day streak earns 1.5x on event points. */
export const STREAK_MULTIPLIER_THRESHOLD = 7;
export const STREAK_MULTIPLIER = 1.5;

export interface EarnEvents {
  firstTryCorrect?: number;
  completions?: number;
  levelUps?: number;
  /** Award the flat once-per-day bonus for this activity date. */
  dailyBonus?: boolean;
}

function toDayNumber(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return Math.floor(t / 86_400_000);
}

function clampCount(n: number | undefined): number {
  if (n === undefined) return 0;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/**
 * Next streak day-count for activity on `today`.
 * Same-day repeat keeps the count; consecutive day increments;
 * a missed day resets to 1; first activity starts at 1.
 * Malformed `today` keeps the current count (no activity recorded).
 */
export function nextStreakDays(current: number, lastActiveDate: string, today: string): number {
  const safe = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  if (toDayNumber(today) === null) return safe;
  if (lastActiveDate === "" || lastActiveDate === undefined) return 1;
  if (lastActiveDate === today) return safe === 0 ? 1 : safe;
  if (isYesterday(lastActiveDate, today)) return safe + 1;
  return 1;
}

/** Streak multiplier for event points: 1.5x at 7+ day streak, else 1x. */
export function streakMultiplier(streakDays: number): number {
  if (!Number.isFinite(streakDays)) return 1;
  return Math.floor(streakDays) >= STREAK_MULTIPLIER_THRESHOLD ? STREAK_MULTIPLIER : 1;
}

/** Base event points before multiplier (daily bonus excluded). */
export function baseEventPoints(events: EarnEvents): number {
  const ft = clampCount(events.firstTryCorrect);
  const co = clampCount(events.completions);
  const lu = clampCount(events.levelUps);
  return ft * POINTS_PER_FIRST_TRY + co * POINTS_PER_COMPLETION + lu * POINTS_PER_LEVEL_UP;
}

/**
 * Total awardable points for events at the given streak: event points
 * (multiplied, rounded) plus the flat daily bonus when requested.
 */
export function pointsForEvents(events: EarnEvents, streakDays: number): number {
  const base = baseEventPoints(events);
  const multiplied = Math.round(base * streakMultiplier(streakDays));
  return multiplied + (events.dailyBonus ? POINTS_DAILY_BONUS : 0);
}

export function pointsForFirstTry(count: number, streakDays: number): number {
  return pointsForEvents({ firstTryCorrect: count }, streakDays);
}

export function pointsForCompletion(count: number, streakDays: number): number {
  return pointsForEvents({ completions: count }, streakDays);
}

export function pointsForLevelUp(count: number, streakDays: number): number {
  return pointsForEvents({ levelUps: count }, streakDays);
}

/**
 * Record one active date: advances the streak (same-day repeats don't
 * double count the streak), awards event points + optional daily bonus,
 * appends a single history entry. Never mutates the input state.
 */
export function recordActivity(state: PointsState, today: string, events: EarnEvents): PointsState {
  if (toDayNumber(today) === null) return state;
  const streakDays = nextStreakDays(state.streakDays, state.lastActiveDate, today);
  const sameDay = state.lastActiveDate === today;
  const points = pointsForEvents(events, streakDays);
  const entries: PointsHistoryEntry[] = [...state.history];
  if (points > 0 || !sameDay) {
    entries.push({
      date: today,
      kind: "grant",
      points,
      note: describeEvents(events, streakDays),
    });
  }
  return {
    balance: state.balance + points,
    lifetime: state.lifetime + points,
    streakDays,
    lastActiveDate: today,
    history: entries,
  };
}

function describeEvents(events: EarnEvents, streakDays: number): string {
  const parts: string[] = [];
  const ft = clampCount(events.firstTryCorrect);
  const co = clampCount(events.completions);
  const lu = clampCount(events.levelUps);
  if (ft > 0) parts.push(`${ft}x first-try`);
  if (co > 0) parts.push(`${co}x completion`);
  if (lu > 0) parts.push(`${lu}x level-up`);
  if (events.dailyBonus) parts.push("daily bonus");
  if (streakMultiplier(streakDays) > 1) parts.push(`${STREAK_MULTIPLIER}x streak`);
  return parts.length > 0 ? parts.join(", ") : "activity";
}
