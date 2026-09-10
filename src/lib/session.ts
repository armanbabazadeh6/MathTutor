import type { SkillDomain } from "./skills";
import { SKILLS, SKILL_DOMAINS } from "./skills";
import { ALL_SKILLS as ALL_GENERATOR_SKILLS, generateProblem } from "./math/generators";
import type { AnswerType, MasteryMap } from "./math/types";
import { inferAnswerType, isCorrectAnswer } from "./math/answers";
import { buildPlan, MAX_PER_SKILL_PER_PLAN } from "./plan/plan";
import type { Plan, PlanReason } from "./plan/plan";
import { DEFAULT_LEVEL, DEFAULT_MASTERY, clampLevel, levelToDifficulty } from "./plan/levels";
import type { LevelsMap, SkillLevel } from "./plan/levels";
import { applyRulesForSkill } from "./plan/rules";
import type { LevelUpdate, SkillHistoryEntry } from "./plan/rules";
import { recordActivity } from "./rewards/earning";
import type { EarnEvents } from "./rewards/earning";
import { emptyPointsState } from "./rewards/types";
import type { PointsState } from "./rewards/types";
import { profileKey } from "./profile/store";
import {
  awardQuestCompletion,
  isQuestComplete,
  isQuestExpired,
  regenerateQuest,
  resolveDailyQuest,
  startQuest,
} from "./quest/quest";
import type { Quest, QuestPlanState } from "./quest/quest";
export type { Quest, QuestPlanState };
export { QUEST_ASSIGNMENT_NOTE } from "./quest/quest";
import {
  domainGraduationStatus,
  globalGraduationStatus,
  graduatedDomains,
} from "./plan/graduation";
export { globalGraduationStatus, graduatedDomains, domainGraduationStatus };

// NOTE (future DB persist): assignments/results currently live in localStorage
// only. When supabase/ lands, persist AssignmentState + PracticeResult rows
// keyed by assignment.id (see saveAssignment/saveLastResult call sites).

export interface GeneratedProblem {
  id: string;
  domain: SkillDomain;
  skillId: string;
  skillName: string;
  prompt: string;
  /** Canonical answer, graded by isCorrectAnswer against answerType. */
  answer: string;
  /** Canonical grading dispatch. Legacy stored problems omit it (inferred). */
  answerType: AnswerType;
  hint1: string;
  hint2: string;
  explanation: string;
  /** Plan level this problem was generated at (drives real difficulty). */
  level: SkillLevel;
  /** Why the plan picked this skill. */
  reason: PlanReason;
  /**
   * Set when the plan asked for a different skill than the one served
   * (a generator-less skill, or a topic outside the picked domains).
   * Lets the UI be honest instead of silently relabelling the problem.
   */
  intendedSkillId?: string;
  intendedSkillName?: string;
}

export interface AssignmentState {
  id: string;
  createdAt: number;
  label: string;
  domains: SkillDomain[];
  customTopic: string;
  problems: GeneratedProblem[];
}

export interface ProblemAttempt {
  problemId: string;
  domain: SkillDomain;
  /** Which skill this attempt actually exercised (was missing, so results could not name a skill). */
  skillId: string;
  skillName: string;
  /** Plan level the problem was generated at. */
  level: SkillLevel;
  attemptsUsed: number;
  solved: boolean;
  correctFirstTry: boolean;
  timeMs: number;
  /** Level transition this attempt triggered, when it crossed a threshold. */
  levelFrom?: SkillLevel;
  levelTo?: SkillLevel;
  /** True when `levelTo > levelFrom`. */
  promoted?: boolean;
  /** True when `levelTo < levelFrom`. */
  demoted?: boolean;
  /** True when the attempt flagged the skill for reteaching. */
  needsReteach?: boolean;
}

export interface PracticeResult {
  assignmentId: string;
  finishedAt: number;
  total: number;
  solved: number;
  correctFirst: number;
  accuracy: number;
  perDomain: { domain: SkillDomain; domainName: string; total: number; solved: number }[];
  xpEarned: number;
  attempts: ProblemAttempt[];
  /** Deduped per-skill level transitions from this session, in first-seen order. */
  levelChanges: {
    skillId: string;
    skillName: string;
    from: SkillLevel;
    to: SkillLevel;
    direction: "up" | "down";
  }[];
  /** Skills this session flagged for reteaching. */
  reteachSkills: { skillId: string; skillName: string }[];
}

export interface ProgressState {
  xp: number;
  streakCount: number;
  lastPlayedDate: string; // yyyy-mm-dd or ""
  sessionsCompleted: number;
  perfectSessions: number;
  domainStats: Record<SkillDomain, { attempts: number; correctFirst: number; solved: number }>;
  badges: string[];
}

const ASSIGNMENT_KEY = "mt.assignment.v1";
const RESULT_KEY = "mt.lastResult.v1";
const PROGRESS_KEY = "mt.progress.v1";
const NEW_BADGES_KEY = "mt.newBadges.v1";
// ---------- per-profile namespacing ----------
//
// Every persisted store below is namespaced by the active kid profile via
// profileKey(): mt.p.<profileId>.<suffix>. With no active profile the legacy
// un-namespaced key is used (pre-migration reads). The one-time legacy ->
// namespaced adoption lives in lib/profile/store.ts migrateLegacyOnce()
// (legacy keys are kept as backup); loads below also fall back to the legacy
// key so stats still show before migration runs. Writers always target the
// resolved key. Pass an explicit profileId to read/write another profile
// (stats, backup); pass null to force the legacy key.
const PROFILE_DOC_KEY = "mt.profiles.v1";
/** Active kid profile id, or null when none (server, no profiles, pre-migration). Never throws. */
export function currentProfileId(): string | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_DOC_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw) as { activeProfileId?: unknown; profiles?: Array<{ id?: unknown }> };
    const id = doc?.activeProfileId;
    if (typeof id !== "string") return null;
    return Array.isArray(doc.profiles) && doc.profiles.some((p) => p?.id === id) ? id : null;
  } catch {
    return null;
  }
}
/**
 * Resolve an explicit profileId param: undefined -> active profile,
 * null -> legacy key, string -> that profile.
 */
