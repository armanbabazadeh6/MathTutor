"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { BottomNav } from "@/components/duo/BottomNav";
import {
  PROFILE_ANIMALS,
  PROFILE_COLORS,
  addProfileWithRandomSalt,
  exportBackup,
  backupToJson,
  downloadBackup,
  getActiveProfile,
  isValidPin,
  loadProfiles,
  migrateLegacyOnce,
  parseBackup,
  importBackup,
  processPhotoFile,
  removeProfile,
  saveProfiles,
  setActiveProfile,
  verifyPin,
} from "@/lib/profile/store";
import type { ProfilesDoc } from "@/lib/profile/store";

function AvatarFace({ name, animal, color, photo }: { name: string; animal: string; color: string; photo?: string }) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className="h-20 w-20 rounded-full border-[3px] object-cover"
        style={{ borderColor: color, boxShadow: "0 4px 0 var(--chunky-shadow)" }}
      />
    );
  }
  return (
    <span
      className="flex h-20 w-20 items-center justify-center rounded-full text-5xl"
      style={{ backgroundColor: `${color}33`, border: `3px solid ${color}`, boxShadow: "0 4px 0 var(--chunky-shadow)" }}
      role="img"
      aria-label={name}
    >
      {animal}
    </span>
  );
}

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="animate-duo-pop max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border-2 border-line bg-card p-6"
        style={{ boxShadow: "0 6px 0 var(--chunky-shadow)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
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
const labelCls = "text-kid-base font-bold font-display";

export default function ProfilesPage() {
  const router = useRouter();
  const [doc, setDoc] = useState<ProfilesDoc | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
  const [animal, setAnimal] = useState<string>(PROFILE_ANIMALS[0]);
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState("");
  const [gateFor, setGateFor] = useState<string | null>(null);
  const [gateAnswer, setGateAnswer] = useState("");
  const [gateError, setGateError] = useState("");
  const gate = useMemo(() => {
    const a = 5 + Math.floor(Math.random() * 10);
    const b = 3 + Math.floor(Math.random() * 10);
    return { a, b, sum: a + b, text: `${a} + ${b} = ?` };
  }, [gateFor]);

  useEffect(() => {
    migrateLegacyOnce();
    setDoc(loadProfiles());
  }, []);

  const persist = (next: ProfilesDoc) => {
    saveProfiles(next);
    setDoc(next);
  };

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    try {
      setPhoto(await processPhotoFile(f));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that photo — try another one!");
    }
  };

  const create = () => {
    setError("");
    try {
      if (!name.trim()) throw new Error("Please type a name first!");
      if (pin && !isValidPin(pin)) throw new Error("PIN must be exactly 4 digits (or leave it empty).");
      const cur = loadProfiles();
      const { doc: next } = addProfileWithRandomSalt(cur, {
        name: name.trim(),
        color,
        animal,
        avatarDataUrl: photo,
        pin: pin || undefined,
      });
      persist(next);
      setShowAdd(false);
      setName("");
      setPin("");
      setPhoto(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that kid — try again!");
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-5 pb-8 pt-6 md:max-w-4xl">
      <PageFade>
        <div className="flex flex-col gap-5">
          <header className="grid grid-cols-[auto_1fr] items-center gap-4">
            <Character pose="cheer" size={104} label="Mascot cheering who is playing" />
            <div>
              <h1 className="font-display text-kid-3xl font-semibold tracking-tight">Who&apos;s playing?</h1>
              <p className="text-kid-base font-semibold text-muted">
                Tap your face to jump in. {active ? `${active.name} is playing now.` : ""}
              </p>
            </div>
          </header>
          {doc.profiles.length === 0 ? (
            <section className="flex flex-col items-center gap-3 rounded-3xl border-2 border-line bg-sunny px-6 py-8 text-center" style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}>
              <p className="font-display text-kid-2xl font-semibold tracking-tight">Welcome to MathTutor! 🎉</p>
              <p className="max-w-md text-kid-base font-semibold text-ink">
                Your daily math quest that levels up with you. Create your player to start earning gems and prizes.
              </p>
              <ChunkyButton variant="primary" size="lg" onClick={() => setShowAdd(true)}>
                Create your player
              </ChunkyButton>
            </section>
          ) : null}

          {error ? (
            <p className="rounded-2xl border-2 border-coral bg-card px-4 py-3 text-kid-base font-bold text-coral" role="alert">
              {error}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {doc.profiles.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => enter(p.id)}
                aria-label={`Enter as ${p.name}`}
                className="duo-press touch-target mt-stagger-item flex min-h-44 flex-col items-center gap-2 rounded-3xl border-2 border-line bg-card p-6 hover:border-primary"
                style={{ boxShadow: "0 4px 0 var(--chunky-shadow)", ["--mt-delay" as string]: `${Math.min(i, 8) * 60}ms` }}
              >
                <AvatarFace name={p.name} animal={p.animal} color={p.color} photo={p.avatarDataUrl} />
                <span className="font-display text-kid-xl font-semibold">{p.name}</span>
                {p.pinHash ? <span className="text-kid-sm font-bold text-muted">🔒 PIN</span> : null}
                {p.id === doc.activeProfileId ? (
                  <span className="rounded-pill bg-mint px-3 py-1 font-display text-kid-sm font-semibold text-ink">
                    ● playing
                  </span>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="duo-press touch-target flex min-h-44 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line bg-card p-6 font-display text-kid-lg font-semibold text-muted hover:border-primary"
              style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
            >
              <span aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-sunny font-display text-4xl text-ink">
                +
              </span>
              Add Kid
            </button>
          </div>

          {doc.profiles.length > 0 ? (
            <DuoCard title="Grown-up zone" subtitle="Removing a kid needs a quick math check" icon={<span aria-hidden className="text-3xl">🔐</span>}>
              <div className="flex flex-col gap-2">
                {doc.profiles.map((p) => (
                  <div key={p.id} className="flex min-h-[56px] items-center justify-between gap-3">
                    <span className="text-kid-base font-bold">
                      {p.animal} {p.name}
                    </span>
                    <ChunkyButton
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setGateFor(p.id);
                        setGateAnswer("");
                        setGateError("");
                      }}
                    >
                      Remove
                    </ChunkyButton>
                  </div>
                ))}
              </div>
            </DuoCard>
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
        <Sheet label="Add a kid" onClose={() => setShowAdd(false)}>
          <h2 className="font-display text-kid-xl font-semibold">Add a kid 🎉</h2>
          <p className="text-kid-sm font-semibold text-muted">Name + favorite color and animal</p>
          <div className="mt-4 flex flex-col gap-4">
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
                    className={`touch-target h-14 w-14 rounded-full border-2 ${color === c ? "border-primary ring-4 ring-primary ring-offset-2" : "border-line"}`}
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
                    className={`touch-target flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl border-2 p-2 text-3xl ${animal === a ? "border-primary bg-mint" : "border-line bg-card"}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={labelCls}>Photo (optional)</p>
              <div className="mt-2 flex items-center gap-3">
                <label
                  className="duo-press touch-target inline-flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-6 font-display text-kid-sm font-semibold uppercase tracking-wide text-ink"
                  style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
                >
                  📷 {photo ? "Change photo" : "Add photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void pickPhoto(e.target.files?.[0])}
                  />
                </label>
                {photo ? (
                  <img
                    src={photo}
                    alt="Preview"
                    className="h-14 w-14 rounded-full border-2 border-line object-cover"
                  />
                ) : null}
              </div>
            </div>
            <div>
              <label className={labelCls}>
                PIN (optional, 4 digits)
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="e.g. 1234"
                  aria-label="PIN, 4 digits"
                  className={`${inputCls} text-center tracking-widest`}
                />
              </label>
              <div className="mt-2">
                <PinPad
                  onDigit={(d) => setPin((v) => (v.length >= 4 ? v : v + d))}
                  onBack={() => setPin((v) => v.slice(0, -1))}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <ChunkyButton onClick={create} className="flex-1" shine>
                Add 🎉
              </ChunkyButton>
              <ChunkyButton variant="secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}

      {pinFor ? (
        <Sheet label="Type your PIN" onClose={() => setPinFor(null)}>
          <h2 className="font-display text-kid-xl font-semibold">Type your PIN 🔒</h2>
          <p className="text-kid-sm font-semibold text-muted">4 digits</p>
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
              <p className="font-semibold text-coral" role="alert">
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
        <Sheet label="Grown-up check" onClose={() => setGateFor(null)}>
          <h2 className="font-display text-kid-xl font-semibold">Grown-up check 🧮</h2>
          <p className="text-kid-sm font-semibold text-muted">What is {gate.text}</p>
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
              <p className="font-semibold text-coral" role="alert">
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
