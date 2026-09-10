// MathTutor parent dashboard.
//
// Reads the selected kid's REAL payloads through src/lib/session.ts —
// assignment, last result, progress, plan session and points — plus the kid
// list from src/lib/profile/store.ts. Nothing here is seeded or synthesised:
// a kid with no stored practice gets an explicit empty state, and every figure
// is either read from a payload or counted from one.
//
// Parent WRITES live where the real mechanisms are: QuestControls (today's
// quest + grade locks) and RewardManager (prize catalog + requests). The old
// demo doc (mathtutor.admin.v1) and its fabricating seed are gone.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RewardManager } from "@/components/admin/RewardManager";
import { EmptyState } from "@/components/duo/EmptyState";
import { ListSkeleton } from "@/components/effects";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { LEVEL_LABELS } from "@/lib/plan/levels";
import type { SkillLevel } from "@/lib/plan/levels";
import type { SkillHistoryEntry } from "@/lib/plan/rules";
import { loadProfiles } from "@/lib/profile/store";
import type { Profile, ProfilesDoc } from "@/lib/profile/store";
import type { PointsState } from "@/lib/rewards/types";
import { SKILL_DOMAINS, SKILLS } from "@/lib/skills";
import {
  loadAssignment,
  loadLastResult,
  loadPlanSession,
  loadPointsState,
  loadProgress,
} from "@/lib/session";
import type {
  AssignmentState,
  PlanSessionState,
  PracticeResult,
  ProgressState,
} from "@/lib/session";

/** Domain id -> display name (SKILL_DOMAINS is the single source of truth). */
const DOMAIN_NAME: Record<string, string> = {};
for (const domain of SKILL_DOMAINS) DOMAIN_NAME[domain.id] = domain.name;

const RECENT_PRACTICE_ROWS = 12;

function localToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function skillName(skillId: string): string {
  return SKILLS.find((s) => s.id === skillId)?.name ?? skillId;
}

