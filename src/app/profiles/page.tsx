"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { BottomNav } from "@/components/duo/BottomNav";
import { Sheet } from "@/components/ui/Sheet";
import { WelcomeHero } from "@/components/onboarding/WelcomeHero";
import {
  PROFILE_ANIMALS,
  PROFILE_COLORS,
  addProfileWithRandomSalt,
  backupToJson,
  downloadBackup,
  exportBackup,
  getActiveProfile,
  loadProfiles,
  migrateLegacyOnce,
  parseBackup,
  importBackup,
  removeProfile,
  saveProfiles,
  setActiveProfile,
  verifyPin,
} from "@/lib/profile/store";
import type { ProfilesDoc } from "@/lib/profile/store";

/** Grown-up gate challenge: a fresh two-digit addition per attempt. */
function makeGateChallenge(): { a: number; b: number; sum: number; text: string } {
  const a = 5 + Math.floor(Math.random() * 10);
  const b = 3 + Math.floor(Math.random() * 10);
  return { a, b, sum: a + b, text: `${a} + ${b} = ?` };
}

function AvatarFace({ name, animal, color, photo }: { name: string; animal: string; color: string; photo?: string }) {
  if (photo) {
    return (
      // Stored as a data URL in localStorage, so `next/image` cannot optimise
      // or proxy it — a plain <img> is the correct element here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        className="h-24 w-24 rounded-full border-[3px] object-cover"
        style={{ borderColor: color, boxShadow: "0 4px 0 var(--chunky-shadow)" }}
      />
    );
  }
  return (
    <span
      className="flex h-24 w-24 items-center justify-center rounded-full text-6xl"
      style={{ backgroundColor: `${color}33`, border: `3px solid ${color}`, boxShadow: "0 4px 0 var(--chunky-shadow)" }}
      role="img"
      aria-label={name}
    >
      {animal}
    </span>
  );
}

function PinPad({
  onDigit,
  onBack,
  maxLen = 4,
}: {
  onDigit: (d: string) => void;
  onBack: () => void;
  maxLen?: number;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Number pad">
      {keys.map((k) => (
        <ChunkyButton
          key={k}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onDigit(k)}
          aria-label={`Digit ${k}`}
        >
          {k}
        </ChunkyButton>
      ))}
      <ChunkyButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={onBack}
        aria-label="Delete last digit"
        className="col-span-3"
      >
        ⌫ Delete
      </ChunkyButton>
      <span className="sr-only">Maximum {maxLen} digits</span>
    </div>
  );
}

const inputCls =
  "mt-2 w-full rounded-2xl border-2 border-line bg-white px-5 py-3 text-kid-base font-semibold text-ink outline-none focus:border-primary min-h-[56px]";
const labelCls = "font-display text-kid-base font-bold";

