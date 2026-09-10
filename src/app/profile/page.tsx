"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { BottomNav } from "@/components/duo/BottomNav";
import { Sheet } from "@/components/ui/Sheet";
import {
  PHOTO_MAX_DIM,
  PROFILE_ANIMALS,
  PROFILE_COLORS,
  backupToJson,
  clearProfilePin,
  downloadBackup,
  exportBackup,
  getActiveProfile,
  importBackup,
  isValidPin,
  loadProfiles,
  makeSalt,
  migrateLegacyOnce,
  parseBackup,
  processPhotoFile,
  readProfileStats,
  removeProfile,
  removeProfilePhoto,
  renameProfile,
  saveProfiles,
  setActiveProfile,
  setProfileAnimal,
  setProfileColor,
  setProfilePhoto,
  setProfilePin,
  storageUsageNote,
} from "@/lib/profile/store";
import type { ProfilesDoc } from "@/lib/profile/store";

function PinPad({ onDigit, onBack }: { onDigit: (d: string) => void; onBack: () => void }) {
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
    </div>
  );
}

const inputCls =
  "flex-1 rounded-2xl border-2 border-line bg-white px-5 py-3 text-kid-base font-semibold text-ink outline-none focus:border-primary min-h-[56px]";

export default function ProfilePage() {
  const router = useRouter();
  const [doc, setDoc] = useState<ProfilesDoc | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [usage, setUsage] = useState("");
  const [gate, setGate] = useState<{ sum: number; text: string } | null>(null);
  const [gateAnswer, setGateAnswer] = useState("");
  const [gateError, setGateError] = useState("");

  useEffect(() => {
    migrateLegacyOnce();
    const d = loadProfiles();
    setDoc(d);
    const a = getActiveProfile(d);
    setName(a?.name ?? "");
    setUsage(storageUsageNote());
  }, []);

  if (!doc)
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-3 px-5 py-8">
        <Character pose="happy" size={96} label="Mascot loading profile" />
        <p className="font-display text-kid-lg font-semibold text-muted">Loading… 🎒</p>
      </main>
    );
  const active = getActiveProfile(doc);
  if (!active) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-5 py-8">
        <PageFade>
          <h1 className="font-display text-kid-3xl font-semibold tracking-tight">My profile 👤</h1>
          <DuoCard title="No kid yet" subtitle="Pick or add one first" icon={<Character pose="think" size={64} label="Mascot thinking" />}>
            <ChunkyButton onClick={() => router.push("/profiles")}>Choose profile</ChunkyButton>
          </DuoCard>
        </PageFade>
      </main>
    );
  }
  const stats = readProfileStats(undefined, active.id);

  const persist = (next: ProfilesDoc, msg?: string) => {
    saveProfiles(next);
    setDoc(next);
    if (msg) {
      setSaved(msg);
      setTimeout(() => setSaved(""), 2500);
    }
  };

  const saveName = () => {
    setError("");
    try {
      persist(renameProfile(doc, active.id, name), "Name saved! ✅");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — try again!");
    }
  };

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    try {
      const dataUrl = await processPhotoFile(f);
      persist(setProfilePhoto(doc, active.id, dataUrl), "Photo updated! 📸");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that photo — try another one!");
    }
  };

  const savePin = () => {
    setError("");
    try {
      if (!pin) {
        persist(clearProfilePin(doc, active.id), "PIN removed! 🔓");
        return;
      }
      if (!isValidPin(pin)) throw new Error("PIN must be exactly 4 digits (or empty to remove).");
      persist(setProfilePin(doc, active.id, pin, makeSalt()), "PIN saved! 🔒");
      setPin("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the PIN — try again!");
    }
  };

  const doExport = () => {
    downloadBackup(`mathtutor-backup-${new Date().toISOString().slice(0, 10)}.json`, backupToJson(exportBackup()));
  };

  const doImport = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    try {
      const text = await f.text();
      const next = importBackup(undefined, parseBackup(text));
      setDoc(next);
      setName(getActiveProfile(next)?.name ?? "");
      setSaved("Backup restored! ✅");
      setTimeout(() => setSaved(""), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That backup file doesn't look right!");
    }
  };

  const switchKid = () => {
    persist(setActiveProfile(doc, null));
    router.push("/profiles");
  };

  const openGate = () => {
    const a = 5 + Math.floor(Math.random() * 10);
    const b = 3 + Math.floor(Math.random() * 10);
    setGate({ sum: a + b, text: `${a} + ${b} = ?` });
    setGateAnswer("");
    setGateError("");
  };

  const confirmDelete = () => {
    setGateError("");
    if (!gate) return;
    if (Number(gateAnswer) !== gate.sum) {
      setGateError("Grown-ups only past this point — check the math and try again!");
      return;
    }
    persist(removeProfile(doc, active.id));
    setGate(null);
    router.replace("/profiles");
  };

  const statRows = [
    { icon: "⭐", label: "XP", value: String(stats.xp) },
    { icon: "🔥", label: "day streak", value: String(stats.streakCount) },
    { icon: "🎯", label: "sessions finished", value: String(stats.sessionsCompleted) },
    { icon: "🪙", label: "coins", value: String(stats.balance) },
    { icon: "📚", label: "skills touched", value: String(stats.skillsTouched) },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-5 pb-8 pt-6 md:max-w-4xl">
      <PageFade>
        <div className="mt-stagger flex flex-col gap-5">
          <header className="grid grid-cols-[auto_1fr] items-center gap-4">
            {active.avatarDataUrl ? (
              <img
                src={active.avatarDataUrl}
                alt={active.name}
                className="h-24 w-24 rounded-full border-[3px] object-cover"
                style={{ borderColor: active.color, boxShadow: "0 4px 0 var(--chunky-shadow)" }}
              />
            ) : (
              <span
                className="flex h-24 w-24 items-center justify-center rounded-full text-6xl"
                style={{
                  backgroundColor: `${active.color}33`,
                  border: `3px solid ${active.color}`,
                  boxShadow: "0 4px 0 var(--chunky-shadow)",
                }}
                role="img"
                aria-label={active.name}
              >
                {active.animal}
              </span>
            )}
            <div>
              <h1 className="font-display text-kid-3xl font-semibold tracking-tight">{active.name}</h1>
              <p className="text-kid-base font-semibold text-muted">
                Playing since {new Date(active.createdAt).toLocaleDateString()}
              </p>
            </div>
          </header>

          {error ? (
            <p className="rounded-2xl border-2 border-coral bg-card px-4 py-3 text-kid-base font-bold text-coralink" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="animate-duo-pop rounded-2xl border-2 border-primary bg-mint px-4 py-3 text-kid-base font-bold text-ink" role="status">
              {saved}
            </p>
          ) : null}

          <DuoCard title="Photo 📸" subtitle={`Square photos work best — we shrink them to ${PHOTO_MAX_DIM}px.`}>
            <div className="flex flex-wrap items-center gap-3">
              <label
                className="duo-press touch-target inline-flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-2xl bg-sky px-6 font-display text-kid-sm font-semibold uppercase tracking-wide text-white"
                style={{ border: "2px solid var(--color-sky-dark)", boxShadow: "0 4px 0 var(--color-sky-dark)" }}
              >
                {active.avatarDataUrl ? "📷 Change photo" : "📷 Add photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void pickPhoto(e.target.files?.[0])}
                />
              </label>
              {active.avatarDataUrl ? (
                <ChunkyButton variant="secondary" size="sm" onClick={() => persist(removeProfilePhoto(doc, active.id), "Photo removed!")}>
                  Remove
                </ChunkyButton>
              ) : null}
            </div>
          </DuoCard>

          <DuoCard title="Name ✏️">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                aria-label="Name"
                className={inputCls}
              />
              <ChunkyButton onClick={saveName}>Save</ChunkyButton>
            </div>
          </DuoCard>

          <DuoCard title="Color 🎨" subtitle="Your favorite color">
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => persist(setProfileColor(doc, active.id, c))}
                  aria-label={`Color ${c}`}
                  aria-pressed={active.color === c}
                  className={`touch-target h-14 w-14 rounded-full border-2 ${active.color === c ? "border-primary ring-4 ring-primary ring-offset-2" : "border-line"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </DuoCard>

          <DuoCard title="Animal 🦊" subtitle="Your buddy">
            <div className="flex flex-wrap gap-2">
              {PROFILE_ANIMALS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => persist(setProfileAnimal(doc, active.id, a))}
                  aria-label={`Animal ${a}`}
                  aria-pressed={active.animal === a}
                  className={`touch-target flex min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl border-2 p-2 text-3xl ${active.animal === a ? "border-primary bg-mint" : "border-line bg-card"}`}
                >
                  {a}
                </button>
              ))}
            </div>
          </DuoCard>

          <DuoCard
            title="PIN 🔒"
            subtitle={active.pinHash ? "A PIN is set — type a new one to change it, or remove it below." : "No PIN yet — optional 4 digits."}
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="e.g. 1234"
                  aria-label="New PIN"
                  className={`${inputCls} text-center tracking-widest`}
                />
                <ChunkyButton onClick={savePin}>Save PIN</ChunkyButton>
              </div>
              <PinPad
                onDigit={(d) => setPin((v) => (v.length >= 4 ? v : v + d))}
                onBack={() => setPin((v) => v.slice(0, -1))}
              />
              {active.pinHash ? (
                <ChunkyButton
                  variant="secondary"
                  onClick={() => persist(clearProfilePin(doc, active.id), "PIN removed! 🔓")}
                >
                  Remove PIN 🔓
                </ChunkyButton>
              ) : null}
            </div>
          </DuoCard>

          <DuoCard
            title="My stars ⭐"
            subtitle="Progress saved under this profile"
            icon={<Character pose="cheer" size={64} label="Mascot cheering your stars" />}
          >
            <ul className="flex flex-col gap-2">
              {statRows.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center gap-3 rounded-2xl border-2 border-line bg-card px-4 py-2 text-kid-base font-bold"
                >
                  <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sunny text-2xl">
                    {s.icon}
                  </span>
                  <span>
                    {s.value} <span className="text-muted">{s.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </DuoCard>

          <DuoCard title="Backup 💾" subtitle={usage}>
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
              <ChunkyButton variant="sky" onClick={switchKid}>
                Switch kid 🔄
              </ChunkyButton>
            </div>
          </DuoCard>

          <DuoCard
            title="Start over 🧹"
            subtitle="Grown-ups can remove this player and their progress"
            icon={<span aria-hidden className="text-3xl">🛟</span>}
          >
            <ChunkyButton variant="secondary" onClick={openGate}>
              Remove player
            </ChunkyButton>
          </DuoCard>
        </div>
      </PageFade>

      <BottomNav
        items={[
          { id: "home", label: "Home", icon: <span aria-hidden className="text-2xl">🏠</span> },
          { id: "profiles", label: "Players", icon: <span aria-hidden className="text-2xl">😎</span> },
          { id: "profile", label: "Me", icon: <span aria-hidden className="text-2xl">👤</span> },
        ]}
        activeId="profile"
        onNavigate={(id) => {
          if (id === "home") router.push("/");
          else if (id === "profiles") router.push("/profiles");
        }}
      />

      {gate ? (
        <Sheet title="Grown-up check" onClose={() => setGate(null)}>
          <h2 className="font-display text-kid-xl font-semibold">Grown-up check 🧮</h2>
          <p className="mt-1 text-kid-sm font-semibold text-muted">
            Removing {active.name} erases their progress on this device. What is {gate.text}
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
              <ChunkyButton variant="secondary" onClick={() => setGate(null)}>
                Keep
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
