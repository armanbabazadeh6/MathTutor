// MathTutor admin local store.
//
// Single mutable AdminState (assignments, attempts, mastery overrides,
// disabled skills, notes, next-topic picks, difficulty) held module-side and
// exposed via useSyncExternalStore, persisted to localStorage. All dashboard
// controls act on this store, so edits (mastery, skill toggles, regenerate)
// are immediately visible in the computed analytics and in the next
// assignment preview.
//
// SUPABASE SWAP (documented, not yet wired):
//   - Replace loadInitial()/persist() with Supabase calls:
//       load:  supabase.from("assignments").select(...) -> AssignmentRecord[]
//              supabase.from("attempts").select(...)     -> AttemptRecord[]
//              supabase.from("admin_settings").select(...) for overrides,
//              disabled skills, notes, difficulty (one row per key).
//   - Replace each action's persist(state) with the matching
//     insert/update/delete, keeping the same action signatures so the
//     dashboard components do not change.
//   - Realtime (optional): subscribe to attempts INSERTs and call
//     setState({...state, attempts:[...]}) on payload.
// Until then everything runs locally against the seeded demo session below.
"use client";

import { useSyncExternalStore } from "react";
import {
  masteryBySkill,
  recommendTomorrow,
  type AssignmentDifficulty,
  type AssignmentRecord,
  type AttemptRecord,
  type SkillMastery,
} from "@/lib/analytics";
import { SKILLS } from "@/lib/skills";

const STORAGE_KEY = "mathtutor.admin.v1";

/**
 * Parent-area PIN. This is a speed bump, NOT a security boundary: the value is
 * inlined into the client bundle and every kid's assignments, points and prize
 * ledger live in this device's localStorage, so anyone with devtools can read
 * both. Override with NEXT_PUBLIC_ADMIN_PIN; real auth replaces this entirely
 * (see AdminGate).
 */
export const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "2468";

export interface AdminState {
  assignments: AssignmentRecord[];
  attempts: AttemptRecord[];
  /** Manual 0-100 mastery per skill; wins over computed mastery. */
  masteryOverride: Record<string, number>;
  /** Skill ids excluded from practice and recommendations. */
  disabledSkills: string[];
  /** Freeform notes keyed by assignment id. */
  notes: Record<string, string>;
  /** Manually picked skill ids for the next assignment; [] = auto. */
  nextTopics: string[];
  difficulty: AssignmentDifficulty;
}

export const DIFFICULTY_QUESTIONS: Record<AssignmentDifficulty, number> = {
  warmup: 5,
  grade: 8,
  challenge: 10,
};

function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDate(base: string, deltaDays: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() + deltaDays);
  return localDate(t);
}