export default function ProfilesPage() {
  const router = useRouter();
  const [doc, setDoc] = useState<ProfilesDoc | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
  const [animal, setAnimal] = useState<string>(PROFILE_ANIMALS[0]);
  const [addError, setAddError] = useState("");
  const [error, setError] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState("");
  const [gateFor, setGateFor] = useState<string | null>(null);
  const [gateAnswer, setGateAnswer] = useState("");
  const [gateError, setGateError] = useState("");
  const [gate, setGate] = useState(makeGateChallenge);
  // Picking a different player rolls a fresh challenge, so a previous answer
  // can never be carried over.
  useEffect(() => {
    if (gateFor) setGate(makeGateChallenge());
  }, [gateFor]);

  useEffect(() => {
    migrateLegacyOnce();
    setDoc(loadProfiles());
  }, []);

  const persist = (next: ProfilesDoc) => {
    saveProfiles(next);
    setDoc(next);
  };

  const create = () => {
    setAddError("");
    try {
      if (!name.trim()) throw new Error("Please type a name first!");
      const cur = loadProfiles();
      const { doc: next } = addProfileWithRandomSalt(cur, {
        name: name.trim(),
        color,
        animal,
      });
      persist(next);
      setShowAdd(false);
      setName("");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Couldn't add that player — try again!");
    }
  };

  const enter = (id: string) => {
    const cur = loadProfiles();
    const p = cur.profiles.find((x) => x.id === id);
    if (!p) return;
    if (p.pinHash) {
      setPinFor(id);
      setPinEntry("");
      setPinError("");
      return;
    }
    persist(setActiveProfile(cur, id));
    router.push("/");
  };

  const submitPin = () => {
    const cur = loadProfiles();
    const p = cur.profiles.find((x) => x.id === pinFor);
    if (!p) return;
    if (verifyPin(p.pinHash, pinEntry)) {
      persist(setActiveProfile(cur, p.id));
      setPinFor(null);
      router.push("/");
    } else {
      setPinError("Hmm, that PIN didn't match — try again!");
    }
  };

  const openGate = (id: string) => {
    setGateFor(id);
    setGateAnswer("");
    setGateError("");
  };

  const confirmDelete = () => {
    setGateError("");
    if (Number(gateAnswer) !== gate.sum) {
      setGateError("Grown-ups only past this point — check the math and try again!");
      return;
    }
    if (gateFor) persist(removeProfile(loadProfiles(), gateFor));
    setGateFor(null);
    setGateAnswer("");
  };

  const doExport = () => {
    const json = backupToJson(exportBackup());
    downloadBackup(`mathtutor-backup-${new Date().toISOString().slice(0, 10)}.json`, json);
  };

  const doImport = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    try {
      const text = await f.text();
      persist(importBackup(undefined, parseBackup(text)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That backup file doesn't look right!");
    }
  };

  if (!doc)
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-3 px-5 py-8">
        <Character pose="happy" size={96} label="Mascot loading profiles" />
        <p className="font-display text-kid-lg font-semibold text-muted">Loading players… 🎒</p>
      </main>
    );
  const active = getActiveProfile(doc);
  const empty = doc.profiles.length === 0;
  const menuProfile = menuFor ? doc.profiles.find((p) => p.id === menuFor) ?? null : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-5 pb-8 pt-6 md:max-w-4xl">
      <PageFade>
        <div className="flex flex-col gap-5">
          <header className="grid grid-cols-[auto_1fr] items-center gap-4">
            <Character pose="cheer" size={104} label="Mascot cheering who is playing" />
            <div>
              <h1 className="font-display text-kid-3xl font-semibold tracking-tight">Who&apos;s playing?</h1>
              <p className="text-kid-base font-semibold text-muted">
                {active ? `${active.name} is playing now.` : "Tap your face to jump in."}
              </p>
            </div>
          </header>

          {empty ? <WelcomeHero onStart={() => setShowAdd(true)} /> : null}

          {error ? (
            <p className="rounded-2xl border-2 border-coral bg-card px-4 py-3 text-kid-base font-bold text-coralink" role="alert">
              {error}
            </p>
          ) : null}

          {!empty ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {doc.profiles.map((p, i) => {
                const playing = p.id === doc.activeProfileId;
                return (
                  <li
                    key={p.id}
                    className="relative mt-stagger-item"
                    style={{ ["--mt-delay" as string]: `${Math.min(i, 8) * 60}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => enter(p.id)}
                      aria-label={`Enter as ${p.name}`}
                      className={`duo-press touch-target mt-focus flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-card border-2 bg-card p-4 pt-6 text-center ${
                        playing ? "border-primary" : "border-line"
                      }`}
                      style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
                    >
                      <AvatarFace name={p.name} animal={p.animal} color={p.color} photo={p.avatarDataUrl} />
                      <span className="font-display text-kid-xl font-semibold text-ink">{p.name}</span>
                      {playing ? (
                        <span className="rounded-pill bg-mint px-3 py-1 font-display text-kid-sm font-semibold text-ink">
                          ● Playing now
                        </span>
                      ) : p.pinHash ? (
                        <span className="rounded-pill bg-cream-deep px-3 py-1 font-display text-kid-sm font-semibold text-ink-soft">
                          🔒 PIN
                        </span>
                      ) : (
                        <span className="rounded-pill bg-cream-deep px-3 py-1 font-display text-kid-sm font-semibold text-ink-soft">
                          Tap to play
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMenuFor(p.id)}
                      aria-label={`Options for ${p.name}`}
                      className="duo-press touch-target mt-focus absolute right-1 top-1 flex items-center justify-center rounded-full border-2 border-line bg-card text-kid-xl font-bold text-ink-soft"
                      style={{ boxShadow: "0 2px 0 var(--chunky-shadow)" }}
                    >
                      <span aria-hidden>⋯</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  aria-label="Add a player"
                  className="duo-press touch-target mt-focus flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-card p-4 font-display text-kid-lg font-semibold text-muted hover:border-primary"
                  style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
                >
                  <span aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-sunny font-display text-4xl text-ink">
                    +
                  </span>
                  Add player
                </button>
              </li>
            </ul>
          ) : null}

          <DuoCard title="Backup" subtitle="So an iPad wipe can't erase progress" icon={<span aria-hidden className="text-3xl">💾</span>}>
            <div className="flex flex-wrap gap-3">
              <ChunkyButton variant="secondary" onClick={doExport}>
                Export backup ⬇️
              </ChunkyButton>
              <label
                className="duo-press touch-target inline-flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-6 font-display text-kid-sm font-semibold uppercase tracking-wide text-ink"
                style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
              >
                Import ⬆️
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={(e) => void doImport(e.target.files?.[0])}
                />
              </label>
            </div>
          </DuoCard>
        </div>
      </PageFade>

      <BottomNav
        items={[
          { id: "home", label: "Home", icon: <span aria-hidden className="text-2xl">🏠</span> },
          { id: "profiles", label: "Players", icon: <span aria-hidden className="text-2xl">😎</span> },
          { id: "profile", label: "Me", icon: <span aria-hidden className="text-2xl">👤</span> },
        ]}
        activeId="profiles"
        onNavigate={(id) => {
          if (id === "home") router.push("/");
          else if (id === "profile") router.push("/profile");
        }}
      />

      {showAdd ? (
        <Sheet title="Add a player" onClose={() => setShowAdd(false)}>
          <h2 className="font-display text-kid-xl font-semibold">Add a player 🎉</h2>
          <p className="mt-1 text-kid-sm font-semibold text-muted">Name, a favorite color and an animal buddy.</p>
          <div className="mt-5 flex flex-col gap-5">
            <label className={labelCls}>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                placeholder="e.g. Maya"
                className={inputCls}
              />
            </label>
            <div>
              <p className={labelCls}>Color</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROFILE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    aria-pressed={color === c}
                    className={`touch-target h-14 w-14 rounded-full border-2 ${
                      color === c ? "border-primary ring-4 ring-primary ring-offset-2" : "border-line"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className={labelCls}>Animal</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROFILE_ANIMALS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAnimal(a)}
                    aria-label={`Animal ${a}`}
                    aria-pressed={animal === a}
                    className={`touch-target flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl border-2 p-2 text-3xl ${
                      animal === a ? "border-primary bg-mint" : "border-line bg-card"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            {addError ? (
              <p className="font-bold text-coralink" role="alert">
                {addError}
              </p>
            ) : null}
            <div className="flex gap-3">
              <ChunkyButton onClick={create} className="flex-1" disabled={!name.trim()} shine>
                Create player
              </ChunkyButton>
              <ChunkyButton variant="secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}

      {menuProfile ? (
        <Sheet title={`Options for ${menuProfile.name}`} onClose={() => setMenuFor(null)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <AvatarFace
              name={menuProfile.name}
              animal={menuProfile.animal}
              color={menuProfile.color}
              photo={menuProfile.avatarDataUrl}
            />
            <h2 className="font-display text-kid-xl font-semibold">{menuProfile.name}</h2>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            <ChunkyButton
              onClick={() => {
                const id = menuProfile.id;
                setMenuFor(null);
                enter(id);
              }}
            >
              Play as {menuProfile.name} ▶️
            </ChunkyButton>
            <ChunkyButton
              variant="secondary"
              onClick={() => {
                const id = menuProfile.id;
                persist(setActiveProfile(loadProfiles(), id));
                setMenuFor(null);
                router.push("/profile");
              }}
            >
              Customize ✏️
            </ChunkyButton>
            <ChunkyButton
              variant="coral"
              onClick={() => {
                const id = menuProfile.id;
                setMenuFor(null);
                openGate(id);
              }}
            >
              Remove player
            </ChunkyButton>
            <ChunkyButton variant="ghost" onClick={() => setMenuFor(null)}>
              Close
            </ChunkyButton>
          </div>
        </Sheet>
      ) : null}

      {pinFor ? (
        <Sheet title="Type your PIN" onClose={() => setPinFor(null)}>
          <h2 className="font-display text-kid-xl font-semibold">Type your PIN 🔒</h2>
          <p className="mt-1 text-kid-sm font-semibold text-muted">4 digits</p>
          <div className="mt-4 flex flex-col gap-3">
            <input
              value={pinEntry}
              onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              aria-label="PIN"
              className={`${inputCls} text-center text-kid-xl tracking-widest`}
            />
            <PinPad
              onDigit={(d) => setPinEntry((v) => (v.length >= 4 ? v : v + d))}
              onBack={() => setPinEntry((v) => v.slice(0, -1))}
            />
            {pinError ? (
              <p className="font-bold text-coralink" role="alert">
                {pinError}
              </p>
            ) : null}
            <div className="flex gap-3">
              <ChunkyButton onClick={submitPin} className="flex-1" shine>
                Go! 🚀
              </ChunkyButton>
              <ChunkyButton variant="secondary" onClick={() => setPinFor(null)}>
                Back
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}

      {gateFor ? (
        <Sheet title="Grown-up check" onClose={() => setGateFor(null)}>
          <h2 className="font-display text-kid-xl font-semibold">Grown-up check 🧮</h2>
          <p className="mt-1 text-kid-sm font-semibold text-muted">
            Removing a player erases their progress on this device. What is {gate.text}
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <input
              value={gateAnswer}
              onChange={(e) => setGateAnswer(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              aria-label="Answer"
              className={`${inputCls} text-center text-kid-xl`}
            />
            <PinPad
              onDigit={(d) => setGateAnswer((v) => (v.length >= 3 ? v : v + d))}
              onBack={() => setGateAnswer((v) => v.slice(0, -1))}
              maxLen={3}
            />
            {gateError ? (
              <p className="font-bold text-coralink" role="alert">
                {gateError}
              </p>
            ) : null}
            <div className="flex gap-3">
              <ChunkyButton variant="coral" onClick={confirmDelete} className="flex-1">
                Remove kid
              </ChunkyButton>
              <ChunkyButton variant="secondary" onClick={() => setGateFor(null)}>
                Keep
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
