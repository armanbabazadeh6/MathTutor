// MathTutor — fixed curated Daily Quest (pure, deterministic, serializable).
//
// ASSIGNMENT RULE (integrator contract):
// The quest of the day is THE assignment. Free-pick topic selection remains
// available only as optional "extra practice" AFTER the quest (or instead of
// it on days the family chooses) — extra practice never replaces, mutates,
// or extends the locked quest, earns no completion bonus, and does not
// advance the streak by itself. Completing the full quest awards the quest
// completion bonus (one completion event + daily bonus via the existing
// rewards rules) and advances the streak per `nextStreakDays`. A missed day
// expires unplayed: the old quest is discarded, no backlog accrues, and the
// streak resets per the existing gap rule (back to 1 on next activity).
//
// Determinism: seed = FNV-1a(profileId + "|" + dateISO), so the SAME quest
// is rebuilt all day across restarts from the same plan snapshot. The quest
// LOCKS at first start (`startedAt`): after that, `resolveDailyQuest` keeps
// returning the locked items even if mastery/plan state shifts mid-day.
// Rollover is by calendar date: a new dateISO yields a new quest id.

import { SKILLS } from "../skills";
import type { Difficulty } from "../math/types";
import {
  CHALLENGE_MIN_AVG_LEVEL,
  MAX_PER_SKILL_PER_PLAN,
} from "../plan/plan";
import {
  DEFAULT_LEVEL,
  clampLevel,
  levelToDifficulty,
} from "../plan/levels";
import type { SkillLevel } from "../plan/levels";
import {
  POINTS_DAILY_BONUS,
  POINTS_PER_COMPLETION,
  nextStreakDays,
  pointsForEvents,
  recordActivity,
} from "../rewards/earning";
import type { PointsState } from "../rewards/types";

/** Persisted quest format version. Bump on breaking shape changes. */
export const QUEST_VERSION = 1;
/** Quest length bounds (inclusive). */
export const QUEST_MIN_ITEMS = 10;
export const QUEST_MAX_ITEMS = 12;
/** One skill appears at most this many times per quest (anti-over-drill). */
export const MAX_PER_SKILL_PER_QUEST = 3;
/** Flat extra on top of the standard completion event (display value). */
export const QUEST_EXTRA_PTS = POINTS_DAILY_BONUS;
/** Completion bonus shown on the quest (1x streak): completion + daily bonus. */
export const QUEST_BONUS_PTS = POINTS_PER_COMPLETION + QUEST_EXTRA_PTS;

/**
 * Display copy for integrators: quest is THE assignment, free-pick is
 * optional extra practice. Render near topic pickers.
 */
export const QUEST_ASSIGNMENT_NOTE =
  "Today's quest is your assignment. Picking another topic is optional extra practice: " +
  "it does not change the quest, earns no completion bonus, and does not advance the streak on its own.";

export type QuestReason = "reteach" | "today" | "weak" | "review" | "challenge";

const REASON_PRIORITY: QuestReason[] = ["reteach", "today", "weak", "review", "challenge"];

export interface QuestItem {
  skillId: string;
  level: SkillLevel;
  difficulty: Difficulty;
  reason: QuestReason;
  /** Zero-based position in the quest. */
  position: number;
}

/** Fully persistable quest: plain JSON only (no Dates, Maps, or classes). */
export interface Quest {
  version: typeof QUEST_VERSION;
  /** `${profileId}:${dateISO}` — one fixed quest per kid per day. */
  id: string;
  profileId: string;
  /** Local "YYYY-MM-DD" the quest belongs to. */
  dateISO: string;
  /** FNV-1a hash of profileId + "|" + dateISO (or + "|" + reason on regenerate). */
  seed: number;
  items: QuestItem[];
  questTitle: string;
  /** Completion bonus at 1x streak (completion event + daily bonus). */
  bonusRewardPts: number;
  /** Set once at first start; locks items for the rest of the day. */
  startedAt?: string;
  /** Parent-override reason when rebuilt via regenerateQuest. */
  parentReason?: string;
}

/** Minimal plan snapshot the quest draws from (accepts a full Plan). */
export interface QuestPlanState {
  items?: Array<{
    skillId: string;
    level?: number;
    difficulty?: string;
    reason?: string;
  }>;
  levels?: Record<string, number>;
}

export interface BuildDailyQuestInput {
  profileId: string;
  /** Local "YYYY-MM-DD" — the quest's day. */
  dateISO: string;
  /** Plan snapshot (queue order carries reteach-first priority). */
  planState?: QuestPlanState | null;
  /** Reserved: problem-text catalog hook (accepted, currently unused — item mix draws from the plan queue only). */
  catalog?: unknown;
}

