"use client";

import { useEffect, useState } from "react";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { SKILL_DOMAINS, SKILLS } from "@/lib/skills";
import type { SkillDomain } from "@/lib/skills";
import {
  getDailyQuest,
  getGradeOverrides,
  gradeViews,
  localDateISO,
  regenerateDailyQuest,
  setGradeOverride,
} from "@/lib/session";
import type { DomainGradeView, GradeOverride, Quest } from "@/lib/session";

function skillName(id: string): string {
  return SKILLS.find((s) => s.id === id)?.name ?? id;
}

/**
 * Parent quest + grade controls. Reads/writes the active kid's quest doc and
 * grade locks through the session store (per-profile keys) — no new storage.
 */
export function QuestControls() {
  const [today] = useState(() => localDateISO());
  const [quest, setQuest] = useState<Quest | null>(null);
  const [grades, setGrades] = useState<DomainGradeView[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, GradeOverride>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => {
    try {
      setQuest(getDailyQuest(today));
    } catch {
      setQuest(null);
    }
    try {
      setGrades(gradeViews());
    } catch {
      setGrades(null);
    }
    try {
      setOverrides(getGradeOverrides());
    } catch {
      setOverrides({});
    }
  };

  useEffect(refresh, [today]);

  const regenerate = () => {
    setError(null);
    setNotice(null);
    if (!reason.trim()) {
      setError("Please note why (e.g. “too hard today”) — the reason keeps the new quest distinct.");
      return;
    }
    try {
      const next = regenerateDailyQuest(reason.trim(), today);
      setReason("");
      setNotice(`New quest ready: “${next.questTitle}” (${next.items.length} problems).`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rebuild the quest.");
    }
  };

  const setLock = (domain: SkillDomain, value: GradeOverride | null) => {
    try {
      setOverrides(setGradeOverride(domain, value));
      setGrades(gradeViews());
      setNotice(
        value === null
          ? "Back to mastery for that area."
          : value === "unlocked"
            ? "Grade-5 games force-opened for that area."
            : "Grade-5 games locked for that area.",
      );
    } catch {
      setError("Could not save that pick.");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <DuoCard
        title="Today's quest 🔍"
        subtitle={
          quest
            ? `${quest.id} · ${quest.items.length} problems · +${quest.bonusRewardPts} pts bonus`
            : "No quest yet — open Today once to build it."
        }
      >
        {quest ? (
          <div className="flex flex-col gap-3">
            <p className="text-kid-base font-bold">
              “{quest.questTitle}”
              <span className="font-semibold text-muted">
                {" "}
                · {quest.startedAt ? `started ${quest.startedAt.slice(0, 16).replace("T", " ")}` : "not started yet"}
                {quest.parentReason ? ` · rebuilt: ${quest.parentReason}` : null}
              </span>
            </p>
            <ol className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-2xl border-2 border-line bg-cream p-3">
              {quest.items.map((item) => (
                <li key={item.position} className="text-kid-sm font-semibold">
                  <span className="font-bold">{item.position + 1}.</span> {skillName(item.skillId)}{" "}
                  <span className="text-muted">
                    · {item.reason} · level {item.level} · {item.difficulty}
                  </span>
                </li>
              ))}
            </ol>
            <div>
              <label htmlFor="quest-reason" className="font-display text-kid-lg font-semibold">
                Rebuild today&apos;s quest
              </label>
              <p className="text-kid-sm font-semibold text-muted">
                Same day, fresh mix. A note is required so the new quest stays distinct.
              </p>
              <input
                id="quest-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Example: too hard today"
                className="touch-target mt-2 w-full rounded-2xl border-2 border-line bg-white px-5 py-3 text-kid-base outline-none focus:border-primary"
              />
            </div>
            {error ? (
              <p className="text-kid-base font-bold text-coralink" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="text-kid-base font-bold text-primaryink" role="status">
                {notice}
              </p>
            ) : null}
            <div>
              <ChunkyButton type="button" onClick={regenerate}>
                Rebuild quest 🔀
              </ChunkyButton>
            </div>
          </div>
        ) : null}
      </DuoCard>

      <DuoCard title="Grade locks 🔐" subtitle="Force grade-5 open (or shut) per area. Auto = by mastery.">
        <ul className="flex flex-col gap-3">
          {SKILL_DOMAINS.map((d) => {
            const view = grades?.find((g) => g.domain === d.id);
            const lock = overrides[d.id] ?? null;
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-line bg-cream px-4 py-3"
              >
                <p className="text-kid-base font-bold">
                  {d.name}{" "}
                  <span className="font-semibold text-muted">
                    · {view ? (view.graduated ? "graduated 🎓" : `${view.qualifying}/${view.total} ready`) : "…"}
                    {view?.overridden ? " · grown-up pick" : null}
                  </span>
                </p>
                <div className="flex gap-2" role="group" aria-label={`Grade lock for ${d.name}`}>
                  {(
                    [
                      { value: "locked", label: "Lock" },
                      { value: "unlocked", label: "Open" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLock(d.id, lock === opt.value ? null : opt.value)}
                      aria-pressed={lock === opt.value}
                      className={`touch-target rounded-pill border-2 px-4 text-kid-sm font-bold ${
                        lock === opt.value ? "border-primary bg-mint" : "border-line bg-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {lock ? (
                    <button
                      type="button"
                      onClick={() => setLock(d.id, null)}
                      className="touch-target rounded-pill border-2 border-line bg-white px-4 text-kid-sm font-bold text-muted"
                    >
                      Auto
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </DuoCard>
    </div>
  );
}
