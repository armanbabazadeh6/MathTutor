"use client";

import { useEffect, useState } from "react";
import { PageFade } from "@/components/effects/PageFade";
import { ListSkeleton } from "@/components/effects";
import { DuoCard } from "@/components/duo/Card";
import { Character } from "@/components/duo/Character";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { ProgressBar } from "@/components/duo/ProgressBar";
import { EmptyState } from "@/components/duo/EmptyState";
import { StudentNav } from "@/components/student/StudentNav";
import { loadPlanSession, loadPointsState, loadProgress, localDateISO } from "@/lib/session";
import type { PlanSessionState, ProgressState } from "@/lib/session";
import { groupBySkill, trailingFirstTryStreak } from "@/lib/plan/rules";
import type { SkillHistoryEntry } from "@/lib/plan/rules";
import { DAY_MS, isDue, reviewIntervalDays } from "@/lib/plan/srs";
import { DEFAULT_LEVEL, DEFAULT_MASTERY, LEVEL_LABELS } from "@/lib/plan/levels";
import type { SkillLevel } from "@/lib/plan/levels";
import { CURRICULUM_ORDER } from "@/lib/plan/plan";
import { SKILLS, SKILL_DOMAINS } from "@/lib/skills";
import type { Skill } from "@/lib/skills";
import { currentStreakDays, longestStreakDays } from "@/lib/analytics";

/** Days in the streak calendar (5 weeks). */
const CALENDAR_DAYS = 35;
/** Due-review rows shown before the "…and N more" line. */
const MAX_DUE_ROWS = 4;
const LADDER: SkillLevel[] = [1, 2, 3, 4, 5];

/** Curriculum position; unknown ids sort after every known one. */
function curriculumRank(id: string): number {
  const i = CURRICULUM_ORDER.indexOf(id);
  return i === -1 ? CURRICULUM_ORDER.length : i;
}

/** True once the plan engine has ever graded this skill. */
function isStarted(session: PlanSessionState, skillId: string): boolean {
  return session.mastery[skillId] !== undefined || session.levels[skillId] !== undefined;
}

/** Chip-sized name per domain (the full names wrap on a 320px row). */
const DOMAIN_SHORT: Record<string, string> = {
  "operations-algebraic": "Operations",
  "base-ten": "Base ten",
  fractions: "Fractions",
  "measurement-data": "Measurement",
  geometry: "Geometry",
};

/** Skills of one domain, in the order the curriculum introduces them. */
function skillsOfDomain(domain: string): Skill[] {
  return SKILLS.filter((s) => s.domain === domain).sort((a, b) => curriculumRank(a.id) - curriculumRank(b.id));
}

/**
 * The domain the kid is working on: weakest started skill wins, so the group
 * holding the shakiest skill opens first. Nothing started yet -> the domain
 * holding the curriculum head (the skill the plan serves first on a cold start).
 */
function focusDomainId(session: PlanSessionState): string {
  const started = SKILLS.filter((s) => isStarted(session, s.id));
  if (started.length > 0) {
    const weakest = started.slice().sort(
      (a, b) =>
        (session.mastery[a.id] ?? DEFAULT_MASTERY) - (session.mastery[b.id] ?? DEFAULT_MASTERY) ||
        curriculumRank(a.id) - curriculumRank(b.id),
    );
    return weakest[0].domain;
  }
  const head = SKILLS.find((s) => s.id === CURRICULUM_ORDER[0]);
  return head ? head.domain : SKILL_DOMAINS[0].id;
}

