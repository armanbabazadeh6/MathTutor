// MathTutor — canonical gamification rules (pure functions, no I/O).
//
// Mirrors the live values in src/lib/session.ts (XP_PER_SOLVED=10,
// FIRST_TRY_BONUS=5, PERFECT_SESSION_BONUS=20, badge ids). session.ts remains
// the persisted-progress owner; this module is the testable rule book. If the
// numbers ever drift, this module wins and session.ts must be updated to match.
//
// All date inputs are local "YYYY-MM-DD" strings passed in by the caller —
// this module never calls Date.now(), so streak/reward logic is deterministic
// under test.

export const XP_PER_SOLVED = 10;
export const XP_FIRST_TRY_BONUS = 5;
export const XP_PERFECT_SESSION_BONUS = 20;

/** XP per level band. Level n spans [(n-1)*100, n*100). */
export const XP_PER_LEVEL = 100;

/** XP granted by the once-per-day reward claim. */
export const DAILY_REWARD_XP = 15;

export interface AttemptLike {
  solved: boolean;
  correctFirstTry: boolean;
}

/** XP for one problem attempt: 10 solved + 5 first-try bonus. */
export function xpForAttempt(a: AttemptLike): number {
  let xp = 0;
  if (a.solved) xp += XP_PER_SOLVED;
  if (a.correctFirstTry) xp += XP_FIRST_TRY_BONUS;
  return xp;
}

/**
 * XP for a finished session. Matches session.xpForResult exactly:
 * per-attempt XP plus a 20 XP bonus when every attempt was correct first try.
 */
export function xpForSession(attempts: AttemptLike[]): number {
  let xp = 0;
  for (const a of attempts) xp += xpForAttempt(a);
  if (attempts.length > 0 && attempts.every((a) => a.correctFirstTry)) {
    xp += XP_PERFECT_SESSION_BONUS;
  }
  return xp;
}

/** 1-based level for a lifetime XP total. Negative XP clamps to level 1. */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/** Lifetime XP at which the given 1-based level starts. Level < 1 clamps to 0. */
export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level < 1) return 0;
  return (Math.floor(level) - 1) * XP_PER_LEVEL;
}

/** Position of an XP total inside its level band. */
export function xpProgressInLevel(xp: number): { level: number; intoLevel: number; needed: number } {
  const safe = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const level = levelForXp(safe);
  return { level, intoLevel: safe - xpForLevel(level), needed: XP_PER_LEVEL };
}

/** XP remaining to reach the next level. Already-exact-boundary totals need a full band. */
export function xpToNextLevel(xp: number): number {
  const { intoLevel, needed } = xpProgressInLevel(xp);
  return needed - intoLevel;
}

// ---------- streaks ----------

function toDayNumber(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(day)) return null;
  return Math.floor(day / 86_400_000);
}

/** True when `dateStr` is the calendar day before `todayStr` (UTC days). */
export function isYesterday(dateStr: string, todayStr: string): boolean {
  const d = toDayNumber(dateStr);
  const t = toDayNumber(todayStr);
  return d !== null && t !== null && t - d === 1;
}

export interface StreakState {
  streakCount: number;
  lastPlayedDate: string;
}

/**
 * Next streak state for a session finished `today`. Same-day replay keeps the
 * streak; consecutive-day play increments; a gap resets to 1. Malformed
 * `today` falls back to incrementing when the last date differs (never 0).
 */
export function nextStreak(current: StreakState, today: string): StreakState {
  if (!today || current.lastPlayedDate === today) return { ...current };
  if (current.lastPlayedDate && isYesterday(current.lastPlayedDate, today)) {
    return { streakCount: current.streakCount + 1, lastPlayedDate: today };
  }
  // First session ever, a gap, or an unreadable date: streak (re)starts at 1.
  if (!toDayNumber(today)) return { streakCount: current.streakCount + 1, lastPlayedDate: current.lastPlayedDate };
  return { streakCount: 1, lastPlayedDate: today };
}

// ---------- badges ----------

/** Badge ids — must stay identical to session.BADGES ids. */
export const BADGE_IDS = [
  "first-session",
  "perfect-10",
  "streak-3",
  "streak-7",
  "xp-100",
  "xp-500",
  "fraction-friend",
  "persistent",
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

export interface BadgeInput {
  sessionsCompleted: number;
  streakCount: number;
  lifetimeXp: number;
  fractionsSolved: number;
  /** True when this session was perfect (every problem right first try). */
  perfectSession: boolean;
  /** True when a problem was solved after >1 attempt (hint/second try). */
  solvedAfterRetry: boolean;
}

/** Badge ids earned by the given cumulative state + latest session. Pure. */
export function evaluateBadges(input: BadgeInput): BadgeId[] {
  const out: BadgeId[] = [];
  if (input.sessionsCompleted >= 1) out.push("first-session");
  if (input.perfectSession) out.push("perfect-10");
  if (input.streakCount >= 3) out.push("streak-3");
  if (input.streakCount >= 7) out.push("streak-7");
  if (input.lifetimeXp >= 100) out.push("xp-100");
  if (input.lifetimeXp >= 500) out.push("xp-500");
  if (input.fractionsSolved >= 5) out.push("fraction-friend");
  if (input.solvedAfterRetry) out.push("persistent");
  return out;
}

// ---------- daily reward ----------

export interface DailyReward {
  awarded: boolean;
  xp: number;
}

/**
 * Once-per-day reward. Awards DAILY_REWARD_XP when `today` differs from
 * `lastClaimDate` (empty lastClaimDate = first claim, awards). Same-day
 * re-claim awards nothing. Malformed `today` never awards.
 */
export function dailyReward(lastClaimDate: string, today: string): DailyReward {
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return { awarded: false, xp: 0 };
  if (lastClaimDate === today) return { awarded: false, xp: 0 };
  return { awarded: true, xp: DAILY_REWARD_XP };
}
