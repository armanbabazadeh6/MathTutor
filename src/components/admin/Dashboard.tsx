// MathTutor admin dashboard (desktop-friendly).
//
// End-to-end local review loop: pick a completed session, see stats +
// mistakes, then adjust mastery / skills / difficulty and regenerate the next
// assignment with a visible effect. Everything reads/writes the local store
// (src/components/admin/store.ts) — see its SUPABASE SWAP block for wiring.
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  formatDuration,
  masteryBySkill,
  mistakePatterns,
  recommendTomorrow,
  strongestTopics,
  summarizeSession,
  todayStatus,
  weakestTopics,
  type AssignmentDifficulty,
  type AssignmentRecord,
  type SkillMastery,
} from "@/lib/analytics";
import { SKILLS } from "@/lib/skills";
import {
  DIFFICULTY_QUESTIONS,
  effectiveMasteries,
  skillName,
  useAdminStore,
} from "@/components/admin/store";
import { RewardManager } from "@/components/admin/RewardManager";

function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-card px-4 py-3">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function MasteryRow({
  m,
  computed,
  overridden,
  disabled,
  onSet,
  onReset,
  onToggle,
}: {
  m: SkillMastery;
  computed: number | null;
  overridden: boolean;
  disabled: boolean;
  onSet: (v: number) => void;
  onReset: () => void;
  onToggle: () => void;
}) {
  const [draft, setDraft] = useState(String(m.mastery));
  return (
    <div className={disabled ? "opacity-50" : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">
          {skillName(m.skillId)}{" "}
          <span className="text-sm font-semibold text-muted">
            {m.questions}Q · {Math.round(m.accuracy * 100)}% acc
          </span>
        </p>
        <div className="flex items-center gap-2">
          {overridden ? <Badge label="manual" tone="sunny" /> : null}
          {computed !== null && overridden ? (
            <span className="text-sm font-semibold text-muted">was {computed}%</span>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="touch-target text-sm font-bold text-primaryink underline"
            aria-pressed={!disabled}
          >
            {disabled ? "Enable" : "Disable"}
          </button>
        </div>
      </div>
      <ProgressBar value={m.mastery} max={100} label={`${m.mastery}% mastery`} />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Mastery for ${skillName(m.skillId)}`}
          className="touch-target w-24 rounded-pill border-2 border-line bg-card px-3 text-base outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => onSet(Number(draft))}
          className="touch-target text-sm font-bold text-primaryink underline"
        >
          Set
        </button>
        {overridden ? (
          <button
            type="button"
            onClick={() => {
              onReset();
              setDraft(String(computed ?? 0));
            }}
            className="touch-target text-sm font-bold text-muted underline"
          >
            Reset to computed
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { state, actions } = useAdminStore();
  const today = localToday();
  const status = todayStatus(state.assignments, today);

  const sorted = [...state.assignments].sort((a, b) =>
    a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1,
  );
  const latestCompleted = sorted.find((a) => a.status === "completed");
  const [reviewId, setReviewId] = useState<string>(latestCompleted?.id ?? sorted[0]?.id ?? "");
  const review: AssignmentRecord | undefined =
    sorted.find((a) => a.id === reviewId) ?? latestCompleted ?? sorted[0];

  const masteries = effectiveMasteries(state);
  const computedById = new Map(masteryBySkill(state.attempts).map((m) => [m.skillId, m.mastery]));
  const strong = strongestTopics(masteries, 3);
  const weak = weakestTopics(masteries, 3);

  const reviewAttempts = review
    ? state.attempts.filter((a) => a.assignmentId === review.id)
    : [];
  const summary = review
    ? summarizeSession(review, state.attempts, state.assignments, today)
    : null;
  const mistakes = mistakePatterns(reviewAttempts);

  const previewSkills =
    state.nextTopics.length > 0
      ? state.nextTopics.filter((s) => !state.disabledSkills.includes(s))
      : recommendTomorrow(masteries, { count: 3 });
  const tomorrowPreview =
    previewSkills.length > 0 ? previewSkills : ["bt-place-value"];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-5 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Badge label={`Parent dashboard · ${today}`} tone="mint" />
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">
            Progress & controls
          </h1>
        </div>
        <Button variant="secondary" onClick={() => actions.resetAll()}>
          Reset demo data
        </Button>
      </header>

      {/* Today status */}
      <Card
        title={status.complete ? "Today: all done 🎉" : "Today's status"}
        subtitle={`${status.doneQuestions} of ${status.totalQuestions} questions · ${status.completed}/${status.assigned} sessions complete`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            label={status.complete ? "Complete" : "In progress"}
            tone={status.complete ? "mint" : "sunny"}
          />
          <div className="min-w-52 flex-1">
            <ProgressBar
              value={status.doneQuestions}
              max={Math.max(1, status.totalQuestions)}
              label={`${status.doneQuestions} of ${status.totalQuestions} done`}
            />
          </div>
        </div>
      </Card>

      {/* Session review picker + stat grid */}
      {review && summary ? (
        <Card
          title="Session review"
          subtitle="Pick any session; stats and mistakes follow it."
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-sm font-bold" htmlFor="review-pick">
              Session
            </label>
            <select
              id="review-pick"
              value={review.id}
              onChange={(e) => setReviewId(e.target.value)}
              className="touch-target rounded-pill border-2 border-line bg-card px-4 text-base outline-none focus:border-primary"
            >
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.date} · {a.difficulty} · {a.status} ({a.completedQuestionIds.length}/
                  {a.questionIds.length})
                </option>
              ))}
            </select>
            {review.status !== "completed" ? (
              <Button variant="secondary" onClick={() => actions.markAssignmentComplete(review.id)}>
                Mark complete
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Completion" value={`${summary.completionPct}%`} />
            <Stat
              label="Questions"
              value={`${summary.questionsDone}/${summary.questionsTotal}`}
            />
            <Stat
              label="Correct attempts"
              value={`${summary.correct}/${summary.attempts}`}
            />
            <Stat label="Accuracy" value={`${Math.round(summary.accuracy * 100)}%`} />
            <Stat
              label="First-try"
              value={`${Math.round(summary.firstAttemptAccuracy * 100)}%`}
            />
            <Stat label="Attempts" value={String(summary.attempts)} />
            <Stat label="Time spent" value={formatDuration(summary.timeSec)} />
            <Stat label="Day streak" value={`${summary.streakDays} 🔥`} />
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Mastery */}
        <Card title="Mastery by skill" subtitle="Manual edits win over computed scores.">
          <div className="flex flex-col gap-5">
            {masteries.length === 0 ? (
              <p className="text-muted">No attempts yet — practice to build mastery.</p>
            ) : null}
            {masteries.map((m) => (
              <MasteryRow
                key={m.skillId}
                m={m}
                computed={computedById.get(m.skillId) ?? null}
                overridden={m.skillId in state.masteryOverride}
                disabled={state.disabledSkills.includes(m.skillId)}
                onSet={(v) => actions.setMastery(m.skillId, v)}
                onReset={() => actions.resetMastery(m.skillId)}
                onToggle={() => actions.toggleSkill(m.skillId)}
              />
            ))}
            {state.disabledSkills.length > 0 ? (
              <p className="text-sm font-semibold text-muted">
                Disabled: {state.disabledSkills.map(skillName).join(", ")}
              </p>
            ) : null}
          </div>
        </Card>

        {/* Strongest / weakest */}
        <div className="flex flex-col gap-5">
          <Card title="Strongest topics" subtitle="Celebrate these.">
            <div className="flex flex-wrap gap-2">
              {strong.length === 0 ? (
                <p className="text-muted">Nothing practiced yet.</p>
              ) : null}
              {strong.map((m) => (
                <Badge
                  key={m.skillId}
                  label={`${skillName(m.skillId)} · ${m.mastery}%`}
                  tone="mint"
                />
              ))}
            </div>
          </Card>
          <Card title="Needs work" subtitle="These surface in tomorrow's plan.">
            <div className="flex flex-wrap gap-2">
              {weak.length === 0 ? (
                <p className="text-muted">Nothing practiced yet.</p>
              ) : null}
              {weak.map((m) => (
                <Badge
                  key={m.skillId}
                  label={`${skillName(m.skillId)} · ${m.mastery}%`}
                  tone="coral"
                />
              ))}
            </div>
          </Card>
          <Card title="Wrong-answer inspector" subtitle={review ? `Session ${review.date}` : undefined}>
            <div className="flex flex-col gap-3">
              {mistakes.length === 0 ? (
                <p className="text-muted">No wrong answers in this session. 🎉</p>
              ) : null}
              {mistakes.map((p) => (
                <div key={p.skillId} className="rounded-card border border-line p-3">
                  <p className="font-bold">
                    {skillName(p.skillId)}{" "}
                    <span className="text-sm font-semibold text-muted">
                      {p.misses} miss{p.misses === 1 ? "" : "es"} / {p.total} attempts
                    </span>
                  </p>
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {p.examples.map((e) => (
                      <li key={e.questionId}>
                        <span className="font-bold">{e.questionId}:</span> answered{" "}
                        <span className="font-bold text-coralink">{e.givenAnswer}</span>,
                        expected{" "}
                        <span className="font-bold text-primaryink">{e.expectedAnswer}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Recent assignments */}
      <Card title="Recent assignments" subtitle="Newest first.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-160 text-left text-base">
            <thead>
              <tr className="border-b-2 border-line text-sm text-muted">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Skills</th>
                <th className="py-2 pr-4">Done</th>
                <th className="py-2 pr-4">Difficulty</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4 font-bold">{a.date}</td>
                  <td className="py-2 pr-4">{a.skillIds.map(skillName).join(", ")}</td>
                  <td className="py-2 pr-4">
                    {a.completedQuestionIds.length}/{a.questionIds.length}
                  </td>
                  <td className="py-2 pr-4">{a.difficulty}</td>
                  <td className="py-2 pr-4">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Points economy: reward catalog + redemption inbox */}
      <RewardManager />

      {/* Controls */}
      <Card title="Plan tomorrow" subtitle="Adjust, then regenerate — the preview updates live.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="font-bold">
              Topics <span className="text-sm font-semibold text-muted">(empty = auto from weakest)</span>
            </p>
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-card border border-line p-3">
              {SKILLS.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={state.nextTopics.includes(s.id)}
                    disabled={state.disabledSkills.includes(s.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...state.nextTopics, s.id]
                        : state.nextTopics.filter((t) => t !== s.id);
                      actions.setNextTopics(next);
                    }}
                    className="h-5 w-5 accent-[#2f7d62]"
                  />
                  <span className={state.disabledSkills.includes(s.id) ? "text-muted line-through" : undefined}>
                    {s.name}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-bold" htmlFor="difficulty">
                Difficulty
              </label>
              <select
                id="difficulty"
                value={state.difficulty}
                onChange={(e) => actions.setDifficulty(e.target.value as AssignmentDifficulty)}
                className="touch-target rounded-pill border-2 border-line bg-card px-4 text-base outline-none focus:border-primary"
              >
                {(Object.keys(DIFFICULTY_QUESTIONS) as AssignmentDifficulty[]).map((d) => (
                  <option key={d} value={d}>
                    {d} · {DIFFICULTY_QUESTIONS[d]} questions
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-card border border-line bg-cream p-3 text-sm">
              <p className="font-bold">Next up (preview)</p>
              <p>
                {tomorrowPreview.map(skillName).join(" · ")} —{" "}
                {DIFFICULTY_QUESTIONS[state.difficulty]} questions · {state.difficulty}
              </p>
            </div>
            <div>
              <Button onClick={() => actions.regenerateAssignment()}>
                Regenerate assignment
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <p className="font-bold">Notes</p>
            <label className="text-sm font-bold" htmlFor="notes-pick">
              Session
            </label>
            <select
              id="notes-pick"
              value={review?.id ?? ""}
              onChange={(e) => setReviewId(e.target.value)}
              className="touch-target rounded-pill border-2 border-line bg-card px-4 text-base outline-none focus:border-primary"
            >
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.date} · {a.difficulty}
                </option>
              ))}
            </select>
            <textarea
              value={review ? (state.notes[review.id] ?? "") : ""}
              onChange={(e) => {
                if (review) actions.setNote(review.id, e.target.value);
              }}
              rows={5}
              placeholder="What should the next session remember?"
              className="rounded-card border-2 border-line bg-card p-3 text-base outline-none focus:border-primary"
            />
            <p className="text-sm text-muted">
              Notes persist locally per session; the Supabase swap stores one row per
              assignment in admin_settings.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}