function resolveProfileId(explicit?: string | null): string | null {
  if (explicit !== undefined) return explicit;
  return currentProfileId();
}
function readStored(baseKey: string, profileId?: string | null): string | null {
  if (!canStore()) return null;
  try {
    const pid = resolveProfileId(profileId);
    if (!pid) return window.localStorage.getItem(baseKey);
    const namespaced = window.localStorage.getItem(profileKey(baseKey.replace(/^mt\./, ""), pid));
    if (namespaced !== null) return namespaced;
    // Pre-migration fallback: legacy keys are truth only while no profile
    // exists yet. Once profiles exist the legacy payload belongs to the
    // adopted profile, so a missing namespaced key means "fresh kid".
    if (hasProfiles()) return null;
    return window.localStorage.getItem(baseKey);
  } catch {
    return null;
  }
}
/** True when at least one kid profile exists. Never throws. */
function hasProfiles(): boolean {
  try {
    const raw = window.localStorage.getItem(PROFILE_DOC_KEY);
    if (!raw) return false;
    const doc = JSON.parse(raw) as { profiles?: unknown };
    return Array.isArray(doc.profiles) && doc.profiles.length > 0;
  } catch {
    return false;
  }
}
function writeStored(baseKey: string, value: string, profileId?: string | null): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(profileKey(baseKey.replace(/^mt\./, ""), resolveProfileId(profileId)), value);
  } catch {
    /* storage full/blocked: session still works in memory */
  }
}
function removeStored(baseKey: string, profileId?: string | null): void {
  if (!canStore()) return;
  try {
    window.localStorage.removeItem(profileKey(baseKey.replace(/^mt\./, ""), resolveProfileId(profileId)));
  } catch {
    /* noop */
  }
}

const ALL_DOMAINS: SkillDomain[] = SKILL_DOMAINS.map((d) => d.id);

function emptyDomainStats(): ProgressState["domainStats"] {
  return {
    "operations-algebraic": { attempts: 0, correctFirst: 0, solved: 0 },
    "base-ten": { attempts: 0, correctFirst: 0, solved: 0 },
    fractions: { attempts: 0, correctFirst: 0, solved: 0 },
    "measurement-data": { attempts: 0, correctFirst: 0, solved: 0 },
    geometry: { attempts: 0, correctFirst: 0, solved: 0 },
  };
}

export function emptyProgress(): ProgressState {
  return {
    xp: 0,
    streakCount: 0,
    lastPlayedDate: "",
    sessionsCompleted: 0,
    perfectSessions: 0,
    domainStats: emptyDomainStats(),
    badges: [],
  };
}
/** Legacy float parser kept for reference; grading no longer uses it. */
export function parseAnswer(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;
  // Mixed number "1_1/2" or "11/2"? Accept "a/b" and "w_n/d" forms.
  const mixed = /^(\d+)[_ ](\d+)\/(\d+)$/.exec(raw.trim());
  if (mixed) {
    const w = Number(mixed[1]);
    const n = Number(mixed[2]);
    const d = Number(mixed[3]);
    if (!d) return null;
    return w + n / d;
  }
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length !== 2) return null;
    const n = Number(parts[0]);
    const d = Number(parts[1]);
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return n / d;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/**
 * Canonical grading for session problems: dispatches on the problem's
 * answerType via isCorrectAnswer (same fn as teach-check). Legacy
 * problems without a stored type infer it from the expected answer.
 */
export function checkAnswer(input: string, expected: string, answerType?: AnswerType): boolean {
  return isCorrectAnswer(expected, input, answerType ?? inferAnswerType(expected));
}

// ---------- local problem composer (plan-driven; see generateAssignment) ----------

function rnd(n: number): number {
  return Math.floor(Math.random() * n);
}


export function skillFor(domain: SkillDomain): { id: string; name: string } {
  const inDomain = SKILLS.filter((s) => s.domain === domain);
  const s = inDomain.length ? inDomain[rnd(inDomain.length)] : SKILLS[0];
  return { id: s.id, name: s.name };
}

function skillDomainOf(skillId: string): SkillDomain {
  return SKILLS.find((s) => s.id === skillId)?.domain ?? ALL_DOMAINS[0];
}

function skillNameOf(skillId: string): string {
  return SKILLS.find((s) => s.id === skillId)?.name ?? skillId;
}

/**
 * Plan-driven assignment builder. Consumes the persisted plan queue
 * (levels + mastery + history via buildPlan) instead of a fixed topic mix:
 * each queue item fixes (skillId, level, difficulty) and one deterministic
 * generator problem is minted per item. The plan registry (45 skills) is
 * wider than the deterministic generators (see ALL_SKILLS), so queue items
 * without a generator are skipped and the shortfall tops up from the
 * weakest supported skills. Items outside the picked domains are swapped to
 * the weakest picked-domain supported skill with per-skill headroom, so the
 * Today picker still scopes topics while difficulty follows the plan. The
 * plan's MAX_PER_SKILL_PER_PLAN cap bounds repeats.
 */