/** Seed: one completed session yesterday + one in-progress session today. */
function seed(today: string): AdminState {
  const yesterday = shiftDate(today, -1);
  const completedId = `a-${yesterday}-done`;
  const attempts: AttemptRecord[] = [
    // Place value: 3/3 first-try.
    ...["pv-1", "pv-2", "pv-3"].map((q, i) => ({
      id: `seed-${q}`,
      assignmentId: completedId,
      skillId: "bt-place-value",
      questionId: q,
      attemptNumber: 1,
      correct: true,
      durationSec: 18 + i * 4,
      givenAnswer: ["45,231", "120,000", "7,089"][i],
      expectedAnswer: ["45,231", "120,000", "7,089"][i],
      createdAt: `${yesterday}T09:0${i}:00`,
    })),
    // 1-digit multiplication: miss then retry.
    {
      id: "seed-m1",
      assignmentId: completedId,
      skillId: "oa-mult-1digit",
      questionId: "m-1",
      attemptNumber: 1,
      correct: false,
      durationSec: 25,
      givenAnswer: "42",
      expectedAnswer: "48",
      createdAt: `${yesterday}T09:04:00`,
    },
    {
      id: "seed-m1r",
      assignmentId: completedId,
      skillId: "oa-mult-1digit",
      questionId: "m-1",
      attemptNumber: 2,
      correct: true,
      durationSec: 15,
      givenAnswer: "48",
      expectedAnswer: "48",
      createdAt: `${yesterday}T09:05:00`,
    },
    {
      id: "seed-m2",
      assignmentId: completedId,
      skillId: "oa-mult-1digit",
      questionId: "m-2",
      attemptNumber: 1,
      correct: true,
      durationSec: 12,
      givenAnswer: "35",
      expectedAnswer: "35",
      createdAt: `${yesterday}T09:06:00`,
    },
    // Equivalent fractions: two misses, one fixed on retry.
    {
      id: "seed-f1",
      assignmentId: completedId,
      skillId: "fr-equiv",
      questionId: "f-1",
      attemptNumber: 1,
      correct: false,
      durationSec: 40,
      givenAnswer: "2/3",
      expectedAnswer: "3/4",
      createdAt: `${yesterday}T09:08:00`,
    },
    {
      id: "seed-f1r",
      assignmentId: completedId,
      skillId: "fr-equiv",
      questionId: "f-1",
      attemptNumber: 2,
      correct: true,
      durationSec: 22,
      givenAnswer: "3/4",
      expectedAnswer: "3/4",
      createdAt: `${yesterday}T09:09:00`,
    },
    {
      id: "seed-f2",
      assignmentId: completedId,
      skillId: "fr-equiv",
      questionId: "f-2",
      attemptNumber: 1,
      correct: false,
      durationSec: 33,
      givenAnswer: "4/8",
      expectedAnswer: "6/8",
      createdAt: `${yesterday}T09:10:00`,
    },
  ];
  const completedQs = ["pv-1", "pv-2", "pv-3", "m-1", "m-2", "f-1", "f-2"];
  const todayId = `a-${today}-now`;
  return {
    assignments: [
      {
        id: completedId,
        date: yesterday,
        skillIds: ["bt-place-value", "oa-mult-1digit", "fr-equiv"],
        questionIds: completedQs,
        completedQuestionIds: completedQs,
        difficulty: "grade",
        status: "completed",
      },
      {
        id: todayId,
        date: today,
        skillIds: ["fr-equiv", "md-area"],
        questionIds: ["f-3", "f-4", "ar-1", "ar-2", "ar-3"],
        completedQuestionIds: ["f-3", "ar-1"],
        difficulty: "warmup",
        status: "in-progress",
      },
    ],
    attempts,
    masteryOverride: {},
    disabledSkills: [],
    notes: {
      [completedId]: "Fractions need a re-teach: keeps adding numerators across unlike denominators.",
    },
    nextTopics: [],
    difficulty: "grade",
  };
}

const validSkillIds = new Set(SKILLS.map((s) => s.id));

function loadInitial(): AdminState {
  const today = localDate(new Date());
  if (typeof window === "undefined") return seed(today);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AdminState>;
      if (Array.isArray(parsed.assignments) && Array.isArray(parsed.attempts)) {
        const fresh = seed(today);
        return {
          assignments: parsed.assignments,
          attempts: parsed.attempts,
          masteryOverride: parsed.masteryOverride ?? fresh.masteryOverride,
          disabledSkills: parsed.disabledSkills ?? fresh.disabledSkills,
          notes: parsed.notes ?? fresh.notes,
          nextTopics: (parsed.nextTopics ?? []).filter((s) => validSkillIds.has(s)),
          difficulty: parsed.difficulty ?? fresh.difficulty,
        };
      }
    }
  } catch {
    // Corrupt cache: fall through to seed.
  }
  return seed(today);
}

function persist(state: AdminState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/blocked: dashboard still works in memory.
  }
}

let state: AdminState = loadInitial();
const listeners = new Set<() => void>();

function setState(next: AdminState): void {
  state = next;
  persist(state);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}


function clampMastery(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
}