/** Local date+time for a real epoch stamp; null when the payload has none. */
function formatWhen(at: number | undefined): string | null {
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Attempt time in words, e.g. 80_000 -> "1m 20s". */
function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}m ${total % 60}s` : `${total}s`;
}

function outcomeWords(entry: SkillHistoryEntry): string {
  const base = entry.firstTryCorrect
    ? "Correct on the first try"
    : entry.exhaustedAttempts
      ? "All attempts used without a correct answer"
      : entry.correct
        ? "Correct after a retry"
        : "Not answered correctly";
  return entry.usedHint ? `${base} · hint used` : base;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-card px-4 py-3">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  );
}

interface KidData {
  assignment: AssignmentState | null;
  result: PracticeResult | null;
  progress: ProgressState;
  session: PlanSessionState;
  points: PointsState;
}

/**
 * Real payloads for one kid. `profileId` is always explicit: a kid id, or null
 * for the legacy un-namespaced keys on a device that has no profiles yet.
 */
function readKidData(profileId: string | null): KidData {
  return {
    assignment: loadAssignment(profileId),
    result: loadLastResult(profileId),
    progress: loadProgress(profileId),
    session: loadPlanSession(profileId),
    points: loadPointsState(profileId),
  };
}

/** True when this kid has anything real on disk — the only gate for the stats. */
function hasRecordedPractice(data: KidData): boolean {
  return (
    data.assignment !== null ||
    data.result !== null ||
    data.progress.sessionsCompleted > 0 ||
    data.progress.xp > 0 ||
    data.progress.badges.length > 0 ||
    data.progress.lastPlayedDate !== "" ||
    data.session.history.length > 0 ||
    Object.keys(data.session.levels).length > 0 ||
    Object.keys(data.session.mastery).length > 0 ||
    data.points.lifetime > 0 ||
    data.points.balance > 0 ||
    data.points.history.length > 0
  );
}

interface SkillRow {
  skillId: string;
  level: SkillLevel | null;
  mastery: number | null;
  attempts: number;
  firstTry: number;
}

/** One row per skill the plan engine has really stored a level or mastery for. */
function skillRows(session: PlanSessionState): SkillRow[] {
  const historyBySkill = new Map<string, SkillHistoryEntry[]>();
  for (const entry of session.history) {
    const list = historyBySkill.get(entry.skillId);
    if (list) list.push(entry);
    else historyBySkill.set(entry.skillId, [entry]);
  }
  const rows: SkillRow[] = [];
  const skillIds = Object.keys({ ...session.levels, ...session.mastery });
  for (const skillId of skillIds) {
    const entries = historyBySkill.get(skillId) ?? [];
    rows.push({
      skillId,
      level: session.levels[skillId] ?? null,
      mastery: session.mastery[skillId] ?? null,
      attempts: entries.length,
      firstTry: entries.filter((e) => e.firstTryCorrect).length,
    });
  }
  return rows.sort(
    (a, b) =>
      (b.mastery ?? -1) - (a.mastery ?? -1) ||
      b.attempts - a.attempts ||
      skillName(a.skillId).localeCompare(skillName(b.skillId)),
  );
}

function AssignmentCard({
  assignment,
  result,
}: {
  assignment: AssignmentState;
  result: PracticeResult | null;
}) {
  const finished = result !== null && result.assignmentId === assignment.id;
  return (
    <Card title="Current assignment" subtitle="The assignment saved on this device for this kid.">
      <div className="flex flex-wrap items-center gap-3">
        <Badge label={assignment.label} tone="sky" />
        <span className="text-sm font-bold text-muted">
          {assignment.problems.length} questions ·{" "}
          {assignment.domains.map((d) => DOMAIN_NAME[d] ?? d).join(", ")}
        </span>
      </div>
      <p className="mt-3 font-semibold">
        {finished
          ? `Finished — ${result.attempts.length} of ${assignment.problems.length} questions attempted.`
          : "Not finished yet — no completed session has been saved for it."}
      </p>
      <p className="mt-1 text-sm font-semibold text-muted">
        Saved {formatWhen(assignment.createdAt) ?? "without a timestamp"}
      </p>
    </Card>
  );
}

function LatestResultCard({ result }: { result: PracticeResult | null }) {
  if (result === null) {
    return (
      <Card title="Latest session" subtitle="The most recent finished session, as saved.">
        <p className="text-muted">No finished session has been saved for this kid yet.</p>
      </Card>
    );
  }
  const timeMs = result.attempts.reduce((sum, a) => sum + Math.max(0, a.timeMs), 0);
  return (
    <Card title="Latest session" subtitle={`Finished ${formatWhen(result.finishedAt) ?? "without a timestamp"}.`}>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Solved" value={`${result.solved}/${result.total}`} />
        <Stat label="First-try correct" value={String(result.correctFirst)} />
        <Stat label="First-try accuracy" value={`${result.accuracy}%`} />
        <Stat label="Stars earned" value={result.xpEarned.toLocaleString()} />
        <Stat label="Time on task" value={formatMs(timeMs)} />
        <Stat label="Questions" value={String(result.total)} />
      </div>
      {result.perDomain.length > 0 ? (
        <div className="mt-4">
          <p className="font-bold">By topic</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm font-semibold text-muted">
            {result.perDomain.map((d) => (
              <li key={d.domain}>
                {d.domainName}: {d.solved}/{d.total} solved
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.levelChanges.length > 0 ? (
        <div className="mt-4">
          <p className="font-bold">Level moves</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm font-semibold text-muted">
            {result.levelChanges.map((c) => (
              <li key={c.skillId}>
                {c.skillName}: level {c.from} → {c.to} ({c.direction === "up" ? "up" : "down"})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.reteachSkills.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge label="flagged for reteach" tone="coral" />
          <span className="text-sm font-semibold text-muted">
            {result.reteachSkills.map((s) => s.skillName).join(", ")}
          </span>
        </div>
      ) : null}
    </Card>
  );
}

export function Dashboard() {
  const [profiles, setProfiles] = useState<ProfilesDoc | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<KidData | null>(null);

  useEffect(() => {
    const doc = loadProfiles();
    setProfiles(doc);
    setSelectedId(doc.activeProfileId ?? doc.profiles[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (!profiles) return;
    setData(readKidData(selectedId));
  }, [profiles, selectedId]);

  const today = localToday();
  const kids: Profile[] = profiles?.profiles ?? [];
  const selectedKid = kids.find((k) => k.id === selectedId) ?? null;
  const hasProfiles = kids.length > 0;
  const scopeName = selectedKid ? `${selectedKid.animal} ${selectedKid.name}` : "this device";
  const emptyTitle = selectedKid
    ? `No practice recorded yet for ${selectedKid.name}`
    : "No practice recorded on this device yet";
  const rows = data ? skillRows(data.session) : [];
  const domainRows = data
    ? SKILL_DOMAINS.map((d) => ({ domain: d, stats: data.progress.domainStats[d.id] })).filter(
        (r) => r.stats.attempts > 0,
      )
    : [];
  const recent = data ? [...data.session.history].reverse().slice(0, RECENT_PRACTICE_ROWS) : [];

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge label={`Parent dashboard · ${today}`} tone="mint" />
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">
            Progress & controls
          </h1>
          <p className="mt-1 text-sm font-semibold text-muted">
            Saved practice for {scopeName}
          </p>
        </div>
        {hasProfiles ? (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-bold" htmlFor="kid-pick">
              Kid
            </label>
            <select
              id="kid-pick"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="touch-target rounded-pill border-2 border-line bg-card px-4 text-base outline-none focus:border-primary"
            >
              {kids.map((kid) => (
                <option key={kid.id} value={kid.id}>
                  {kid.animal} {kid.name}
                  {kid.id === profiles?.activeProfileId ? " (playing now)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </header>

      {data === null ? (
        <ListSkeleton rows={3} label="Reading saved practice…" />
      ) : !hasRecordedPractice(data) ? (
        <Card title="Nothing saved yet" subtitle="No sample numbers are shown here.">
          <EmptyState
            title={emptyTitle}
            body="Finish a session on this device and the real sessions, mastery and stars appear here."
            action={
              hasProfiles ? undefined : (
                <Link
                  href="/profiles"
                  className="touch-target inline-flex min-h-[56px] items-center rounded-2xl border-2 border-line bg-card px-6 font-display text-kid-lg font-bold uppercase text-ink"
                >
                  Set up a profile
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <>
          {data.assignment ? (
            <AssignmentCard assignment={data.assignment} result={data.result} />
          ) : null}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Progress" subtitle="Read from this kid's saved progress.">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Sessions finished" value={String(data.progress.sessionsCompleted)} />
                <Stat label="Perfect sessions" value={String(data.progress.perfectSessions)} />
                <Stat label="Practice streak (days)" value={String(data.progress.streakCount)} />
                <Stat label="Stars (XP)" value={data.progress.xp.toLocaleString()} />
                <Stat label="Badges won" value={String(data.progress.badges.length)} />
                <Stat
                  label="Last practised"
                  value={data.progress.lastPlayedDate || "Not yet"}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Points to spend" value={data.points.balance.toLocaleString()} />
                <Stat label="Points earned all-time" value={data.points.lifetime.toLocaleString()} />
                <Stat label="Points streak (days)" value={String(data.points.streakDays)} />
                <Stat label="Points events logged" value={String(data.points.history.length)} />
              </div>
            </Card>

            <LatestResultCard result={data.result} />
          </div>

          <Card
            title="Skills the plan has touched"
            subtitle="Level and mastery come from this kid's saved plan session."
          >
            {rows.length === 0 ? (
              <p className="text-muted">The plan has not graded a skill yet.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {rows.map((row) => (
                  <div key={row.skillId} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-bold">{skillName(row.skillId)}</p>
                      <p className="text-sm font-semibold text-muted">
                        {row.level !== null
                          ? `Level ${row.level} · ${LEVEL_LABELS[row.level]}`
                          : null}
                        {row.attempts > 0
                          ? `${row.level !== null ? " · " : ""}${row.attempts} graded · ${Math.round(
                              (row.firstTry / row.attempts) * 100,
                            )}% first-try`
                          : null}
                      </p>
                    </div>
                    {row.mastery !== null ? (
                      <ProgressBar
                        value={row.mastery}
                        max={100}
                        label={`${Math.round(row.mastery)}% mastery`}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Topic totals" subtitle="Every graded answer, grouped by topic.">
            {domainRows.length === 0 ? (
              <p className="text-muted">No answers graded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-140 text-left text-base">
                  <thead>
                    <tr className="border-b-2 border-line text-sm text-muted">
                      <th className="py-2 pr-4">Topic</th>
                      <th className="py-2 pr-4">Answers</th>
                      <th className="py-2 pr-4">First-try correct</th>
                      <th className="py-2 pr-4">Solved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainRows.map(({ domain, stats }) => (
                      <tr key={domain.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 font-bold">{domain.name}</td>
                        <td className="py-2 pr-4">{stats.attempts}</td>
                        <td className="py-2 pr-4">{stats.correctFirst}</td>
                        <td className="py-2 pr-4">{stats.solved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Recent practice" subtitle="Newest graded question first.">
            {recent.length === 0 ? (
              <p className="text-muted">No graded question saved yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {recent.map((entry, index) => (
                  <li
                    key={`${entry.skillId}-${entry.at ?? "untimed"}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line p-3"
                  >
                    <div>
                      <p className="font-bold">{skillName(entry.skillId)}</p>
                      <p className="text-sm font-semibold text-muted">{outcomeWords(entry)}</p>
                    </div>
                    {formatWhen(entry.at) ? (
                      <span className="text-sm font-semibold text-muted">
                        {formatWhen(entry.at)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <RewardManager />
    </main>
  );
}