export function generateAssignment(
  domains: SkillDomain[],
  customTopic = "",
  count = 10,
  profileId?: string | null,
): AssignmentState {
  const active = domains.length ? domains : ALL_DOMAINS;
  const n = Math.max(1, Math.floor(count));
  const session = loadPlanSession(profileId);
  const supported = new Set(ALL_GENERATOR_SKILLS);
  const inActive = SKILLS.filter((s) => active.includes(s.domain) && supported.has(s.id));
  const supportedAll = SKILLS.filter((s) => supported.has(s.id));
  const byMastery = (a: { id: string }, b: { id: string }) =>
    (session.mastery[a.id] ?? DEFAULT_MASTERY) - (session.mastery[b.id] ?? DEFAULT_MASTERY);
  const weakestActive = [...inActive].sort(byMastery)[0] ?? supportedAll[0] ?? SKILLS[0];
  const plan = buildPlan({
    levelsMap: session.levels,
    masteryMap: session.mastery,
    history: session.history,
    promotedAtStreakMap: session.promotedAtStreak,
    demotedAtExhaustedMap: session.demotedAtExhausted,
    todayTopic: weakestActive.id,
    size: n,
  });
  const used: Record<string, number> = {};
  const queue = plan.items.filter((item) => supported.has(item.skillId));
  // Top up from weakest supported skills when the plan queue is short.
  const topUpPool = [...supportedAll].sort(byMastery);
  for (const s of topUpPool) {
    if (queue.length >= n) break;
    if ((used[s.id] ?? 0) >= MAX_PER_SKILL_PER_PLAN) continue;
    const copies = queue.filter((q) => q.skillId === s.id).length;
    if (copies >= MAX_PER_SKILL_PER_PLAN) continue;
    queue.push({
      skillId: s.id,
      level: clampLevel(session.levels[s.id] ?? DEFAULT_LEVEL),
      difficulty: levelToDifficulty(clampLevel(session.levels[s.id] ?? DEFAULT_LEVEL)),
      reason: "weak",
    });
  }
  const problems: GeneratedProblem[] = queue.slice(0, n).map((item, i) => {
    // The plan may pick a skill outside the topics the kid tapped. Substitute
    // within the tapped domains, but record the intent so the UI can say so
    // rather than silently relabelling the problem.
    const subPool = inActive.length ? inActive : supportedAll;
    const intendedSkillId = item.skillId;
    let skillId = item.skillId;
    if (!active.includes(skillDomainOf(skillId))) {
      const sub =
        [...subPool].sort(byMastery).find((c) => (used[c.id] ?? 0) < MAX_PER_SKILL_PER_PLAN) ??
        weakestActive;
      skillId = sub.id;
    }
    used[skillId] = (used[skillId] ?? 0) + 1;
    const level = clampLevel(session.levels[skillId] ?? item.level ?? DEFAULT_LEVEL);
    const p = generateProblem(skillId, Math.floor(Math.random() * 2 ** 31) + i * 7919, level);
    return {
      id: `p-${Date.now()}-${i}-${rnd(1e6)}`,
      domain: skillDomainOf(skillId),
      skillId,
      skillName: skillNameOf(skillId),
      prompt: p.text,
      answer: p.answer,
      answerType: p.answerType,
      hint1: p.hint1,
      hint2: p.hint2,
      explanation: p.explanation,
      level,
      reason: item.reason,
      ...(skillId === intendedSkillId
        ? {}
        : { intendedSkillId, intendedSkillName: skillNameOf(intendedSkillId) }),
    };
  });
  const names = active
    .map((d) => SKILL_DOMAINS.find((x) => x.id === d)?.name ?? d)
    .join(" · ");
  return {
    id: `a-${Date.now()}-${rnd(1e6)}`,
    createdAt: Date.now(),
    label: customTopic.trim() || names,
    domains: active,
    customTopic: customTopic.trim(),
    problems,
  };
}

// ---------- storage (localStorage, client only) ----------

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function saveAssignment(a: AssignmentState, profileId?: string | null): void {
  writeStored(ASSIGNMENT_KEY, JSON.stringify(a), profileId);
}

/**
 * Repairs a stored assignment so every problem satisfies the current
 * `GeneratedProblem` contract. Problems saved before the plan-level work carry
 * no `level`, `reason`, or `answerType`, and reading them unchecked would put
 * `undefined` where the type promises a value (and where the UI renders it).
 */
function normalizeStoredProblems(list: unknown): GeneratedProblem[] {
  if (!Array.isArray(list)) return [];
  const out: GeneratedProblem[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Partial<GeneratedProblem>;
    if (typeof p.id !== "string" || typeof p.prompt !== "string" || typeof p.answer !== "string") continue;
    const skillId = typeof p.skillId === "string" ? p.skillId : "";
    out.push({
      id: p.id,
      domain: (p.domain ?? skillDomainOf(skillId)) as SkillDomain,
      skillId,
      skillName: typeof p.skillName === "string" && p.skillName ? p.skillName : skillNameOf(skillId),
      prompt: p.prompt,
      answer: p.answer,
      answerType: p.answerType ?? inferAnswerType(p.answer),
      hint1: typeof p.hint1 === "string" ? p.hint1 : "",
      hint2: typeof p.hint2 === "string" ? p.hint2 : "",
      explanation: typeof p.explanation === "string" ? p.explanation : "",
      level: clampLevel(typeof p.level === "number" ? p.level : DEFAULT_LEVEL),
      reason: p.reason ?? "today",
      ...(typeof p.intendedSkillId === "string"
        ? { intendedSkillId: p.intendedSkillId, intendedSkillName: p.intendedSkillName ?? skillNameOf(p.intendedSkillId) }
        : {}),
    });
  }
  return out;
}

