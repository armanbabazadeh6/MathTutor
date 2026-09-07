"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { StreakFlame } from "@/components/duo/StreakFlame";
import { GemCounter } from "@/components/duo/GemCounter";
import { LessonPath } from "@/components/duo/LessonPath";
import type { LessonNode } from "@/components/duo/LessonPath";
import { StudentNav } from "@/components/student/StudentNav";
import { TopicGrid } from "@/components/student/TopicGrid";
import { QuickStart } from "@/components/student/QuickStart";
import {
  generateAssignment,
  loadPlanSession,
  loadProgress,
  saveAssignment,
} from "@/lib/session";
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

function shortSkillName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

export default function Home() {
  const router = useRouter();
  const [selected, setSelected] = useState<SkillDomain[]>(["operations-algebraic", "fractions"]);
  const [customTopic, setCustomTopic] = useState("");
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<SkillDomain | null>(null);
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
  const progress = useMemo(() => loadProgress(), []);
  const planSkills = useMemo(() => {
    try {
      return loadPlanSession()
        .reteachQueue.slice(0, 3)
        .map((id) => SKILLS.find((s) => s.id === id))
        .filter((s): s is (typeof SKILLS)[number] => !!s);
    } catch {
      return [];
    }
  }, []);

  const toggle = (d: SkillDomain) =>
    setSelected((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const start = () => {
    if (selected.length === 0 && !customTopic.trim()) {
      setError("Pick at least one topic, or type what you learned!");
      return;
    }
    // Creates the assignment locally via the math composer in session.ts.
    // NOTE (future DB persist): also POST the assignment to supabase here.
    const assignment = generateAssignment(selected, customTopic, 10);
    saveAssignment(assignment);
    setSheet(null);
    router.push("/practice");
  };

  const startWithDomain = (d: SkillDomain) => {
    const assignment = generateAssignment([d], "", 10);
    saveAssignment(assignment);
    setSheet(null);
    router.push("/practice");
  };

  // Winding path: today's pick first (current), the rest of the topics,
  // then plan-queue skills, then the prize chest. Two taps to start:
  // tap a node, tap Let's go in the confirm sheet.
  const nodes: LessonNode[] = useMemo(() => {
    const ordered = [...SKILL_DOMAINS].sort((a, b) => {
      const ai = selected.includes(a.id) ? 0 : 1;
      const bi = selected.includes(b.id) ? 0 : 1;
      return ai - bi;
    });
    const path: LessonNode[] = ordered.map((d, i) => ({
      id: `domain:${d.id}`,
      label: KID_SHORT[d.id],
      state: i === 0 ? "current" : selected.includes(d.id) ? "done" : "done",
    }));
    for (const s of planSkills) {
      path.push({ id: `skill:${s.id}`, label: shortSkillName(s.name), state: "done" });
    }
    path.push({ id: "chest:prizes", label: "Prize chest", state: "chest" });
    return path;
  }, [selected, planSkills]);

  const onSelectNode = (id: string) => {
    if (id === "chest:prizes") {
      router.push("/rewards");
      return;
    }
    if (id.startsWith("domain:")) {
      const d = id.slice("domain:".length) as SkillDomain;
      setSheet(d);
      return;
    }
    if (id.startsWith("skill:")) {
      const skillId = id.slice("skill:".length);
      const skill = SKILLS.find((s) => s.id === skillId);
      if (skill) startWithDomain(skill.domain);
    }
  };

  const sheetDomain = sheet ? SKILL_DOMAINS.find((d) => d.id === sheet) : null;
  const sheetPicked = sheet ? selected.includes(sheet) : false;
  const hour = new Date().getHours();
  const greetText = hour < 12 ? "Good morning!" : hour < 17 ? "Good afternoon!" : "Good evening!";

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 px-5 py-8">
        <p className="text-kid-lg font-semibold text-muted">Pick who&apos;s playing… 🎒</p>
        <ChunkyButton onClick={() => router.push("/profiles")}>Choose who&apos;s playing</ChunkyButton>
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-5 pb-8 pt-6 md:max-w-4xl">
      <PageFade>
        <div className="flex flex-col gap-5">
          <QuickStart />

          {/* Header: streak + gems */}
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StreakFlame count={progress.streakCount} />
              <GemCounter gems={progress.xp} label={`${progress.xp} stars`} />
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-4">
              <Character pose="happy" size={104} label="Mascot greeting you today" />
              <div>
                <h1 className="font-display text-kid-3xl font-semibold tracking-tight">
                  {greetText} ☀️
                </h1>
                <p className="text-kid-lg font-semibold text-muted">
                  What did you learn in class today? Tap a circle to play!
                </p>
              </div>
            </div>
          </header>

          {/* Winding lesson path */}
          <DuoCard title="Today's path" subtitle="Tap a circle, then Let's go!">
            <LessonPath nodes={nodes} onSelect={onSelectNode} />
          </DuoCard>

          {/* Topic picker stays reachable below the path */}
          <DuoCard title="What did you learn?" subtitle="Tap one or more topics">
            <div className="flex flex-col gap-4">
              <TopicGrid selected={selected} onToggle={toggle} />
              <div>
                <label htmlFor="custom-topic" className="font-display text-kid-lg font-semibold">
                  Anything else? <span className="font-body text-kid-sm font-semibold text-muted">(you can type it!)</span>
                </label>
                <input
                  id="custom-topic"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="Example: long division with remainders…"
                  className="touch-target mt-2 w-full rounded-2xl border-2 border-line bg-white px-5 py-3 text-kid-lg outline-none focus:border-primary"
                />
              </div>
              {error ? (
                <p className="text-kid-base font-bold text-coral" role="alert">
                  {error}
                </p>
              ) : null}
              <ChunkyButton onClick={start} size="lg" fullWidth shine>
                Start · 10 problems 🚀
              </ChunkyButton>
            </div>
          </DuoCard>

          <StudentNav />
        </div>
      </PageFade>

      {/* Topic confirm sheet: second tap starts practice */}
      {sheet && sheetDomain ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Start ${sheetDomain.name}`}
          onClick={() => setSheet(null)}
        >
          <div
            className="animate-duo-pop w-full max-w-md rounded-3xl border-2 border-line bg-card p-6"
            style={{ boxShadow: "0 6px 0 var(--chunky-shadow)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <Character pose="happy" size={72} label="Mascot ready to practice" />
              <div>
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
                  setSheet(null);
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
                    setSheet(null);
                  }}
                >
                  {sheetPicked ? "Unpick it" : "Pick it ✓"}
                </ChunkyButton>
                <ChunkyButton variant="secondary" className="flex-1" onClick={() => setSheet(null)}>
                  Not now
                </ChunkyButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