/** FNV-1a 32-bit hash → unsigned seed. Exported so tests can recompute it. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QUEST_TITLES = [
  "Math Explorer Adventure",
  "Number Ninja Mission",
  "Captain Calc's Quest",
  "The Great Puzzle Trail",
  "Math Mountain Climb",
  "Detective Digits Case",
  "Rocket Math Rescue",
  "Treasure Island Sums",
  "Dino Math Stomp",
  "Space Star Challenge",
  "Puzzle Pirate Voyage",
  "Super Solver Showdown",
];

/** Kid-friendly title picked deterministically from the seed. */
export function questTitleFor(seed: number): string {
  return QUEST_TITLES[(seed >>> 0) % QUEST_TITLES.length] as string;
}

/** One fixed quest id per kid per day. */
export function questId(profileId: string, dateISO: string): string {
  return `${profileId}:${dateISO}`;
}

/** Item count for a seed: deterministic 10-12. */
export function questSizeFor(seed: number): number {
  return QUEST_MIN_ITEMS + ((seed >>> 0) % (QUEST_MAX_ITEMS - QUEST_MIN_ITEMS + 1));
}

function isValidDateISO(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d;
}

function coerceReason(raw: unknown): QuestReason {
  return raw === "reteach" || raw === "today" || raw === "weak" || raw === "review" || raw === "challenge"
    ? raw
    : "weak";
}

function coerceDifficulty(level: SkillLevel, raw: unknown): Difficulty {
  if (raw === "easy" || raw === "medium" || raw === "challenge") return raw;
  return levelToDifficulty(level);
}

/** Challenge items are emitted only when the plan's mean level unlocks them. */
export function isChallengeUnlocked(planState?: QuestPlanState | null): boolean {
  const levels = planState?.levels;
  if (levels && Object.keys(levels).length > 0) {
    let sum = 0;
    let n = 0;
    for (const s of SKILLS) {
      const v = levels[s.id];
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += clampLevel(v);
        n++;
      }
    }
    if (n > 0) return sum / n >= CHALLENGE_MIN_AVG_LEVEL;
  }
  // No levels snapshot: unlocked only if the plan queue itself carries challenge items.
  return (planState?.items ?? []).some((i) => i.reason === "challenge");
}

interface SourceItem {
  skillId: string;
  level: SkillLevel;
  difficulty: Difficulty;
  reason: QuestReason;
}

function sourceFromPlan(planState?: QuestPlanState | null, challengeUnlocked?: boolean): SourceItem[] {
  const unlocked = challengeUnlocked ?? isChallengeUnlocked(planState);
  const out: SourceItem[] = [];
  for (const raw of planState?.items ?? []) {
    if (!raw || typeof raw.skillId !== "string" || raw.skillId.length === 0) continue;
    const reason = coerceReason(raw.reason);
    if (reason === "challenge" && !unlocked) continue;
    const level = typeof raw.level === "number" ? clampLevel(raw.level) : DEFAULT_LEVEL;
    out.push({ skillId: raw.skillId, level, difficulty: coerceDifficulty(level, raw.difficulty), reason });
  }
  return out;
}

function fallbackSource(seed: number, target: number, planState?: QuestPlanState | null): SourceItem[] {
  const levels = planState?.levels;
  const levelFor = (skillId: string): SkillLevel =>
    levels && typeof levels[skillId] === "number" ? clampLevel(levels[skillId] as number) : DEFAULT_LEVEL;
  const order = [...SKILLS];
  const rot = order.length > 0 ? (seed >>> 0) % order.length : 0;
  const rotated = [...order.slice(rot), ...order.slice(0, rot)];
  const out: SourceItem[] = [];
  for (let i = 0; i < target; i++) {
    const s = rotated[i % rotated.length] as (typeof SKILLS)[number];
    const level = levelFor(s.id);
    const reason: QuestReason = i === 0 ? "today" : i % 2 === 1 ? "weak" : "review";
    out.push({ skillId: s.id, level, difficulty: levelToDifficulty(level), reason });
  }
  return out;
}