export function loadAssignment(profileId?: string | null): AssignmentState | null {
  try {
    const raw = readStored(ASSIGNMENT_KEY, profileId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssignmentState;
    const problems = normalizeStoredProblems(parsed?.problems);
    if (!parsed || !problems.length) return null;
    return { ...parsed, problems };
  } catch {
    return null;
  }
}

export function clearAssignment(profileId?: string | null): void {
  removeStored(ASSIGNMENT_KEY, profileId);
}

export function saveLastResult(r: PracticeResult, profileId?: string | null): void {
  writeStored(RESULT_KEY, JSON.stringify(r), profileId);
}

export function loadLastResult(profileId?: string | null): PracticeResult | null {
  try {
    const raw = readStored(RESULT_KEY, profileId);
    if (!raw) return null;
    return JSON.parse(raw) as PracticeResult;
  } catch {
    return null;
  }
}

export function loadProgress(profileId?: string | null): ProgressState {
  try {
    const raw = readStored(PROGRESS_KEY, profileId);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as ProgressState;
    return { ...emptyProgress(), ...parsed, domainStats: { ...emptyDomainStats(), ...parsed.domainStats } };
  } catch {
    return emptyProgress();
  }
}

function saveProgress(p: ProgressState, profileId?: string | null): void {
  writeStored(PROGRESS_KEY, JSON.stringify(p), profileId);
}

function todayStr(): string {
  return localDateISO();
}
/** Local "YYYY-MM-DD" one calendar day before the given local date. */
function dayBefore(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() - 1);
  return localDateISO(d);
}

export interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const BADGES: BadgeDef[] = [
  { id: "first-session", name: "First Steps", emoji: "🌱", description: "Finish your first practice session." },
  { id: "perfect-10", name: "Perfect 10", emoji: "⭐", description: "Get every problem right on the first try." },
  { id: "streak-3", name: "3-Day Streak", emoji: "🔥", description: "Practice 3 days in a row." },
  { id: "streak-7", name: "Week Warrior", emoji: "🏆", description: "Practice 7 days in a row." },
  { id: "xp-100", name: "Century Club", emoji: "💯", description: "Earn 100 total XP." },
  { id: "xp-500", name: "Math Explorer", emoji: "🚀", description: "Earn 500 total XP." },
  { id: "fraction-friend", name: "Fraction Friend", emoji: "🍕", description: "Solve 5 fraction problems." },
  { id: "persistent", name: "Never Give Up", emoji: "💪", description: "Get a problem right after using a hint." },
];

export function badgeById(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id);
}

/** Options for recordResult: quest completion pays the quest bonus, extra practice skips the streak. */
export interface RecordResultOpts {
  /** Fixed daily quest this result belongs to. Full solve pays bonus + streak via the quest rules. */
  quest?: Quest | null;
  /** Local "YYYY-MM-DD" for quest expiry checks. Defaults to today. */
  today?: string;
  /**
   * False for optional extra practice (and partial quests): progress and
   * standard completion points still save, but the day streak does not
   * advance. Defaults to true. Per-problem first-try/level-up stars from
   * `recordGradedAttempt` are unaffected (effort always counts).
   */
  countStreak?: boolean;
}

export function recordResult(
  result: PracticeResult,
  profileId?: string | null,
  opts?: RecordResultOpts,
): { progress: ProgressState; newBadges: string[]; points: PointsState } {
  const progress = loadProgress(profileId);
  const before = new Set(progress.badges);

  progress.sessionsCompleted += 1;
  progress.xp += result.xpEarned;
  if (result.solved === result.total && result.total > 0) progress.perfectSessions += 1;

  const countStreak = opts?.countStreak !== false;
  const today = opts?.today ?? todayStr();
  if (countStreak && progress.lastPlayedDate !== today) {
    progress.streakCount = progress.lastPlayedDate === dayBefore(today) ? progress.streakCount + 1 : 1;
    progress.lastPlayedDate = today;
  }

  for (const a of result.attempts) {
    const st = progress.domainStats[a.domain];
    if (!st) continue;
    st.attempts += 1;
    if (a.correctFirstTry) st.correctFirst += 1;
    if (a.solved) st.solved += 1;
  }

  const award = (id: string) => {
    if (!progress.badges.includes(id)) progress.badges.push(id);
  };
  if (progress.sessionsCompleted >= 1) award("first-session");
  if (result.correctFirst === result.total && result.total > 0) award("perfect-10");
  if (progress.streakCount >= 3) award("streak-3");
  if (progress.streakCount >= 7) award("streak-7");
  if (progress.xp >= 100) award("xp-100");
  if (progress.xp >= 500) award("xp-500");
  if ((progress.domainStats.fractions?.solved ?? 0) >= 5) award("fraction-friend");
  if (result.attempts.some((a) => a.solved && a.attemptsUsed > 1)) award("persistent");

  saveProgress(progress, profileId);
  const quest = opts?.quest ?? null;
  let points: PointsState;
  if (
    quest &&
    result.solved === result.total &&
    result.total > 0 &&
    isQuestComplete(quest, result.solved) &&
    !isQuestExpired(quest, today)
  ) {
    // Full quest solve: one completion event + daily bonus through the
    // canonical quest path (streak advance + multiplier handled there).
    points = awardQuestCompletion(loadPointsState(profileId), quest, today);
    savePointsState(points, profileId);
    markQuestComplete(quest.id, profileId);
  } else if (!countStreak) {
    points = awardPointsNoStreak({ completions: 1 }, today, profileId);
  } else {
    points = awardPoints({ completions: 1 }, undefined, profileId);
  }
  return { progress, newBadges: progress.badges.filter((b) => !before.has(b)), points };
}

// ---------- points wallet (rewards/earning accrual, versioned) ----------

/** Storage version for the points wallet. Bump on breaking shape changes. */
export const POINTS_VERSION = 1;
const POINTS_KEY = "mt.points.v1";

interface PointsDoc {
  version: number;
  state: PointsState;
}

function isPointsState(v: unknown): v is PointsState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.balance === "number" &&
    typeof s.lifetime === "number" &&
    typeof s.streakDays === "number" &&
    typeof s.lastActiveDate === "string" &&
    Array.isArray(s.history)
  );
}

/** Loads the persisted points wallet. Missing/corrupt/version-mismatched payloads start empty. */
export function loadPointsState(profileId?: string | null): PointsState {
  try {
    const raw = readStored(POINTS_KEY, profileId);
    if (!raw) return emptyPointsState();
    const parsed = JSON.parse(raw) as Partial<PointsDoc>;
    if (parsed.version !== POINTS_VERSION || !isPointsState(parsed.state)) return emptyPointsState();
    return parsed.state;
  } catch {
    return emptyPointsState();
  }
}

