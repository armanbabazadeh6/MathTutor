"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { ListSkeleton } from "@/components/effects/Skeleton";
import { SoundToggle } from "@/components/effects/SoundToggle";
import { Alert } from "@/components/duo/Alert";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { EmptyState } from "@/components/duo/EmptyState";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { LessonPath } from "@/components/duo/LessonPath";
import type { LessonNode } from "@/components/duo/LessonPath";
import { Sheet } from "@/components/ui/Sheet";
import { StudentNav } from "@/components/student/StudentNav";
import { TopicGrid } from "@/components/student/TopicGrid";
import { QuickStart } from "@/components/student/QuickStart";
import {
  QUEST_ASSIGNMENT_NOTE,
  QUEST_ASSIGNMENT_PREFIX,
  generateAssignment,
  getDailyQuest,
  gradeViews,
  isQuestDoneToday,
  loadAssignment,
  loadPlanSession,
  loadProgress,
  saveAssignment,
  startDailyQuest,
} from "@/lib/session";
import type { Quest } from "@/lib/session";
import { getActiveProfile, loadProfiles, migrateLegacyOnce } from "@/lib/profile/store";
import { SKILL_DOMAINS, SKILLS } from "@/lib/skills";
import type { SkillDomain } from "@/lib/skills";

const KID_SHORT: Record<SkillDomain, string> = {
  "operations-algebraic": "Times & Divide",
  "base-ten": "Big Numbers",
  fractions: "Pizza Fractions",
  "measurement-data": "Measure Up",
  geometry: "Shapes",
};

const KID_BLURB: Record<SkillDomain, string> = {
  "operations-algebraic": "Multiply and divide like a pro!",
  "base-ten": "Huge numbers, rounding, adding!",
  fractions: "Yummy pizza slices and pieces!",
  "measurement-data": "Rulers, clocks, and measuring!",
  geometry: "Cool shapes and angles!",
};

/** What the path knows about one domain: graduated means genuinely finished. */
interface DomainPathInfo {
  graduated: boolean;
  /** Mean plan level across skills with a recorded level, or null when brand new. */
  level: number | null;
}

type SheetTarget = { kind: "quest" } | { kind: "domain"; domain: SkillDomain };