function pickItems(source: SourceItem[], seed: number, target: number): QuestItem[] {
  const rng = mulberry32(seed);
  const groups = new Map<QuestReason, SourceItem[]>();
  for (const r of REASON_PRIORITY) groups.set(r, []);
  for (const item of source) (groups.get(item.reason) as SourceItem[]).push(item);
  // Deterministic shuffle within each priority group.
  for (const r of REASON_PRIORITY) {
    const g = groups.get(r) as SourceItem[];
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = g[i] as SourceItem;
      g[i] = g[j] as SourceItem;
      g[j] = tmp;
    }
  }
  const ordered = REASON_PRIORITY.flatMap((r) => groups.get(r) as SourceItem[]);
  const cap = Math.min(MAX_PER_SKILL_PER_QUEST, MAX_PER_SKILL_PER_PLAN);
  const counts: Record<string, number> = {};
  const picked: SourceItem[] = [];
  for (const item of ordered) {
    if (picked.length >= target) break;
    if ((counts[item.skillId] ?? 0) >= cap) continue;
    picked.push(item);
    counts[item.skillId] = (counts[item.skillId] ?? 0) + 1;
  }
  // Top up from the skill registry (weak rotation) so the quest always reaches target.
  let k = 0;
  while (picked.length < target) {
    const s = SKILLS[(seed + k) % SKILLS.length] as (typeof SKILLS)[number];
    k++;
    if ((counts[s.id] ?? 0) >= cap) {
      if (k > SKILLS.length * cap) break;
      continue;
    }
    picked.push({ skillId: s.id, level: DEFAULT_LEVEL, difficulty: levelToDifficulty(DEFAULT_LEVEL), reason: "weak" });
    counts[s.id] = (counts[s.id] ?? 0) + 1;
  }
  return picked.slice(0, target).map((p, i) => ({
    skillId: p.skillId,
    level: p.level,
    difficulty: p.difficulty,
    reason: p.reason,
    position: i,
  }));
}

function buildWithSeed(
  profileId: string,
  dateISO: string,
  seed: number,
  planState?: QuestPlanState | null,
  parentReason?: string,
): Quest {
  if (planState !== undefined && planState !== null && typeof planState !== "object") {
    throw new Error("planState must be an object, null, or undefined");
  }
  const target = questSizeFor(seed);
  const unlocked = isChallengeUnlocked(planState);
  let source = sourceFromPlan(planState, unlocked);
  if (source.length < target) {
    // Keep real plan items first; top-up filler comes from pickItems fallback.
    source = [...source, ...fallbackSource(seed, target - source.length, planState)];
  }
  const items = pickItems(source, seed, target);
  const quest: Quest = {
    version: QUEST_VERSION,
    id: questId(profileId, dateISO),
    profileId,
    dateISO,
    seed,
    items,
    questTitle: questTitleFor(seed),
    bonusRewardPts: QUEST_BONUS_PTS,
  };
  if (parentReason !== undefined) quest.parentReason = parentReason;
  return quest;
}

/**
 * Build the fixed curated quest for one kid + day. Deterministic: same
 * inputs → same quest (stable across restarts). Mix follows the plan queue
 * priority — reteach first, then today focus, weak, review, and challenge
 * only when unlocked — with a deterministic within-group shuffle from the
 * day seed. Length is deterministic 10-12 from the seed.
 */
export function buildDailyQuest(input: BuildDailyQuestInput): Quest {
  const { profileId, dateISO, planState = null, catalog: _catalog = undefined } = input;
  void _catalog; // Accepted for the integrator catalog hook; mix draws from the plan queue.
  if (typeof profileId !== "string" || profileId.length === 0) {
    throw new Error("profileId must be a non-empty string");
  }
  if (typeof dateISO !== "string" || !isValidDateISO(dateISO)) {
    throw new Error(`dateISO must be a valid local date "YYYY-MM-DD", got ${JSON.stringify(dateISO)}`);
  }
  return buildWithSeed(profileId, dateISO, hashSeed(`${profileId}|${dateISO}`), planState ?? null);
}

/**
 * Lock the quest at first start. Idempotent: re-starting a locked quest
 * returns an equal quest with the ORIGINAL startedAt (items never change).
 */
export function startQuest(quest: Quest, startedAt: string): Quest {
  if (!quest || typeof quest.id !== "string") throw new Error("quest must be a built Quest");
  if (typeof startedAt !== "string" || startedAt.length === 0) throw new Error("startedAt must be a non-empty string");
  if (quest.startedAt) return { ...quest, items: quest.items.map((i) => ({ ...i })) };
  return { ...quest, items: quest.items.map((i) => ({ ...i })), startedAt };
}

/**
 * Mid-day stability gate: when a LOCKED quest for the same id already exists,
 * keep it verbatim (mastery shifts must not rewrite the day's items).
 * Otherwise build fresh (pre-start rebuilds reflect the latest plan).
 */