export function savePointsState(s: PointsState, profileId?: string | null): void {
  const doc: PointsDoc = { version: POINTS_VERSION, state: s };
  writeStored(POINTS_KEY, JSON.stringify(doc), profileId);
}

/**
 * Awards points for play events via the canonical earning rules. Advances
 * the points streak by active date and grants the once-per-day bonus on a
 * new active date. Persists the wallet and returns the updated state.
 */
export function awardPoints(events: EarnEvents, today = todayStr(), profileId?: string | null): PointsState {
  const current = loadPointsState(profileId);
  const next = recordActivity(current, today, {
    ...events,
    dailyBonus: events.dailyBonus ?? current.lastActiveDate !== today,
  });
  savePointsState(next, profileId);
  return next;
}

/** Mastery 0..100 per domain from first-try accuracy (needs ≥3 attempts to register). */
export function masteryFor(stats: ProgressState["domainStats"]): Record<SkillDomain, number> {
  const out = {} as Record<SkillDomain, number>;
  for (const d of ALL_DOMAINS) {
    const st = stats[d];
    out[d] = st.attempts >= 3 ? Math.round((st.correctFirst / st.attempts) * 100) : 0;
  }
  return out;
}

export function xpForResult(attempts: ProblemAttempt[]): number {
  let xp = 0;
  for (const a of attempts) {
    if (a.solved) xp += 10;
    if (a.correctFirstTry) xp += 5;
  }
  if (attempts.length > 0 && attempts.every((a) => a.correctFirstTry)) xp += 20;
  return xp;
}
export function saveNewBadges(ids: string[], profileId?: string | null): void {
  writeStored(NEW_BADGES_KEY, JSON.stringify(ids), profileId);
}