/** Local noon for a "YYYY-MM-DD" key; noon keeps DST arithmetic exact. */
function noonOf(day: string): Date {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** The last `CALENDAR_DAYS` local day keys ending today, oldest first. */
function lastWindowDays(today: string): string[] {
  const base = noonOf(today);
  const out: string[] = [];
  for (let back = CALENDAR_DAYS - 1; back >= 0; back--) {
    out.push(localDateISO(new Date(base.getFullYear(), base.getMonth(), base.getDate() - back, 12)));
  }
  return out;
}

/**
 * Every day the kid actually did something, from the two stores that stamp a
 * local date: graded attempts in the plan session (`at`, epoch ms) and the
 * points ledger (`date`, already local). No date is invented.
 */
function practiceDays(session: PlanSessionState, ledgerDates: string[]): string[] {
  const days = new Set<string>();
  for (const date of ledgerDates) if (/^\d{4}-\d{2}-\d{2}$/.test(date)) days.add(date);
  for (const entry of session.history) {
    if (typeof entry.at === "number" && Number.isFinite(entry.at)) days.add(localDateISO(new Date(entry.at)));
  }
  return Array.from(days).sort();
}

interface DayCell {
  key: string;
  played: boolean;
  isToday: boolean;
}

interface StreakView {
  cells: DayCell[];
  /** Consecutive days ending today (through yesterday when today is still open). */
  current: number;
  /** Best run across all stored days. */
  longest: number;
  playedInWindow: number;
}

function streakView(days: string[], today: string): StreakView {
  const played = new Set(days);
  const cells = lastWindowDays(today).map((key) => ({
    key,
    played: played.has(key),
    isToday: key === today,
  }));
  return {
    cells,
    current: currentStreakDays(days, today),
    longest: longestStreakDays(days),
    playedInWindow: cells.reduce((n, c) => (c.played ? n + 1 : n), 0),
  };
}

/** Newest graded attempt with a real timestamp; legacy untimed entries are ignored. */
function lastStampedAt(recent: SkillHistoryEntry[]): number | undefined {
  for (let i = recent.length - 1; i >= 0; i--) {
    const at = recent[i].at;
    if (typeof at === "number" && Number.isFinite(at)) return at;
  }
  return undefined;
}

interface DueSkill {
  skill: Skill;
  /** Whole days since the last graded attempt. */
  daysSince: number;
}

/**
 * Skills the spaced-review scheduler would serve next: the same interval math
 * the plan builder uses (`reviewIntervalDays` + `isDue`), most overdue first.
 * Only skills with a timestamped attempt can be scheduled.
 */
function dueForReview(session: PlanSessionState, now: number): DueSkill[] {
  const bySkill = groupBySkill(session.history);
  const due: { skill: Skill; dueAt: number; lastSeen: number }[] = [];
  for (const skill of SKILLS) {
    const recent = bySkill.get(skill.id);
    if (!recent || recent.length === 0) continue;
    const lastSeen = lastStampedAt(recent);
    if (lastSeen === undefined) continue;
    const level = session.levels[skill.id] ?? DEFAULT_LEVEL;
    const mastery = session.mastery[skill.id] ?? DEFAULT_MASTERY;
    const interval = reviewIntervalDays(level, mastery, trailingFirstTryStreak(recent));
    if (!isDue(lastSeen, interval, now)) continue;
    due.push({ skill, dueAt: lastSeen + interval * DAY_MS, lastSeen });
  }
  return due
    .sort((a, b) => (a.dueAt !== b.dueAt ? a.dueAt - b.dueAt : curriculumRank(a.skill.id) - curriculumRank(b.skill.id)))
    .map((entry) => ({
      skill: entry.skill,
      daysSince: Math.max(0, Math.floor((now - entry.lastSeen) / DAY_MS)),
    }));
}

/** Warm, never shaming: why this skill is coming back around. */
function reviewWhy(daysSince: number): string {
  if (daysSince >= 14) return "You learned this a while ago — let's check it stuck!";
  if (daysSince >= 7) return "It's been about a week — time for a quick check-in!";
  return "A tiny review keeps this one strong!";
}

function lastSeenWords(daysSince: number): string {
  if (daysSince <= 0) return "Last played today";
  if (daysSince === 1) return "Last played yesterday";
  return `Last played ${daysSince} days ago`;
}

interface ProgressPageData {
  progress: ProgressState;
  session: PlanSessionState;
  today: string;
  streak: StreakView;
  due: DueSkill[];
}

function loadPageData(): ProgressPageData {
  const session = loadPlanSession();
  const progress = loadProgress();
  const today = localDateISO();
  const days = practiceDays(
    session,
    loadPointsState().history.map((entry) => entry.date),
  );
  return { progress, session, today, streak: streakView(days, today), due: dueForReview(session, Date.now()) };
}

function MasteryPips({ level, started }: { level: SkillLevel; started: boolean }) {
  return (
    <span
      className="flex items-center gap-1"
      role="img"
      aria-label={started ? `Level ${level} of 5` : "Not started yet"}
    >
      {LADDER.map((step) => (
        <span
          key={step}
          aria-hidden
          className={`h-2.5 w-5 rounded-pill border-2 border-line ${
            started && step <= level ? "bg-sunny" : "bg-cream"
          }`}
        />
      ))}
    </span>
  );
}

function SkillRow({ skill, session }: { skill: Skill; session: PlanSessionState }) {
  const started = isStarted(session, skill.id);
  const level = session.levels[skill.id] ?? DEFAULT_LEVEL;
  const mastery = session.mastery[skill.id] ?? DEFAULT_MASTERY;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-kid-base font-semibold">{skill.name}</p>
        <span className="shrink-0 text-kid-sm font-bold text-muted">{started ? `${mastery}%` : "New!"}</span>
      </div>
      <ProgressBar value={started ? mastery : 0} max={100} size="sm" label={`${skill.name} mastery`} />
      {started ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <MasteryPips level={level} started />
          <span className="text-kid-xs font-bold text-muted">
            Level {level} · {LEVEL_LABELS[level]}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <MasteryPips level={level} started={false} />
          <span className="text-kid-xs font-bold text-muted">Not started yet — ready when you are! ✨</span>
        </div>
      )}
    </li>
  );
}

