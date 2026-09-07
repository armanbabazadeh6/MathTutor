import type { SkillDomain } from "./skills";
import { SKILLS, SKILL_DOMAINS } from "./skills";
import { ALL_SKILLS as ALL_GENERATOR_SKILLS, generateProblem } from "./math/generators";
import type { MasteryMap } from "./math/types";
import { buildPlan, MAX_PER_SKILL_PER_PLAN } from "./plan/plan";
import type { Plan } from "./plan/plan";
import { DEFAULT_LEVEL, DEFAULT_MASTERY, clampLevel, levelToDifficulty } from "./plan/levels";
import type { LevelsMap } from "./plan/levels";
import { applyRulesForSkill } from "./plan/rules";
import type { LevelUpdate, SkillHistoryEntry } from "./plan/rules";
import { recordActivity } from "./rewards/earning";
import type { EarnEvents } from "./rewards/earning";
import { emptyPointsState } from "./rewards/types";
import type { PointsState } from "./rewards/types";
import { profileKey } from "./profile/store";

// NOTE (future DB persist): assignments/results currently live in localStorage
// only. When supabase/ lands, persist AssignmentState + PracticeResult rows
// keyed by assignment.id (see saveAssignment/saveLastResult call sites).

export interface GeneratedProblem {
  id: string;
  domain: SkillDomain;
  skillId: string;
  skillName: string;
  prompt: string;
  /** Canonical answer, parseable by parseAnswer ("7", "3.5", "3/4"). */
  answer: string;
  hint1: string;
  hint2: string;
  explanation: string;
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
  attemptsUsed: number;
  solved: boolean;
  correctFirstTry: boolean;
  timeMs: number;
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

// ---------- answer parsing: integers, decimals, "a/b" fractions ----------

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

export function checkAnswer(input: string, expected: string): boolean {
  const a = parseAnswer(input);
  const b = parseAnswer(expected);
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 1e-9;
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
    todayTopic: weakestActive.id,
    size: n,
  });
  const used: Record<string, number> = {};
  const queue = plan.items.filter((item) => supported.has(item.skillId));
  // Top up from weakest supported skills when the plan queue has no generator.
  const topUpPool = [...supportedAll].sort(byMastery);
  for (const s of topUpPool) {
    if (queue.length >= n) break;
    if ((used[s.id] ?? 0) >= MAX_PER_SKILL_PER_PLAN) continue;
    const copies = queue.filter((q) => q.skillId === s.id).length;
    if (copies >= MAX_PER_SKILL_PER_PLAN) continue;
    const level = clampLevel(session.levels[s.id] ?? DEFAULT_LEVEL);
    queue.push({ skillId: s.id, level, difficulty: levelToDifficulty(level), reason: "weak" });
  }
  const problems: GeneratedProblem[] = queue.slice(0, n).map((item, i) => {
    // Domains without a deterministic generator yet (e.g. geometry) fall
    // back to supported skills so practice never comes back empty.
    const subPool = inActive.length ? inActive : supportedAll;
    let skillId = item.skillId;
    let difficulty = item.difficulty;
    if (!active.includes(skillDomainOf(skillId))) {
      const sub =
        [...subPool].sort(byMastery).find((c) => (used[c.id] ?? 0) < MAX_PER_SKILL_PER_PLAN) ??
        weakestActive;
      skillId = sub.id;
      difficulty = levelToDifficulty(clampLevel(session.levels[skillId] ?? DEFAULT_LEVEL));
    }
    used[skillId] = (used[skillId] ?? 0) + 1;
    const p = generateProblem(skillId, Math.floor(Math.random() * 2 ** 31) + i * 7919, difficulty);
    return {
      id: `p-${Date.now()}-${i}-${rnd(1e6)}`,
      domain: skillDomainOf(skillId),
      skillId,
      skillName: skillNameOf(skillId),
      prompt: p.text,
      answer: p.answer,
      hint1: p.hint1,
      hint2: p.hint2,
      explanation: p.explanation,
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

export function loadAssignment(profileId?: string | null): AssignmentState | null {
  try {
    const raw = readStored(ASSIGNMENT_KEY, profileId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssignmentState;
    if (!parsed || !Array.isArray(parsed.problems) || !parsed.problems.length) return null;
    return parsed;
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
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
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

export function recordResult(
  result: PracticeResult,
  profileId?: string | null,
): { progress: ProgressState; newBadges: string[]; points: PointsState } {
  const progress = loadProgress(profileId);
  const before = new Set(progress.badges);

  progress.sessionsCompleted += 1;
  progress.xp += result.xpEarned;
  if (result.solved === result.total && result.total > 0) progress.perfectSessions += 1;

  const today = todayStr();
  if (progress.lastPlayedDate !== today) {
    progress.streakCount = progress.lastPlayedDate === yesterdayStr() ? progress.streakCount + 1 : 1;
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
  const points = awardPoints({ completions: 1 }, undefined, profileId);
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
}

export function emptyPlanSession(): PlanSessionState {
  return { version: PLAN_SESSION_VERSION, levels: {}, mastery: {}, history: [], streaks: {}, reteachQueue: [] };
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
  s.history.push(entry);
  if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
  const streak = s.streaks[entry.skillId] ?? { correct: 0, incorrect: 0 };
  if (entry.correct) {
    streak.correct += 1;
    streak.incorrect = 0;
  } else {
    streak.incorrect += 1;
    streak.correct = 0;
  }
  s.streaks[entry.skillId] = streak;
  const res = applyRulesForSkill({
    level: s.levels[entry.skillId] ?? DEFAULT_LEVEL,
    mastery: s.mastery[entry.skillId] ?? DEFAULT_MASTERY,
    recent: s.history.filter((h) => h.skillId === entry.skillId),
  });
  s.levels[entry.skillId] = res.level;
  s.mastery[entry.skillId] = res.mastery;
  if (res.reteach && !s.reteachQueue.includes(entry.skillId)) s.reteachQueue.push(entry.skillId);
  if (res.promoted) s.reteachQueue = s.reteachQueue.filter((q) => q !== entry.skillId);
  return res;
}

/**
 * Records one graded problem attempt: appends history, rolls the
 * consecutive-correct/incorrect counters, and re-applies the plan
 * promotion/demotion rules for that skill. Persists the session.
 */
export function recordGradedAttempt(entry: SkillHistoryEntry, profileId?: string | null): GradedOutcome {
  const s = loadPlanSession(profileId);
  const res = applyToSession(s, entry);
  savePlanSession(s, profileId);
  const points = awardPoints(
    {
      firstTryCorrect: entry.firstTryCorrect ? 1 : 0,
      levelUps: res.promoted ? 1 : 0,
    },
    undefined,
    profileId,
  );
  return { ...res, state: s, points };
}

/**
 * Records a reteach (TeachView) outcome. The scaffolded check counts as a
 * hinted attempt — never a first-try streak — so a good reteach heals
 * mastery without falsely promoting. A correct reteach clears the skill
 * from the reteach queue.
 */
export function recordReteachOutcome(
  skillId: string,
  correct: boolean,
  profileId?: string | null,
): GradedOutcome {
  const s = loadPlanSession(profileId);
  const res = applyToSession(s, {
    skillId,
    firstTryCorrect: false,
    exhaustedAttempts: false,
    correct,
    usedHint: true,
  });
  if (correct) s.reteachQueue = s.reteachQueue.filter((q) => q !== skillId);
  savePlanSession(s, profileId);
  const points = awardPoints({ levelUps: res.promoted ? 1 : 0 }, undefined, profileId);
  return { ...res, state: s, points };
}

/** Builds the live practice queue from the persisted plan session. */
export function currentPlan(size = 10, todayTopic?: string, profileId?: string | null): Plan {
  const s = loadPlanSession(profileId);
  return buildPlan({
    levelsMap: s.levels,
    masteryMap: s.mastery,
    history: s.history,
    todayTopic,
    size,
  });
}
