"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { Alert } from "@/components/duo/Alert";
import { DuoCard } from "@/components/duo/Card";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";
import { EmptyState } from "@/components/duo/EmptyState";
import { BottomNav } from "@/components/duo/BottomNav";
import { Sheet } from "@/components/ui/Sheet";
import {
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
  purgeProfile,
  readProfileStats,
  removeProfilePhoto,
  renameProfile,
  saveProfiles,
  setActiveProfile,
  setProfileAnimal,
  setProfileColor,
  setProfilePhoto,
  setProfilePin,
  storageUsageNote,
  verifyPin,
} from "@/lib/profile/store";
import type { BackupDoc, ProfilesDoc } from "@/lib/profile/store";

/**
 * Last successful export, remembered so this screen and the picker both show
 * a durable "Last backup: …" line. Device-local UI metadata: it is not part of
 * the backup format and survives a restore.
 */
const LAST_BACKUP_KEY = "mt.backup.last.v1";

function readLastBackup(): string {
  try {
    return window.localStorage.getItem(LAST_BACKUP_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberLastBackup(filename: string): void {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, filename);
  } catch {
    /* storage blocked: the on-screen confirmation still shows */
  }
}

/** Grown-up gate: two-digit multiplication, harder than the kid's own maths. */
function makeGateChallenge(): { text: string; answer: number } {
  const a = 11 + Math.floor(Math.random() * 9);
  const b = 11 + Math.floor(Math.random() * 9);
  return { text: `${a} × ${b} = ?`, answer: a * b };
}

type Feedback = { tone: "success" | "error" | "info"; text: string };
type GatePurpose = "delete" | "import" | "unlock";

interface GateState {
  purpose: GatePurpose;
  /** PIN to check, or null for the maths challenge (always null for "unlock"). */
  pinHash: string | null;
  challenge: { text: string; answer: number };
}

interface PendingImport {
  backup: BackupDoc;
  filename: string;
  before: number;
  after: number;
}

function PinPad({
  onDigit,
  onBack,
  disabled = false,
}: {
  onDigit: (d: string) => void;
  onBack: () => void;
  disabled?: boolean;
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
          disabled={disabled}
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
        disabled={disabled}
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
  "flex-1 rounded-2xl border-2 border-line bg-white px-5 py-3 text-kid-base font-semibold text-ink outline-none focus:border-primary min-h-[56px] disabled:opacity-55";

export default function ProfilePage() {
  const router = useRouter();
  const [doc, setDoc] = useState<ProfilesDoc | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pinFeedback, setPinFeedback] = useState<Feedback | null>(null);
  const [usage, setUsage] = useState("");
  const [lastBackup, setLastBackup] = useState("");

  // An existing PIN must be typed before it can be changed or removed.
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [pinMisses, setPinMisses] = useState(0);
  const [pinLocked, setPinLocked] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const [gate, setGate] = useState<GateState | null>(null);
  const [gateValue, setGateValue] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateMisses, setGateMisses] = useState(0);
  const [gateLocked, setGateLocked] = useState(false);
  const gateInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  useEffect(() => {
    migrateLegacyOnce();
    const d = loadProfiles();
    setDoc(d);
    const a = getActiveProfile(d);
    setName(a?.name ?? "");
    setUsage(storageUsageNote());
    setLastBackup(readLastBackup());
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
  const hasProgress =
    stats.xp > 0 ||
    stats.streakCount > 0 ||
    stats.sessionsCompleted > 0 ||
    stats.balance > 0 ||
    stats.skillsTouched > 0;
  const pinSet = Boolean(active.pinHash);
  const gateMax = gate?.pinHash ? 4 : 3;

  const persist = (next: ProfilesDoc) => {
    saveProfiles(next);
    setDoc(next);
    // The storage note quotes a live byte count, so it has to be re-read
    // whenever a photo or a name changes the payload.
    setUsage(storageUsageNote());
  };

  const saveName = () => {
    setFeedback(null);
    try {
      persist(renameProfile(doc, active.id, name));
      setFeedback({ tone: "success", text: "Name saved! ✅" });
    } catch (e) {
      setFeedback({ tone: "error", text: e instanceof Error ? e.message : "Couldn't save — try again!" });
    }
  };

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setFeedback(null);
    try {
      const dataUrl = await processPhotoFile(f);
      persist(setProfilePhoto(doc, active.id, dataUrl));
      setFeedback({ tone: "success", text: "Photo updated! 📸" });
    } catch (e) {
      setFeedback({ tone: "error", text: e instanceof Error ? e.message : "Couldn't read that photo — try another one!" });
    }
  };

  const savePin = () => {
    setPinFeedback(null);
    setFeedback(null);
    if (pinSet && !pinUnlocked) return;
    if (!pin) {
      setPinFeedback({
        tone: "info",
        text: pinSet ? "Type 4 digits for the new PIN — or use Remove PIN if you'd like none at all." : "Type 4 digits to add a PIN. It's optional!",
      });
      return;
    }
    try {
      if (!isValidPin(pin)) throw new Error("A PIN is exactly 4 digits.");
      persist(setProfilePin(doc, active.id, pin, makeSalt()));
      setPin("");
      setPinUnlocked(false);
      setPinMisses(0);
      setPinFeedback({ tone: "success", text: pinSet ? "New PIN saved! 🔒" : "PIN saved! 🔒" });
    } catch (e) {
      setPinFeedback({ tone: "error", text: e instanceof Error ? e.message : "Couldn't save the PIN — try again!" });
    }
  };

  const unlockPin = () => {
    setPinFeedback(null);
    if (verifyPin(active.pinHash, currentPin)) {
      setPinUnlocked(true);
      setCurrentPin("");
      setPinMisses(0);
      setPinLocked(false);
      setPinFeedback({ tone: "success", text: "Unlocked — you can change or remove the PIN now." });
      return;
    }
    // Wrong PIN: count it, clear the field, refocus, then back off a little.
    const misses = pinMisses + 1;
    setPinMisses(misses);
    setCurrentPin("");
    pinInputRef.current?.focus();
    const delay = misses < 3 ? 0 : Math.min(5000, (misses - 2) * 1000);
    if (delay > 0) {
      setPinLocked(true);
      window.setTimeout(() => setPinLocked(false), delay);
      setPinFeedback({ tone: "error", text: `Let's have a little rest, then try again. 🙂 (${misses} tries)` });
    } else {
      setPinFeedback({ tone: "error", text: "Hmm, that PIN didn't match — have another go!" });
    }
  };

  const removePin = () => {
    setPinFeedback(null);
    setFeedback(null);
    if (!pinSet || !pinUnlocked) return;
    persist(clearProfilePin(doc, active.id));
    setPin("");
    setCurrentPin("");
    setPinUnlocked(false);
    setPinMisses(0);
    setPinFeedback({ tone: "success", text: "PIN removed! 🔓" });
  };

  const doExport = () => {
    const filename = `mathtutor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadBackup(filename, backupToJson(exportBackup()));
    rememberLastBackup(filename);
    setLastBackup(filename);
    setFeedback({ tone: "success", text: `Backup saved as ${filename} — keep it somewhere safe! ✅` });
  };

  const pickImportFile = async (f: File | undefined) => {
    if (!f) return;
    setFeedback(null);
    try {
      const text = await f.text();
      const backup = parseBackup(text);
      const before = loadProfiles().profiles.length;
      const after = backup.profiles.profiles.length;
      setPendingImport({ backup, filename: f.name, before, after });
      openGate("import");
    } catch (e) {
      setFeedback({ tone: "error", text: e instanceof Error ? e.message : "That backup file doesn't look right!" });
    }
  };

  const runImport = () => {
    const pending = pendingImport;
    setPendingImport(null);
    if (!pending) return;
    try {
      const next = importBackup(undefined, pending.backup);
      // Trust the store, not the writer: read it back before claiming success.
      const after = loadProfiles();
      if (after.profiles.length !== next.profiles.length) {
        setDoc(after);
        setName(getActiveProfile(after)?.name ?? "");
        setFeedback({ tone: "error", text: "That backup didn't restore — nothing was changed." });
        return;
      }
      setDoc(after);
      const nowActive = getActiveProfile(after);
      setName(nowActive?.name ?? "");
      setPin("");
      setPinUnlocked(false);
      setUsage(storageUsageNote());
      setFeedback({
        tone: "success",
        text: `Restored ${after.profiles.length} player${after.profiles.length === 1 ? "" : "s"} from ${pending.filename}. ✅`,
      });
    } catch (e) {
      setDoc(loadProfiles());
      setFeedback({
        tone: "error",
        text: e instanceof Error ? e.message : "That backup didn't restore — nothing was changed.",
      });
    }
  };

  const switchKid = () => {
    persist(setActiveProfile(doc, null));
    router.push("/profiles");
  };

  const openGate = (purpose: GatePurpose) => {
    // A PIN-protected profile guards its own removal and a device-wide
    // restore; "unlock" is reached only when the PIN is forgotten.
    const pinHash = purpose === "unlock" ? null : active.pinHash ?? null;
    setGate({ purpose, pinHash, challenge: makeGateChallenge() });
    setGateValue("");
    setGateError("");
    setGateMisses(0);
    setGateLocked(false);
  };

  const closeGate = () => {
    if (gate?.purpose === "import") setPendingImport(null);
    setGate(null);
  };

  const submitGate = () => {
    if (!gate) return;
    setGateError("");
    const ok = gate.pinHash ? verifyPin(gate.pinHash, gateValue) : Number(gateValue) === gate.challenge.answer;
    if (!ok) {
      const misses = gateMisses + 1;
      setGateMisses(misses);
      setGateValue("");
      gateInputRef.current?.focus();
      const delay = misses < 3 ? 0 : Math.min(5000, (misses - 2) * 1000);
      if (delay > 0) {
        setGateLocked(true);
        window.setTimeout(() => setGateLocked(false), delay);
        setGateError(`Let's have a little rest, then try again. 🙂 (${misses} tries)`);
      } else {
        setGateError(
          gate.pinHash ? "Hmm, that PIN didn't match — have another go!" : "Not quite — check the sum and try again!",
        );
      }
      return;
    }
    const decided = gate;
    setGate(null);
    setGateValue("");
    if (decided.purpose === "delete") {
      // purgeProfile drops the player *and* every mt.p.<id>.* payload, so the
      // next kid cannot inherit the removed kid's stars.
      purgeProfile(active.id);
      if (loadProfiles().profiles.some((p) => p.id === active.id)) {
        setFeedback({ tone: "error", text: "Couldn't remove this player — please try again." });
        return;
      }
      router.replace("/profiles");
      return;
    }
    if (decided.purpose === "unlock") {
      setPinUnlocked(true);
      setCurrentPin("");
      setPinMisses(0);
      setPinLocked(false);
      setPinFeedback({ tone: "success", text: "Unlocked — you can change or remove the PIN now." });
      return;
    }
    runImport();
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
          <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
            {active.avatarDataUrl ? (
              // Stored as a data URL in localStorage, so `next/image` cannot
              // optimise or proxy it — a plain <img> is the correct element.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.avatarDataUrl}
                alt={active.name}
                className="h-24 w-24 shrink-0 rounded-full border-[3px] object-cover"
                style={{ borderColor: active.color, boxShadow: "0 4px 0 var(--chunky-shadow)" }}
              />
            ) : (
              <span
                className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full text-6xl"
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
            <div className="min-w-0">
              <h1 className="break-words font-display text-kid-3xl font-semibold tracking-tight">{active.name}</h1>
              <p className="text-kid-base font-semibold text-muted">
                Playing since {new Date(active.createdAt).toLocaleDateString()}
              </p>
            </div>
          </header>

          {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

          <DuoCard title="Photo 📸" subtitle="Optional! A square photo is easy to spot on the players screen.">
            <div className="flex flex-wrap items-center gap-3">
              <label
                className="duo-press touch-target mt-focus inline-flex min-h-[56px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-skyink px-6 font-display text-kid-sm font-bold uppercase tracking-wide text-white"
                style={{ border: "2px solid #084f72", boxShadow: "0 4px 0 #084f72" }}
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
                <ChunkyButton variant="secondary" size="sm" onClick={() => persist(removeProfilePhoto(doc, active.id))}>
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
            subtitle={
              !pinSet
                ? "Optional 4 digits — it keeps a snooping sibling out."
                : pinUnlocked
                  ? "Unlocked — set a new PIN below, or remove it."
                  : "A PIN is on. Type it to change or remove it."
            }
          >
            <div className="flex flex-col gap-3">
              {!pinSet || pinUnlocked ? (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="4 digits"
                      aria-label="New PIN"
                      className={`${inputCls} text-center tracking-[0.5em]`}
                    />
                    <ChunkyButton onClick={savePin}>{pinSet ? "Save new PIN" : "Save PIN"}</ChunkyButton>
                  </div>
                  <PinPad
                    onDigit={(d) => setPin((v) => (v.length >= 4 ? v : v + d))}
                    onBack={() => setPin((v) => v.slice(0, -1))}
                  />
                  {pinSet ? (
                    <ChunkyButton variant="secondary" onClick={removePin}>
                      Remove PIN 🔓
                    </ChunkyButton>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="text-kid-sm font-semibold text-muted">Nobody can see the digits as you type them.</p>
                  <input
                    ref={pinInputRef}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={pinLocked}
                    aria-label="Current PIN"
                    className={`${inputCls} text-center text-kid-xl tracking-[0.5em]`}
                  />
                  <PinPad
                    disabled={pinLocked}
                    onDigit={(d) => setCurrentPin((v) => (v.length >= 4 ? v : v + d))}
                    onBack={() => setCurrentPin((v) => v.slice(0, -1))}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <ChunkyButton onClick={unlockPin} disabled={pinLocked || currentPin.length < 4}>
                      Unlock
                    </ChunkyButton>
                    <ChunkyButton variant="ghost" onClick={() => openGate("unlock")}>
                      Forgot it? Grown-up check
                    </ChunkyButton>
                  </div>
                </>
              )}
              {pinFeedback ? <Alert tone={pinFeedback.tone}>{pinFeedback.text}</Alert> : null}
            </div>
          </DuoCard>

          <DuoCard
            title="My stars ⭐"
            subtitle="Progress saved under this profile"
            icon={<Character pose="cheer" size={64} label="Mascot cheering your stars" />}
          >
            {hasProgress ? (
              <ul className="flex flex-col gap-2">
                {statRows.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center gap-3 rounded-2xl border-2 border-line bg-card px-4 py-2 text-kid-base font-bold"
                  >
                    <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sunny text-2xl">
                      {s.icon}
                    </span>
                    <span className="min-w-0 break-words">
                      {s.value} <span className="text-muted">{s.label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                pose="happy"
                title={`Nothing here yet, ${active.name}!`}
                body="Finish one round of practice and your XP, streak and coins land right here."
                action={<ChunkyButton onClick={() => router.push("/")}>Start playing ⭐</ChunkyButton>}
              />
            )}
          </DuoCard>

          <DuoCard title="Switch kid 🔄" subtitle="Let someone else take a turn">
            <ChunkyButton variant="sky" onClick={switchKid}>
              Choose another player
            </ChunkyButton>
          </DuoCard>

          <DuoCard title="Backup 💾" subtitle={lastBackup ? `Last backup: ${lastBackup}` : usage}>
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
                  onChange={(e) => void pickImportFile(e.target.files?.[0])}
                />
              </label>
            </div>
            <p className="mt-3 break-words text-kid-sm font-semibold text-muted">
              {lastBackup ? `${usage} ` : ""}
              Importing a backup replaces every player on this device.
            </p>
          </DuoCard>

          <DuoCard
            title="Start over 🧹"
            subtitle="Grown-ups can remove this player and their progress"
            icon={<span aria-hidden className="text-3xl">🛟</span>}
          >
            <ChunkyButton variant="secondary" onClick={() => openGate("delete")}>
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
        <Sheet title="Grown-up check" onClose={closeGate}>
          <h2 className="font-display text-kid-xl font-semibold">
            {gate.purpose === "import" ? "Restore this backup? 💾" : "Grown-up check 🔒"}
          </h2>
          {gate.purpose === "import" && pendingImport ? (
            <p className="mt-1 break-words text-kid-sm font-semibold text-muted">
              <span className="font-bold text-ink">
                Replace {pendingImport.before} player{pendingImport.before === 1 ? "" : "s"} with {pendingImport.after}?
              </span>{" "}
              This can&apos;t be undone.
            </p>
          ) : gate.purpose === "unlock" ? (
            <p className="mt-1 break-words text-kid-sm font-semibold text-muted">
              Answer as a grown-up to unlock the PIN controls for {active.name}.
            </p>
          ) : (
            <p className="mt-1 break-words text-kid-sm font-semibold text-muted">
              Removing {active.name} erases their progress on this device.
            </p>
          )}
          <p className="mt-3 font-display text-kid-lg font-semibold">
            {gate.pinHash ? "Type the current PIN to go on." : `What is ${gate.challenge.text}`}
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <input
              ref={gateInputRef}
              value={gateValue}
              onChange={(e) => setGateValue(e.target.value.replace(/\D/g, "").slice(0, gateMax))}
              type={gate.pinHash ? "password" : "text"}
              inputMode="numeric"
              autoComplete="off"
              disabled={gateLocked}
              aria-label={gate.pinHash ? "Current PIN" : "Answer"}
              className={`${inputCls} text-center text-kid-xl ${gate.pinHash ? "tracking-[0.5em]" : ""}`}
            />
            <PinPad
              disabled={gateLocked}
              onDigit={(d) => setGateValue((v) => (v.length >= gateMax ? v : v + d))}
              onBack={() => setGateValue((v) => v.slice(0, -1))}
            />
            {gateError ? <Alert tone="error">{gateError}</Alert> : null}
            <div className="flex gap-3">
              <ChunkyButton variant="coral" onClick={submitGate} className="flex-1" disabled={gateLocked}>
                {gate.purpose === "delete" ? "Remove kid" : gate.purpose === "import" ? "Replace players" : "Unlock"}
              </ChunkyButton>
              <ChunkyButton variant="secondary" onClick={closeGate}>
                {gate.purpose === "delete" ? "Keep" : gate.purpose === "import" ? "Keep mine" : "Cancel"}
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