export const actions = {
  /** Manual mastery 0-100; visible in bars and used by regenerate. */
  setMastery(skillId: string, value: number): void {
    if (!validSkillIds.has(skillId)) return;
    setState({
      ...state,
      masteryOverride: { ...state.masteryOverride, [skillId]: clampMastery(value) },
    });
  },
  resetMastery(skillId: string): void {
    const next = { ...state.masteryOverride };
    delete next[skillId];
    setState({ ...state, masteryOverride: next });
  },
  toggleSkill(skillId: string): void {
    if (!validSkillIds.has(skillId)) return;
    const disabled = state.disabledSkills.includes(skillId)
      ? state.disabledSkills.filter((s) => s !== skillId)
      : [...state.disabledSkills, skillId];
    setState({ ...state, disabledSkills: disabled });
  },
  setNote(assignmentId: string, text: string): void {
    setState({ ...state, notes: { ...state.notes, [assignmentId]: text } });
  },
  setNextTopics(skillIds: string[]): void {
    setState({
      ...state,
      nextTopics: skillIds.filter((s) => validSkillIds.has(s)),
    });
  },
  setDifficulty(d: AssignmentDifficulty): void {
    setState({ ...state, difficulty: d });
  },
  markAssignmentComplete(assignmentId: string): void {
    setState({
      ...state,
      assignments: state.assignments.map((a) =>
        a.id === assignmentId
          ? {
              ...a,
              status: "completed",
              completedQuestionIds: a.questionIds,
            }
          : a,
      ),
    });
  },
  /**
   * Build tomorrow's assignment. Skills come from the manual pick when set,
   * else recommendTomorrow() over effective mastery (overrides win, disabled
   * skills excluded). Question count follows the selected difficulty.
   */
  regenerateAssignment(): void {
    const today = localDate(new Date());
    const tomorrow = shiftDate(today, 1);
    const computed = masteryBySkill(state.attempts);
    const effective = applyOverrides(computed, state.masteryOverride);
    const skills =
      state.nextTopics.length > 0
        ? state.nextTopics.filter((s) => !state.disabledSkills.includes(s))
        : recommendTomorrow(effective, {
            count: 3,
            exclude: state.disabledSkills,
          });
    const pool = skills.length > 0 ? skills : ["bt-place-value"];
    const total = DIFFICULTY_QUESTIONS[state.difficulty];
    const questionIds: string[] = [];
    for (let i = 0; i < total; i++) {
      questionIds.push(`q-${pool[i % pool.length]}-${i + 1}`);
    }
    const skillIds = Array.from(new Set(pool));
    setState({
      ...state,
      assignments: [
        ...state.assignments.filter(
          (a) => !(a.date === tomorrow && a.status === "assigned"),
        ),
        {
          id: `a-${tomorrow}-${Date.now()}`,
          date: tomorrow,
          skillIds,
          questionIds,
          completedQuestionIds: [],
          difficulty: state.difficulty,
          status: "assigned",
        },
      ],
    });
  },
  /** Wipe local demo data back to the seed (demo + fresh-parent escape hatch). */
  resetAll(): void {
    const fresh = seed(localDate(new Date()));
    setState(fresh);
  },
};

/** Computed mastery with manual overrides applied; disabled skills dropped. */
export function effectiveMasteries(s: AdminState): SkillMastery[] {
  return applyOverrides(masteryBySkill(s.attempts), s.masteryOverride).filter(
    (m) => !s.disabledSkills.includes(m.skillId),
  );
}

function applyOverrides(
  computed: SkillMastery[],
  override: Record<string, number>,
): SkillMastery[] {
  const byId = new Map(computed.map((m) => [m.skillId, m]));
  for (const [skillId, mastery] of Object.entries(override)) {
    const base = byId.get(skillId);
    if (base) byId.set(skillId, { ...base, mastery: clampMastery(mastery) });
    else
      byId.set(skillId, {
        skillId,
        questions: 0,
        attempts: 0,
        accuracy: mastery / 100,
        firstAttemptAccuracy: mastery / 100,
        mastery: clampMastery(mastery),
      });
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.mastery - a.mastery || b.attempts - a.attempts,
  );
}

export function skillName(skillId: string): string {
  return SKILLS.find((s) => s.id === skillId)?.name ?? skillId;
}

export function useAdminStore(): { state: AdminState; actions: typeof actions } {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  return { state: s, actions };
}