export function resolveDailyQuest(existing: Quest | null | undefined, input: BuildDailyQuestInput): Quest {
  if (existing && existing.id === questId(input.profileId, input.dateISO) && existing.startedAt) {
    return { ...existing, items: existing.items.map((i) => ({ ...i })) };
  }
  return buildDailyQuest(input);
}

/**
 * Parent override hook (integrator wires the button): rebuilds the SAME
 * day's quest with a new deterministic seed from profileId|dateISO|reason.
 * Same Quest shape, same id, fresh items/title, UNLOCKED (startedAt
 * cleared) so the family starts the new quest. `planState` selects the new
 * mix; omit it to reshuffle the current quest's items.
 */
export function regenerateQuest(input: {
  quest: Quest;
  reason: string;
  planState?: QuestPlanState | null;
  catalog?: unknown;
}): Quest {
  const { quest, reason, planState, catalog: _catalog = undefined } = input;
  void _catalog;
  if (!quest || typeof quest.profileId !== "string" || typeof quest.dateISO !== "string") {
    throw new Error("quest must be a built Quest");
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("reason must be a non-empty string (parent override note)");
  }
  const seed = hashSeed(`${quest.profileId}|${quest.dateISO}|${reason}`);
  const snapshot: QuestPlanState | null =
    planState !== undefined
      ? (planState ?? null)
      : {
          items: quest.items.map((i) => ({
            skillId: i.skillId,
            level: i.level,
            difficulty: i.difficulty,
            reason: i.reason,
          })),
        };
  return buildWithSeed(quest.profileId, quest.dateISO, seed, snapshot, reason);
}

/** True when `todayISO` is not the quest's day — missed days expire, no backlog. */
export function isQuestExpired(quest: Quest, todayISO: string): boolean {
  if (!quest || typeof quest.dateISO !== "string") throw new Error("quest must be a built Quest");
  if (typeof todayISO !== "string" || !isValidDateISO(todayISO)) {
    throw new Error(`todayISO must be a valid local date "YYYY-MM-DD", got ${JSON.stringify(todayISO)}`);
  }
  return quest.dateISO !== todayISO;
}

/** True once every quest item is solved. */
export function isQuestComplete(quest: Quest, solvedCount: number): boolean {
  if (!quest || !Array.isArray(quest.items)) throw new Error("quest must be a built Quest");
  if (!Number.isFinite(solvedCount)) return false;
  return Math.floor(solvedCount) >= quest.items.length;
}

/** Quest completion value at a streak (completion event + flat daily bonus, multiplier applies). */
export function pointsForQuestCompletion(streakDays: number): number {
  return pointsForEvents({ completions: 1, dailyBonus: true }, streakDays);
}

/** Next streak after finishing the quest today (reuses the existing gap rule). */
export function nextStreakAfterQuest(current: number, lastActiveDate: string, today: string): number {
  return nextStreakDays(current, lastActiveDate, today);
}

/**
 * Award quest completion: one completion event + daily bonus through the
 * existing rewards path (streak advance + multiplier handled there).
 * Throws when the quest is expired for `today` or already complete-checks fail upstream.
 */
export function awardQuestCompletion(state: PointsState, quest: Quest, today: string): PointsState {
  if (isQuestExpired(quest, today)) throw new Error(`quest ${quest.id} expired: belongs to ${quest.dateISO}, today is ${today}`);
  return recordActivity(state, today, { completions: 1, dailyBonus: true });
}

/** Serialize a quest to a JSON string (all fields are plain JSON). */
export function serializeQuest(quest: Quest): string {
  return JSON.stringify(quest);
}

/** Parse + validate a serialized quest; throws on version mismatch or bad shape. */
export function deserializeQuest(json: string): Quest {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") throw new Error("invalid quest JSON");
  if (raw["version"] !== QUEST_VERSION) {
    throw new Error(`quest version mismatch: expected ${QUEST_VERSION}, got ${JSON.stringify(raw["version"])}`);
  }
  const quest = raw as unknown as Quest;
  if (typeof quest.id !== "string" || !Array.isArray(quest.items)) throw new Error("invalid quest shape");
  if (
    quest.items.length < QUEST_MIN_ITEMS ||
    quest.items.length > QUEST_MAX_ITEMS ||
    typeof quest.seed !== "number" ||
    typeof quest.questTitle !== "string" ||
    typeof quest.bonusRewardPts !== "number"
  ) {
    throw new Error("invalid quest shape");
  }
  return quest;
}