/** Which domains the kid left open, remembered for this browser session. */
const OPEN_DOMAINS_KEY = "mt.progress.openDomains";

function readOpenDomains(): Record<string, boolean> | null {
  try {
    const raw = window.sessionStorage.getItem(OPEN_DOMAINS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const open: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(parsed)) if (value === true) open[id] = true;
    return open;
  } catch {
    return null;
  }
}

function saveOpenDomains(open: Record<string, boolean>): void {
  try {
    window.sessionStorage.setItem(OPEN_DOMAINS_KEY, JSON.stringify(open));
  } catch {
    /* storage blocked: the choice still holds for this mount */
  }
}

/** One collapsible domain card: summary row, started bar, and its skill rows. */
function DomainGroup({
  domain,
  session,
  open,
  onToggle,
}: {
  domain: { id: string; name: string };
  session: PlanSessionState;
  open: boolean;
  onToggle: (domainId: string) => void;
}) {
  const skills = skillsOfDomain(domain.id);
  const started = skills.reduce((n, s) => (isStarted(session, s.id) ? n + 1 : n), 0);
  const controlId = `domain-control-${domain.id}`;
  const regionId = `domain-region-${domain.id}`;
  return (
    <section id={`domain-${domain.id}`} className="mt-card scroll-mt-24 overflow-hidden">
      <button
        id={controlId}
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => onToggle(domain.id)}
        className="mt-focus flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-display text-kid-lg font-semibold leading-tight">{domain.name}</span>
          <span className="mt-eyebrow block text-muted">
            {started} of {skills.length} started
          </span>
        </span>
        <span aria-hidden className="shrink-0 font-display text-kid-lg text-muted">
          {open ? "▾" : "▸"}
        </span>
      </button>
      <div className={`px-4 ${open ? "" : "pb-3"}`}>
        <ProgressBar
          value={started}
          max={skills.length}
          tone="sky"
          size="sm"
          label={`${domain.name}: ${started} of ${skills.length} skills started`}
        />
      </div>
      <div id={regionId} role="region" aria-labelledby={controlId} hidden={!open} className="px-4 pb-4 pt-3">
        <ul className="flex flex-col gap-4">
          {skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} session={session} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressPageData | null>(null);
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loaded = loadPageData();
    setData(loaded);
    // Reopen what the kid left open; otherwise the weakest started skill's
    // domain, so the first screen always shows real work.
    setOpenDomains(readOpenDomains() ?? { [focusDomainId(loaded.session)]: true });
  }, []);

  if (!data) {
    return (
      <main className="mt-shell mt-shell-nav flex min-h-screen flex-col gap-5 py-6">
        <h1 className="font-display text-kid-hero font-semibold tracking-tight">My Progress 📈</h1>
        <ListSkeleton rows={5} label="Finding your stars" />
      </main>
    );
  }

  const { progress, session, streak, due } = data;
  const startedCount = SKILLS.reduce((n, s) => (isStarted(session, s.id) ? n + 1 : n), 0);
  const dueShown = due.slice(0, MAX_DUE_ROWS);

  const toggleDomain = (domainId: string) => {
    const next = { ...openDomains, [domainId]: openDomains[domainId] !== true };
    setOpenDomains(next);
    saveOpenDomains(next);
  };

  const jumpToDomain = (domainId: string) => {
    const next = { ...openDomains, [domainId]: true };
    setOpenDomains(next);
    saveOpenDomains(next);
    const target = document.getElementById(`domain-${domainId}`);
    if (!target) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  };

  return (
    <main className="mt-shell mt-shell-nav flex min-h-screen flex-col gap-5 py-6">
      <PageFade>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StreakFlame count={progress.streakCount} />
              <GemCounter gems={progress.xp} label={`${progress.xp} stars`} />
            </div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Character
                pose={startedCount > 0 ? "cheer" : "happy"}
                size={88}
                label="Mascot cheering your skills"
              />
              <div className="min-w-0">
                <h1 className="font-display text-kid-hero font-semibold tracking-tight">My Progress 📈</h1>
                <p className="text-kid-lg font-semibold text-muted">
                  {startedCount} of {SKILLS.length} skills started — each bar shows how strong you are right now.
                </p>
              </div>
            </div>
          </header>

          <nav aria-label="Jump to a skill group" className="sticky top-2 z-30 -mx-5 bg-cream/95 px-5 py-2 backdrop-blur">
            <ul className="flex gap-2 overflow-x-auto">
              {SKILL_DOMAINS.map((domain) => (
                <li key={domain.id} className="shrink-0">
                  <button
                    type="button"
                    aria-controls={`domain-region-${domain.id}`}
                    aria-expanded={openDomains[domain.id] === true}
                    onClick={() => jumpToDomain(domain.id)}
                    className="mt-focus flex min-h-14 items-center rounded-pill border-2 border-line bg-card px-4 text-kid-sm font-bold shadow-chunky-sm"
                  >
                    {DOMAIN_SHORT[domain.id] ?? domain.name}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {SKILL_DOMAINS.map((domain) => (
            <DomainGroup
              key={domain.id}
              domain={domain}
              session={session}
              open={openDomains[domain.id] === true}
              onToggle={toggleDomain}
            />
          ))}

          <DuoCard
            title="Practice days"
            subtitle={
              streak.current > 0
                ? `You played ${streak.current} day${streak.current === 1 ? "" : "s"} in a row! 🔥`
                : "Play today to start a new run!"
            }
          >
            {streak.cells.some((c) => c.played) ? (
              <>
                <div className="grid grid-cols-7 gap-1.5" aria-hidden>
                  {streak.cells.map((cell) => (
                    <span
                      key={cell.key}
                      className={`flex aspect-square items-center justify-center rounded-lg border-2 border-line text-kid-xs ${
                        cell.played ? "bg-mint" : "bg-cream"
                      } ${cell.isToday ? "ring-2 ring-primaryink" : ""}`}
                    >
                      {cell.played ? "⭐" : ""}
                    </span>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl border-2 border-line bg-cream px-2 py-2">
                    <p className="font-display text-kid-xl font-semibold">{streak.current}</p>
                    <p className="mt-eyebrow">In a row</p>
                  </div>
                  <div className="rounded-2xl border-2 border-line bg-cream px-2 py-2">
                    <p className="font-display text-kid-xl font-semibold">{streak.longest}</p>
                    <p className="mt-eyebrow">Best run</p>
                  </div>
                  <div className="rounded-2xl border-2 border-line bg-cream px-2 py-2">
                    <p className="font-display text-kid-xl font-semibold">{streak.playedInWindow}</p>
                    <p className="mt-eyebrow">Days</p>
                  </div>
                </div>
                <p className="mt-3 text-kid-sm font-semibold text-muted">
                  Each ⭐ is a day you practised — {streak.playedInWindow} of the last {CALENDAR_DAYS} days.
                </p>
              </>
            ) : (
              <EmptyState
                title="Your day grid starts today!"
                body="Play one game and your first ⭐ lands on the calendar."
                pose="sleep"
              />
            )}
          </DuoCard>

          <DuoCard title="Coming back around" subtitle="Skills that are ready for a quick check-up!">
            {dueShown.length === 0 ? (
              <EmptyState
                title="Nothing to review right now"
                body="Everything you've practised is still fresh. New check-ups appear when a skill is ready."
                pose="happy"
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {dueShown.map((entry) => (
                  <li
                    key={entry.skill.id}
                    className="flex flex-col gap-0.5 rounded-2xl border-2 border-line bg-cream px-4 py-2.5"
                  >
                    <p className="text-kid-base font-bold">🔁 {entry.skill.name}</p>
                    <p className="text-kid-sm font-semibold text-ink-soft">{reviewWhy(entry.daysSince)}</p>
                    <p className="text-kid-xs font-bold text-muted">{lastSeenWords(entry.daysSince)}</p>
                  </li>
                ))}
                {due.length > dueShown.length ? (
                  <li className="px-1 text-kid-sm font-semibold text-muted">
                    …and {due.length - dueShown.length} more waiting for a check-up.
                  </li>
                ) : null}
              </ul>
            )}
          </DuoCard>

          <StudentNav />
        </div>
      </PageFade>
    </main>
  );
}