export function loadNewBadges(profileId?: string | null): string[] {
  try {
    const raw = readStored(NEW_BADGES_KEY, profileId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ---------- adaptive plan session (levels + streaks + history, versioned) ----------

/** Storage version for the plan session. Bump on breaking shape changes. */
export const PLAN_SESSION_VERSION = 2;
const PLAN_SESSION_KEY = "mt.planSession.v2";
/** Chronological history cap; rules only read the recent window. */
const MAX_HISTORY = 300;

/** Per-skill consecutive outcome counters driving the plan rules. */
export interface SkillStreaks {
  correct: number;
  incorrect: number;
}

export interface PlanSessionState {
  version: typeof PLAN_SESSION_VERSION;
  levels: LevelsMap;
  mastery: MasteryMap;
  /** Chronological graded outcomes across skills (oldest first). */
  history: SkillHistoryEntry[];
  streaks: Record<string, SkillStreaks>;
  /** Skill ids flagged for reteaching at the lowered level. */
  reteachQueue: string[];
  /**
   * Per-skill streak length consumed by the last promotion. Fed back into the
   * rules so a run promotes once per crossing instead of on every event.
   * Absent/legacy entries read as 0 (nothing consumed yet).
   */
  promotedAtStreak: Record<string, number>;
  /** Per-skill exhausted-count consumed by the last demotion. Same idea. */
  demotedAtExhausted: Record<string, number>;
}

export function emptyPlanSession(): PlanSessionState {
  return {
    version: PLAN_SESSION_VERSION,
    levels: {},
    mastery: {},
    history: [],
    streaks: {},
    reteachQueue: [],
    promotedAtStreak: {},
    demotedAtExhausted: {},
  };
}

/** Coerce a persisted map of string -> finite non-negative count. */
function normalizeCountMap(raw: unknown): Record<string, number> {
  if (!isStreakRecord(raw) || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = toCount(v);
  return out;
}

interface RawStreaks {
  correct?: unknown;
  incorrect?: unknown;
}

function isStreakRecord(v: unknown): v is RawStreaks {
  return !!v && typeof v === "object";
}

function toCount(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

function normalizeStreaks(raw: unknown): Record<string, SkillStreaks> {
  if (!isStreakRecord(raw) || Array.isArray(raw)) return {};
  const out: Record<string, SkillStreaks> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isStreakRecord(v)) continue;
    out[k] = { correct: toCount(v.correct), incorrect: toCount(v.incorrect) };
  }
  return out;
}

interface RawHistoryEntry {
  skillId?: unknown;
  firstTryCorrect?: unknown;
  exhaustedAttempts?: unknown;
  correct?: unknown;
  usedHint?: unknown;
  at?: unknown;
}

function toBool(v: unknown): boolean {
  return v === true;
}

function normalizeHistory(raw: unknown): SkillHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SkillHistoryEntry[] = [];
  for (const e of raw) {
    if (!isStreakRecord(e)) continue;
    const entry: RawHistoryEntry = e;
    if (typeof entry.skillId !== "string" || typeof entry.correct !== "boolean") continue;
    out.push({
      skillId: entry.skillId,
      firstTryCorrect: toBool(entry.firstTryCorrect),
      exhaustedAttempts: toBool(entry.exhaustedAttempts),
      correct: entry.correct,
      usedHint: toBool(entry.usedHint),
      // Legacy entries predate timestamps; leave undefined so the scheduler
      // falls back to index order instead of inventing a date.
      ...(typeof entry.at === "number" && Number.isFinite(entry.at) ? { at: entry.at } : {}),
    });
  }
  return out;
}
/**
 * Loads the persisted plan session. Version-mismatched or missing payloads
 * migrate to a cold start (all skills default level/mastery); legacy
 * assignment/progress keys are left untouched.
 */
export function loadPlanSession(profileId?: string | null): PlanSessionState {
  try {
    const raw = readStored(PLAN_SESSION_KEY, profileId);
    if (!raw) return emptyPlanSession();
    const parsed = JSON.parse(raw) as Partial<PlanSessionState>;
    if (parsed.version !== PLAN_SESSION_VERSION) return emptyPlanSession();
    return {
      version: PLAN_SESSION_VERSION,
      levels: parsed.levels ?? {},
      mastery: parsed.mastery ?? {},
      history: normalizeHistory(parsed.history).slice(-MAX_HISTORY),
      streaks: normalizeStreaks(parsed.streaks),
      reteachQueue: Array.isArray(parsed.reteachQueue)
        ? parsed.reteachQueue.filter((x): x is string => typeof x === "string")
        : [],
      promotedAtStreak: normalizeCountMap(parsed.promotedAtStreak),
      demotedAtExhausted: normalizeCountMap(parsed.demotedAtExhausted),
    };
  } catch {
    return emptyPlanSession();
  }
}

export function savePlanSession(s: PlanSessionState, profileId?: string | null): void {
  writeStored(PLAN_SESSION_KEY, JSON.stringify(s), profileId);
}

export interface GradedOutcome extends LevelUpdate {
  state: PlanSessionState;
  points: PointsState;
}

function applyToSession(s: PlanSessionState, entry: SkillHistoryEntry): LevelUpdate {
  const stamped: SkillHistoryEntry = entry.at === undefined ? { ...entry, at: Date.now() } : entry;
  s.history.push(stamped);
  if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
  const skillId = stamped.skillId;
  const streak = s.streaks[skillId] ?? { correct: 0, incorrect: 0 };
  if (stamped.correct) {
    streak.correct += 1;
    streak.incorrect = 0;
  } else {
    streak.incorrect += 1;
    streak.correct = 0;
  }
  s.streaks[skillId] = streak;
  const res = applyRulesForSkill({
    level: s.levels[skillId] ?? DEFAULT_LEVEL,
    mastery: s.mastery[skillId] ?? DEFAULT_MASTERY,
    recent: s.history.filter((h) => h.skillId === skillId),
    promotedAtStreak: s.promotedAtStreak[skillId],
    demotedAtExhausted: s.demotedAtExhausted[skillId],
  });
  s.levels[skillId] = res.level;
  s.mastery[skillId] = res.mastery;
  s.promotedAtStreak[skillId] = res.promotedAtStreak;
  s.demotedAtExhausted[skillId] = res.demotedAtExhausted;
  if (res.reteach && !s.reteachQueue.includes(skillId)) s.reteachQueue.push(skillId);
  if (res.promoted) s.reteachQueue = s.reteachQueue.filter((q) => q !== skillId);
  return res;
}

/** Effort-points option: false keeps the day streak frozen (extra practice). Defaults to true. */
export interface EffortPointsOpts {
  countStreak?: boolean;
  today?: string;
}

/**
 * Records one graded problem attempt: appends history, rolls the
 * consecutive-correct/incorrect counters, and re-applies the plan
 * promotion/demotion rules for that skill. Persists the session.
 */
export function recordGradedAttempt(
  entry: SkillHistoryEntry,
  profileId?: string | null,
  opts?: EffortPointsOpts,
): GradedOutcome {
  const s = loadPlanSession(profileId);
  const res = applyToSession(s, entry);
  savePlanSession(s, profileId);
  const events = {
    firstTryCorrect: entry.firstTryCorrect ? 1 : 0,
    levelUps: res.promoted ? 1 : 0,
  };
  const points =
    opts?.countStreak === false
      ? awardPointsNoStreak(events, opts?.today ?? todayStr(), profileId)
      : awardPoints(events, opts?.today ?? todayStr(), profileId);
  return { ...res, state: s, points };
}

/**
 * Records the outcome of the Teach Me check.
 *
 * A correct reteach answer counts as a first-try win: the check is a single
 * fresh question, and recording it as `firstTryCorrect: false` (the old
 * behaviour) meant a student could complete ten lessons perfectly and never
 * level up. An incorrect answer still keeps the run alive only when the
 * skill was answered, so it is logged as a miss.
 */
export function recordReteachOutcome(
  skillId: string,
  correct: boolean,
  profileId?: string | null,
  opts?: EffortPointsOpts,
): GradedOutcome {
  const s = loadPlanSession(profileId);
  const res = applyToSession(s, {
    skillId,
    firstTryCorrect: correct,
    exhaustedAttempts: false,
    correct,
    usedHint: !correct,
  });
  if (correct) s.reteachQueue = s.reteachQueue.filter((q) => q !== skillId);
  else if (!s.reteachQueue.includes(skillId)) s.reteachQueue.push(skillId);
  savePlanSession(s, profileId);
  const events = { levelUps: res.promoted ? 1 : 0 };
  const points =
    opts?.countStreak === false
      ? awardPointsNoStreak(events, opts?.today ?? todayStr(), profileId)
      : awardPoints(events, opts?.today ?? todayStr(), profileId);
  return { ...res, state: s, points };
}

/** Builds the live practice queue from the persisted plan session. */
export function currentPlan(size = 10, todayTopic?: string, profileId?: string | null): Plan {
  const s = loadPlanSession(profileId);
  return buildPlan({
    levelsMap: s.levels,
    masteryMap: s.mastery,
    history: s.history,
    promotedAtStreakMap: s.promotedAtStreak,
    demotedAtExhaustedMap: s.demotedAtExhausted,
    todayTopic,
    size,
  });
}

// ---------- daily quest state (fixed quest is THE assignment, versioned) ----------
//
// The quest of the day is THE assignment: same quest all day (stable across
// restarts via resolveDailyQuest, locked at first start), free-pick topics
// stay available only as optional extra practice. Extra practice still earns
// per-problem stars and standard completion points, but never the quest
// bonus and never advances the day streak. All keys are per-profile.

/** Storage version for the quest doc. Bump on breaking shape changes. */
export const QUEST_DOC_VERSION = 1;
const QUEST_KEY = "mt.quest.v1";
/** Quest-backed assignments carry this id prefix so practice can route completion. */
export const QUEST_ASSIGNMENT_PREFIX = "quest-";

/** Local "YYYY-MM-DD" (quest rollover is by calendar date). */
export function localDateISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface QuestDoc {
  version: number;
  quest: Quest | null;
  completed: string[];
}

function emptyQuestDoc(): QuestDoc {
  return { version: QUEST_DOC_VERSION, quest: null, completed: [] };
}

function isQuestDoc(v: unknown): v is QuestDoc {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  if (d["version"] !== QUEST_DOC_VERSION) return false;
  const q = d["quest"];
  if (q !== null && (typeof q !== "object" || typeof (q as Quest).id !== "string")) return false;
  return Array.isArray(d["completed"]);
}

function loadQuestDoc(profileId?: string | null): QuestDoc {
  if (!canStore()) return emptyQuestDoc();
  try {
    const raw = readStored(QUEST_KEY, profileId);
    if (!raw) return emptyQuestDoc();
    const parsed = JSON.parse(raw) as unknown;
    return isQuestDoc(parsed) ? parsed : emptyQuestDoc();
  } catch {
    return emptyQuestDoc();
  }
}

function saveQuestDoc(doc: QuestDoc, profileId?: string | null): void {
  writeStored(QUEST_KEY, JSON.stringify(doc), profileId);
}

/** Plan snapshot the quest mix draws from (queue order carries reteach-first priority). */
function questPlanSnapshot(profileId?: string | null): QuestPlanState {
  const s = loadPlanSession(profileId);
  const plan = buildPlan({
    levelsMap: s.levels,
    masteryMap: s.mastery,
    history: s.history,
    promotedAtStreakMap: s.promotedAtStreak,
    demotedAtExhaustedMap: s.demotedAtExhausted,
    size: 12,
  });
  return { items: plan.items, levels: s.levels };
}

/**
 * Fixed quest for one kid + day. Stable intraday: a locked quest for the
 * same id is returned verbatim even as mastery shifts; pre-start rebuilds
 * reflect the latest plan. Persists on first build.
 */
export function getDailyQuest(today = localDateISO(), profileId?: string | null): Quest {
  const pid = currentProfileId() ?? "solo";
  const doc = loadQuestDoc(profileId);
  const quest = resolveDailyQuest(doc.quest, {
    profileId: pid,
    dateISO: today,
    planState: questPlanSnapshot(profileId),
  });
  if (JSON.stringify(doc.quest) !== JSON.stringify(quest)) {
    doc.quest = quest;
    saveQuestDoc(doc, profileId);
  }
  return quest;
}

/** True when the assignment was minted from the fixed daily quest. */
export function isQuestAssignment(a: AssignmentState | null | undefined): boolean {
  return !!a && a.id.startsWith(QUEST_ASSIGNMENT_PREFIX);
}

/**
 * Mint deterministic problems for every quest item (seed + position), so
 * practice consumes the quest items 1:1. Skills without a deterministic
 * generator (e.g. geometry) fall back to the weakest supported skill in
 * the same domain at its plan level — practice never comes back empty.
 */
export function questToAssignment(quest: Quest, profileId?: string | null): AssignmentState {
  const session = loadPlanSession(profileId);
  const supported = new Set(ALL_GENERATOR_SKILLS);
  const byMastery = (a: { id: string }, b: { id: string }) =>
    (session.mastery[a.id] ?? DEFAULT_MASTERY) - (session.mastery[b.id] ?? DEFAULT_MASTERY);
  const supportedAll = SKILLS.filter((s) => supported.has(s.id));
  const weakestSupported = [...supportedAll].sort(byMastery)[0] ?? SKILLS[0];
  const problems: GeneratedProblem[] = quest.items.map((item) => {
    const intendedSkillId = item.skillId;
    let skillId = item.skillId;
    if (!supported.has(skillId)) {
      const domain = skillDomainOf(skillId);
      const inDomain = supportedAll.filter((s) => s.domain === domain).sort(byMastery);
      skillId = (inDomain[0] ?? weakestSupported).id;
    }
    const level = clampLevel(session.levels[skillId] ?? item.level ?? DEFAULT_LEVEL);
    const seed = ((quest.seed >>> 0) + item.position * 7919 + 7) >>> 0;
    const p = generateProblem(skillId, seed, level);
    return {
      id: `pq-${quest.seed}-${item.position}`,
      domain: skillDomainOf(skillId),
      skillId,
      skillName: skillNameOf(skillId),
      prompt: p.text,
      answer: p.answer,
      answerType: p.answerType,
      hint1: p.hint1,
      hint2: p.hint2,
      explanation: p.explanation,
      level,
      reason: item.reason,
      ...(skillId === intendedSkillId
        ? {}
        : { intendedSkillId, intendedSkillName: skillNameOf(intendedSkillId) }),
    };
  });
  const domains = Array.from(new Set(problems.map((p) => p.domain)));
  return {
    id: `${QUEST_ASSIGNMENT_PREFIX}${quest.id}`,
    createdAt: Date.now(),
    label: quest.questTitle,
    domains: domains.length ? domains : ALL_DOMAINS,
    customTopic: "",
    problems,
  };
}

/**
 * Start (or resume) today's quest: locks the quest at first start, mints
 * its assignment, and saves it. Same quest + same problems all day.
 */
export function startDailyQuest(
  today = localDateISO(),
  profileId?: string | null,
): { quest: Quest; assignment: AssignmentState } {
  const quest = startQuest(getDailyQuest(today, profileId), new Date().toISOString());
  const doc = loadQuestDoc(profileId);
  doc.quest = quest;
  saveQuestDoc(doc, profileId);
  const assignment = questToAssignment(quest, profileId);
  saveAssignment(assignment, profileId);
  return { quest, assignment };
}

/**
 * Parent override: rebuilds the SAME day's quest with a fresh deterministic
 * seed from profileId|date|reason. Requires a non-empty reason (the grown-up
 * notes why). The new quest is UNLOCKED and any stale quest assignment is
 * cleared so the family starts fresh.
 */
export function regenerateDailyQuest(
  reason: string,
  today = localDateISO(),
  profileId?: string | null,
): Quest {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("reason must be a non-empty string (parent override note)");
  }
  const quest = regenerateQuest({
    quest: getDailyQuest(today, profileId),
    reason: reason.trim(),
    planState: questPlanSnapshot(profileId),
  });
  const doc = loadQuestDoc(profileId);
  doc.quest = quest;
  saveQuestDoc(doc, profileId);
  const saved = loadAssignment(profileId);
  if (isQuestAssignment(saved)) clearAssignment(profileId);
  return quest;
}

/** True once the full quest was solved (bonus paid). */
export function isQuestDoneToday(questId: string, profileId?: string | null): boolean {
  return loadQuestDoc(profileId).completed.includes(questId);
}

function markQuestComplete(questId: string, profileId?: string | null): void {
  const doc = loadQuestDoc(profileId);
  if (!doc.completed.includes(questId)) {
    doc.completed.push(questId);
    saveQuestDoc(doc, profileId);
  }
}

/**
 * Standard completion points WITHOUT moving the day streak or granting the
 * auto daily bonus: the extra-practice path. Same event math on the current
 * streak, history notes it as extra practice.
 */
function awardPointsNoStreak(events: EarnEvents, today: string, profileId?: string | null): PointsState {
  const current = loadPointsState(profileId);
  const preview = recordActivity(current, today, { ...events, dailyBonus: false });
  const delta = preview.balance - current.balance;
  const next: PointsState = {
    ...current,
    balance: current.balance + delta,
    lifetime: current.lifetime + delta,
    history:
      delta !== 0 || current.lastActiveDate !== today
        ? [...current.history, { date: today, kind: "grant", points: delta, note: "extra practice" }]
        : current.history,
  };
  savePointsState(next, profileId);
  return next;
}

// ---------- grade overrides + graduation views (parent controls, per-profile) ----------

const GRADE_OVERRIDE_KEY = "mt.gradeOverrides.v1";

/** Parent lock/unlock per domain: "unlocked" forces graduated, "locked" forces not. Absent = by mastery. */
export type GradeOverride = "locked" | "unlocked";

function isOverrideRecord(v: unknown): v is Record<string, GradeOverride> {
  if (!v || typeof v !== "object") return false;
  return Object.values(v as Record<string, unknown>).every((x) => x === "locked" || x === "unlocked");
}

/** Parent-set domain locks. Missing/corrupt payloads read as no overrides. */
export function getGradeOverrides(profileId?: string | null): Record<string, GradeOverride> {
  if (!canStore()) return {};
  try {
    const raw = readStored(GRADE_OVERRIDE_KEY, profileId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return isOverrideRecord(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

/** Set (or clear with null) a parent lock for one domain. Returns the updated map. */
export function setGradeOverride(
  domain: SkillDomain,
  value: GradeOverride | null,
  profileId?: string | null,
): Record<string, GradeOverride> {
  const next = getGradeOverrides(profileId);
  if (value === null) delete next[domain];
  else next[domain] = value;
  writeStored(GRADE_OVERRIDE_KEY, JSON.stringify(next), profileId);
  return next;
}

export interface DomainGradeView {
  domain: SkillDomain;
  avgLevel: number;
  avgMastery: number;
  coverage: number;
  qualifying: number;
  total: number;
  graduated: boolean;
  /** True when a parent lock decided this (not mastery). */
  overridden: boolean;
  grade5Count: number;
  grade5Total: number;
}

/** Per-domain grade progress with parent locks applied. Pure read of plan + override stores. */
export function gradeViews(profileId?: string | null): DomainGradeView[] {
  const s = loadPlanSession(profileId);
  const overrides = getGradeOverrides(profileId);
  return SKILL_DOMAINS.map((d) => {
    const st = domainGraduationStatus(d.id, s.levels, s.mastery);
    const override = overrides[d.id];
    const g5 = SKILLS.filter((sk) => sk.domain === d.id && sk.grade === 5);
    return {
      domain: d.id,
      avgLevel: st.avgLevel,
      avgMastery: st.avgMastery,
      coverage: st.coverage,
      qualifying: st.qualifying,
      total: st.total,
      graduated: override === "unlocked" ? true : override === "locked" ? false : st.graduated,
      overridden: override === "locked" || override === "unlocked",
      grade5Count: override === "locked" ? 0 : st.graduated || override === "unlocked" ? g5.length : 0,
      grade5Total: g5.length,
    };
  });
}

/** Global Fifth Grade view with parent locks applied. */
export function globalGradeView(profileId?: string | null): {
  name: "Fifth Grade!";
  graduatedCount: number;
  needed: number;
  graduated: SkillDomain[];
  unlocked: boolean;
} {
  const views = gradeViews(profileId);
  const graduated = views.filter((v) => v.graduated).map((v) => v.domain);
  const base = globalGraduationStatus();
  return {
    name: base.name,
    graduatedCount: graduated.length,
    needed: base.needed,
    graduated,
    unlocked: graduated.length >= base.needed,
  };
}

// ---------- graduation celebrations (fanfare plays once per unlock) ----------

const CELEBRATED_KEY = "mt.celebratedGraduations.v1";

/** Domain ids + "fifth-grade" already celebrated for this kid. Never throws. */
export function loadCelebratedGraduations(profileId?: string | null): string[] {
  if (!canStore()) return [];
  try {
    const raw = readStored(CELEBRATED_KEY, profileId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveCelebratedGraduations(ids: string[], profileId?: string | null): void {
  writeStored(CELEBRATED_KEY, JSON.stringify(ids), profileId);
}