export default function Home() {
  const router = useRouter();
  const [selected, setSelected] = useState<SkillDomain[]>(["operations-algebraic", "fractions"]);
  const [customTopic, setCustomTopic] = useState("");
  const [error, setError] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [questDone, setQuestDone] = useState(false);
  const [questResumable, setQuestResumable] = useState(false);
  const [questFailed, setQuestFailed] = useState(false);
  // Entry gate: legacy progress migrates once, then kids without an active
  // profile land on the /profiles picker. Switching kids in /profiles pushes
  // back here, remounting Home so progress/plan/points reload for that kid.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      migrateLegacyOnce();
    } catch {
      /* profiles page retries migration; entry must never crash */
    }
    try {
      const doc = loadProfiles();
      if (!doc.profiles.length || !getActiveProfile(doc)) {
        router.replace("/profiles");
        return;
      }
    } catch {
      router.replace("/profiles");
      return;
    }
    setReady(true);
  }, [router]);

  /**
   * Loads today's quest plus its two other states: resumable (the saved
   * assignment IS this quest) and done (the quest's bonus was already paid).
   * A throw means storage is unavailable, which renders as the empty state.
   */
  const loadQuest = useCallback(() => {
    try {
      const q = getDailyQuest();
      setQuest(q);
      setQuestDone(isQuestDoneToday(q.id));
      const saved = loadAssignment();
      setQuestResumable(!!saved && saved.id === `${QUEST_ASSIGNMENT_PREFIX}${q.id}`);
      setQuestFailed(false);
    } catch {
      setQuest(null);
      setQuestFailed(true);
    }
  }, []);

  useEffect(() => {
    if (ready) loadQuest();
  }, [ready, loadQuest]);

  const progress = useMemo(() => loadProgress(), []);

  const kidName = useMemo(() => {
    if (!ready) return "";
    try {
      return getActiveProfile(loadProfiles())?.name ?? "";
    } catch {
      return "";
    }
  }, [ready]);

  const domainInfo = useMemo(() => {
    const info = new Map<SkillDomain, DomainPathInfo>();
    if (!ready) return info;
    try {
      const levels = loadPlanSession().levels;
      for (const view of gradeViews()) {
        const known = SKILLS.filter(
          (s) => s.domain === view.domain && s.id in levels,
        ).map((s) => levels[s.id]);
        info.set(view.domain, {
          graduated: view.graduated,
          level: known.length
            ? Math.round(known.reduce((sum, l) => sum + l, 0) / known.length)
            : null,
        });
      }
    } catch {
      /* no storage: the path falls back to plain "ready to play" nodes */
    }
    return info;
  }, [ready]);

  /** The domain today's quest drills hardest — the node marked "current". */
  const questDomain = useMemo<SkillDomain | null>(() => {
    if (!quest) return null;
    const counts = new Map<SkillDomain, number>();
    for (const item of quest.items) {
      const skill = SKILLS.find((s) => s.id === item.skillId);
      if (!skill) continue;
      counts.set(skill.domain, (counts.get(skill.domain) ?? 0) + 1);
    }
    let best: SkillDomain | null = null;
    let bestCount = 0;
    counts.forEach((count, domain) => {
      if (count > bestCount) {
        best = domain;
        bestCount = count;
      }
    });
    return best;
  }, [quest]);

  const toggle = (d: SkillDomain) => {
    setError("");
    setSelected((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const start = () => {
    if (selected.length === 0 && !customTopic.trim()) {
      setError("Pick at least one topic, or type what you learned!");
      return;
    }
    // Creates the assignment locally via the math composer in session.ts.
    // NOTE (future DB persist): also POST the assignment to supabase here.
    const assignment = generateAssignment(selected, customTopic, 10);
    saveAssignment(assignment);
    router.push("/practice");
  };

  const startWithDomain = (d: SkillDomain) => {
    const assignment = generateAssignment([d], "", 10);
    saveAssignment(assignment);
    setSheet(null);
    router.push("/practice");
  };

  const startQuestRun = () => {
    // Quest is THE assignment: lock it at first start, mint its problems,
    // and practice consumes those items. Same quest all day.
    setSheet(null);
    if (questResumable) {
      router.push("/practice");
      return;
    }
    try {
      startDailyQuest();
    } catch {
      /* practice page shows its empty state when storage is unavailable */
    }
    router.push("/practice");
  };

  // Winding path: today's quest first (current), the other domains (available),
  // domains whose grade-4 base is graduated (done), then the prize chest.
  // Two taps to start: tap a node, confirm in the sheet.
  const nodes: LessonNode[] = useMemo(() => {
    const path: LessonNode[] = [];
    if (questDomain) {
      path.push({
        id: "quest:today",
        label: KID_SHORT[questDomain],
        state: "current",
        detail: "Today's quest",
      });
    }
    for (const d of SKILL_DOMAINS) {
      if (d.id === questDomain) continue; // the quest node stands in for its domain
      const info = domainInfo.get(d.id);
      const done = !!info?.graduated;
      path.push({
        id: `domain:${d.id}`,
        label: KID_SHORT[d.id],
        state: done ? "done" : "available",
        detail: done ? "Mastered!" : info?.level ? `Level ${info.level}` : "New!",
      });
    }
    path.push({
      id: "chest:prizes",
      label: "Prize chest",
      state: "chest",
      detail: `${progress.xp} stars`,
    });
    return path;
  }, [questDomain, domainInfo, progress.xp]);

  const onSelectNode = (id: string) => {
    if (id === "chest:prizes") {
      router.push("/rewards");
      return;
    }
    if (id === "quest:today") {
      setSheet({ kind: "quest" });
      return;
    }
    if (id.startsWith("domain:")) {
      const d = id.slice("domain:".length) as SkillDomain;
      setSheet({ kind: "domain", domain: d });
    }
  };

  const closeSheet = useCallback(() => setSheet(null), []);

  const sheetDomain =
    sheet?.kind === "domain" ? SKILL_DOMAINS.find((d) => d.id === sheet.domain) ?? null : null;
  const sheetPicked = sheetDomain ? selected.includes(sheetDomain.id) : false;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const questCta = questDone
    ? "Play it again 🔁"
    : questResumable
      ? "Keep going ▶"
      : "Start today's quest 🚀";
  const questNote = questDone
    ? "All finished — every problem solved. See you tomorrow! 🎉"
    : questResumable
      ? "You already started this one. Jump right back in!"
      : "Picked just for you, and it stays the same all day.";

  if (!ready) {
    return (
      <main className="mt-shell mt-shell-nav flex min-h-screen flex-col gap-4 pt-5">
        <ListSkeleton rows={3} label="Getting today's quest ready…" />
        <ChunkyButton variant="secondary" fullWidth onClick={() => router.push("/profiles")}>
          Choose who&apos;s playing 🎒
        </ChunkyButton>
      </main>
    );
  }

  return (
    <main className="mt-shell mt-shell-nav flex min-h-screen flex-col gap-4 pt-5">
      <PageFade>
        <div className="flex flex-col gap-4">
          {/* Greeting + streak + gems + sound: one compact header row block */}
          <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 flex-1 font-display text-kid-hero font-semibold tracking-tight">
                {greet}
                {kidName ? `, ${kidName}!` : "! 👋"}
              </h1>
              <SoundToggle />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StreakFlame count={progress.streakCount} />
              <GemCounter gems={progress.xp} label={`${progress.xp} stars`} />
            </div>
          </header>

          {/* THE primary action: today's quest, one big button, above the fold */}
          {quest ? (
            <DuoCard
              tone="sunny"
              eyebrow={questDone ? "Quest complete" : "Today's quest"}
              title={quest.questTitle}
              subtitle={`${quest.items.length} problems · +${quest.bonusRewardPts} bonus points`}
              icon={
                <Character
                  pose={questDone ? "cheer" : "happy"}
                  size={88}
                  label={
                    questDone
                      ? "Mascot cheering your finished quest"
                      : "Mascot ready for today's quest"
                  }
                />
              }
            >
              <div className="flex flex-col gap-3">
                <p className="text-kid-base font-semibold text-ink-soft">{questNote}</p>
                <ChunkyButton size="lg" fullWidth shine onClick={startQuestRun}>
                  {questCta}
                </ChunkyButton>
              </div>
            </DuoCard>
          ) : (
            <DuoCard tone="cream">
              <EmptyState
                pose={questFailed ? "oops" : "sleep"}
                title={questFailed ? "Your quest couldn't load" : "No quest right now"}
                body={
                  questFailed
                    ? "Something on this device got stuck. Give it another go!"
                    : "Your next quest appears here tomorrow morning."
                }
                action={
                  questFailed ? (
                    <ChunkyButton variant="secondary" onClick={loadQuest}>
                      Try again 🔄
                    </ChunkyButton>
                  ) : undefined
                }
              />
            </DuoCard>
          )}

          {/* Unfinished extra-practice run only — never competes with the quest */}
          <QuickStart />

          {/* Winding path: real plan state, two-tap confirm in the shared Sheet */}
          <DuoCard title="Today's path" subtitle="Tap a circle, then say go!">
            <LessonPath nodes={nodes} onSelect={onSelectNode} />
          </DuoCard>

          {/* Free choice stays reachable, but folded away until it's asked for */}
          <section className="flex flex-col gap-3">
            <ChunkyButton
              variant="secondary"
              fullWidth
              aria-expanded={extraOpen}
              aria-controls="extra-practice"
              onClick={() => setExtraOpen((open) => !open)}
            >
              🎨 Extra practice {extraOpen ? "▲" : "▼"}
            </ChunkyButton>
            {extraOpen ? (
              <div id="extra-practice">
                <DuoCard
                  eyebrow="Optional"
                  title="Pick any topic"
                  subtitle="Extra practice never changes your quest."
                >
                  <div className="flex flex-col gap-4">
                    <TopicGrid selected={selected} onToggle={toggle} />
                    <div>
                      <label htmlFor="custom-topic" className="font-display text-kid-lg font-semibold">
                        Anything else?{" "}
                        <span className="font-body text-kid-sm font-semibold text-muted">
                          (you can type it!)
                        </span>
                      </label>
                      <input
                        id="custom-topic"
                        value={customTopic}
                        onChange={(e) => {
                          setError("");
                          setCustomTopic(e.target.value);
                        }}
                        placeholder="Example: long division with remainders…"
                        className="touch-target mt-2 w-full rounded-2xl border-2 border-line bg-white px-5 py-3 text-kid-lg outline-none focus:border-primary"
                      />
                    </div>
                    {error ? <Alert tone="error">{error}</Alert> : null}
                    <p className="text-kid-xs font-semibold text-muted">{QUEST_ASSIGNMENT_NOTE}</p>
                    <ChunkyButton onClick={start} size="lg" fullWidth shine>
                      Start extra practice · 10 problems 🚀
                    </ChunkyButton>
                  </div>
                </DuoCard>
              </div>
            ) : null}
          </section>

          <StudentNav />
        </div>
      </PageFade>

      {/* Quest confirm sheet: second tap starts (or resumes) the quest */}
      {sheet?.kind === "quest" && quest ? (
        <Sheet title="Today's quest" onClose={closeSheet}>
          <div className="flex items-center gap-3">
            <Character pose="happy" size={72} label="Mascot ready to practice" />
            <div className="min-w-0">
              <p className="mt-eyebrow">Today&apos;s quest</p>
              <h2 className="font-display text-kid-xl font-semibold">{quest.questTitle}</h2>
            </div>
          </div>
          <p className="mt-3 text-kid-base font-bold">
            {quest.items.length} problems · +{quest.bonusRewardPts} bonus points
          </p>
          <p className="mt-1 text-kid-sm font-semibold text-muted">{questNote}</p>
          <div className="mt-4 flex flex-col gap-3">
            <ChunkyButton size="lg" fullWidth shine onClick={startQuestRun}>
              {questCta}
            </ChunkyButton>
            <ChunkyButton variant="secondary" fullWidth onClick={closeSheet}>
              Not now
            </ChunkyButton>
          </div>
        </Sheet>
      ) : null}

      {/* Domain confirm sheet: second tap starts 10 problems of that topic */}
      {sheetDomain ? (
        <Sheet title={`Play ${KID_SHORT[sheetDomain.id]}?`} onClose={closeSheet}>
          <div className="flex items-center gap-3">
            <Character pose="happy" size={72} label="Mascot ready to practice" />
            <div className="min-w-0">
              <h2 className="font-display text-kid-xl font-semibold">{KID_SHORT[sheetDomain.id]}</h2>
              <p className="text-kid-sm font-semibold text-muted">{sheetDomain.name}</p>
            </div>
          </div>
          <p className="mt-3 text-kid-base font-bold">{KID_BLURB[sheetDomain.id]}</p>
          <div className="mt-4 flex flex-col gap-3">
            <ChunkyButton
              size="lg"
              fullWidth
              shine
              onClick={() => {
                if (!selected.includes(sheetDomain.id)) toggle(sheetDomain.id);
                startWithDomain(sheetDomain.id);
              }}
            >
              Let&apos;s go! · 10 problems 🚀
            </ChunkyButton>
            <div className="flex gap-3">
              <ChunkyButton
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  toggle(sheetDomain.id);
                  closeSheet();
                }}
              >
                {sheetPicked ? "Unpick it" : "Pick it ✓"}
              </ChunkyButton>
              <ChunkyButton variant="secondary" className="flex-1" onClick={closeSheet}>
                Not now
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
