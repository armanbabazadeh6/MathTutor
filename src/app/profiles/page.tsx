"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageFade } from "@/components/effects/PageFade";
import { Alert } from "@/components/duo/Alert";
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
  importBackup,
  loadProfiles,
  migrateLegacyOnce,
  parseBackup,
  processPhotoFile,
  purgeProfile,
  saveProfiles,
  setActiveProfile,
  verifyPin,
} from "@/lib/profile/store";
import type { BackupDoc, ProfilesDoc } from "@/lib/profile/store";

/**
 * Last successful export, remembered so the picker and the Me screen both
 * show a durable "Last backup: …" line. Device-local UI metadata: it is not
 * part of the backup format and survives a restore.
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

/**
 * Grown-up gate challenge: a two-digit multiplication, not the single-digit
 * addition the target user already does in their head. The gate guards
 * deleting a sibling's whole profile, so it has to be harder than the maths
 * the kid is practising.
 */
function makeGateChallenge(): { text: string; answer: number } {
  const a = 11 + Math.floor(Math.random() * 9);
  const b = 11 + Math.floor(Math.random() * 9);
  return { text: `${a} × ${b} = ?`, answer: a * b };
}

type Feedback = { tone: "success" | "error" | "info"; text: string };
type PinIntent = "play" | "customize";
type GatePurpose = "delete" | "import";

interface GateState {
  purpose: GatePurpose;
  profileId: string | null;
  /** PIN to check, or null for the maths challenge. */
  pinHash: string | null;
  challenge: { text: string; answer: number };
}

interface PendingImport {
  backup: BackupDoc;
  filename: string;
  before: number;
  after: number;
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
        className="h-24 w-24 shrink-0 rounded-full border-[3px] object-cover"
        style={{ borderColor: color, boxShadow: "0 4px 0 var(--chunky-shadow)" }}
      />
    );
  }
  return (
    <span
      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full text-6xl"
      style={{ backgroundColor: `${color}33`, border: `3px solid ${color}`, boxShadow: "0 4px 0 var(--chunky-shadow)" }}
      role="img"
      aria-label={name}
    >
      {animal}
    </span>
  );
}

/** The one state pill a tile can show — a nowrap row so tile bottoms stay level. */
function TilePill({ tone, children }: { tone: "playing" | "pin" | "idle"; children: string }) {
  const cls = tone === "playing" ? "bg-mint text-ink" : "bg-cream-deep text-ink-soft";
  return (
    <span
      className={`inline-flex min-h-[28px] max-w-full items-center justify-center gap-1 whitespace-nowrap rounded-pill px-2 py-1 font-display text-kid-xs font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

function PinPad({
  onDigit,
  onBack,
  maxLen = 4,
  disabled = false,
}: {
  onDigit: (d: string) => void;
  onBack: () => void;
  maxLen?: number;
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
      <span className="sr-only">Maximum {maxLen} digits</span>
    </div>
  );
}

const inputCls =
  "mt-2 w-full rounded-2xl border-2 border-line bg-white px-5 py-3 text-kid-base font-semibold text-ink outline-none focus:border-primary min-h-[56px] disabled:opacity-55";
const labelCls = "font-display text-kid-base font-bold";

export default function ProfilesPage() {
  const router = useRouter();
  const [doc, setDoc] = useState<ProfilesDoc | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
  const [animal, setAnimal] = useState<string>(PROFILE_ANIMALS[0]);
  const [addError, setAddError] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastBackup, setLastBackup] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // PIN gate for entering / customising a PIN-protected player.
  const [pinFor, setPinFor] = useState<{ id: string; intent: PinIntent } | null>(null);
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinMisses, setPinMisses] = useState(0);
  const [pinLocked, setPinLocked] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Grown-up gate: delete a player, or restore a backup over everyone.
  const [gate, setGate] = useState<GateState | null>(null);
  const [gateValue, setGateValue] = useState("");
  const [gateError, setGateError] = useState("");
  const [gateMisses, setGateMisses] = useState(0);
  const [gateLocked, setGateLocked] = useState(false);
  const gateInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);

  useEffect(() => {
    migrateLegacyOnce();
    setDoc(loadProfiles());
    setLastBackup(readLastBackup());
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
      const clean = name.trim();
      const clash = cur.profiles.find((p) => p.name.toLowerCase() === clean.toLowerCase());
      if (clash) throw new Error(`There's already a player called ${clash.name} — pick another name!`);
      const { doc: next, profile } = addProfileWithRandomSalt(cur, {
        name: clean,
        color,
        animal,
        avatarDataUrl: photo || undefined,
      });
      // The kid we just made is the one playing now: the header and the tile
      // must say so straight away, not whoever was active before.
      persist(setActiveProfile(next, profile.id));
      setShowAdd(false);
      setName("");
      setPhoto("");
      setColor(PROFILE_COLORS[0]);
      setAnimal(PROFILE_ANIMALS[0]);
      setFeedback({ tone: "success", text: `${profile.name} is playing now! 🎉` });
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Couldn't add that player — try again!");
    }
  };

  const pickAddPhoto = async (f: File | undefined) => {
    if (!f) return;
    setAddError("");
    try {
      setPhoto(await processPhotoFile(f));
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Couldn't read that photo — try another one!");
    }
  };

  const openPin = (id: string, intent: PinIntent) => {
    setPinFor({ id, intent });
    setPinEntry("");
    setPinError("");
    setPinMisses(0);
    setPinLocked(false);
  };

  /** Entering a player and customising them both need that player's PIN. */
  const requestPlay = (id: string) => {
    const cur = loadProfiles();
    const p = cur.profiles.find((x) => x.id === id);
    if (!p) return;
    if (p.pinHash) {
      openPin(id, "play");
      return;
    }
    persist(setActiveProfile(cur, id));
    router.push("/");
  };

  const requestCustomize = (id: string) => {
    const cur = loadProfiles();
    const p = cur.profiles.find((x) => x.id === id);
    if (!p) return;
    if (p.pinHash) {
      openPin(id, "customize");
      return;
    }
    persist(setActiveProfile(cur, id));
    router.push("/profile");
  };

  const submitPin = () => {
    if (!pinFor) return;
    const cur = loadProfiles();
    const p = cur.profiles.find((x) => x.id === pinFor.id);
    if (!p) {
      setPinFor(null);
      return;
    }
    if (verifyPin(p.pinHash, pinEntry)) {
      const intent = pinFor.intent;
      persist(setActiveProfile(cur, p.id));
      setPinFor(null);
      setPinEntry("");
      setPinMisses(0);
      setPinLocked(false);
      router.push(intent === "play" ? "/" : "/profile");
      return;
    }
    // Wrong PIN: count it, clear the field so the pad works again straight
    // away, refocus, and back off a little once it stops looking like a typo.
    const misses = pinMisses + 1;
    setPinMisses(misses);
    setPinEntry("");
    pinInputRef.current?.focus();
    const delay = misses < 3 ? 0 : Math.min(5000, (misses - 2) * 1000);
    if (delay > 0) {
      setPinLocked(true);
      window.setTimeout(() => setPinLocked(false), delay);
      setPinError(`Let's have a little rest, then try again. 🙂 (${misses} tries)`);
    } else {
      setPinError("Hmm, that PIN didn't match — have another go!");
    }
  };

  const openGate = (purpose: GatePurpose, profileId: string | null) => {
    const cur = loadProfiles();
    const target = profileId ? cur.profiles.find((p) => p.id === profileId) ?? null : null;
    const pinHash = target?.pinHash ?? getActiveProfile(cur)?.pinHash ?? null;
    setGate({ purpose, profileId, pinHash, challenge: makeGateChallenge() });
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
    const ok = gate.pinHash
      ? verifyPin(gate.pinHash, gateValue)
      : Number(gateValue) === gate.challenge.answer;
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
    if (decided.purpose === "delete" && decided.profileId) {
      const removed = loadProfiles().profiles.find((p) => p.id === decided.profileId);
      // purgeProfile drops the player *and* every mt.p.<id>.* payload, so a
      // sibling cannot inherit the deleted kid's progress.
      purgeProfile(decided.profileId);
      const after = loadProfiles();
      setDoc(after);
      if (after.profiles.some((p) => p.id === decided.profileId)) {
        setFeedback({ tone: "error", text: "Couldn't remove that player — please try again." });
      } else {
        setFeedback({ tone: "success", text: `${removed?.name ?? "Player"} was removed.` });
      }
      return;
    }
    runImport();
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
      setMenuFor(null);
      openGate("import", null);
    } catch (e) {
      setFeedback({
        tone: "error",
        text: e instanceof Error ? e.message : "That backup file doesn't look right!",
      });
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
        setFeedback({ tone: "error", text: "That backup didn't restore — nothing was changed." });
        return;
      }
      setDoc(after);
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
  const gateProfile = gate?.profileId ? doc.profiles.find((p) => p.id === gate.profileId) ?? null : null;
  const gateMax = gate?.pinHash ? 4 : 3;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-5 pb-8 pt-6 md:max-w-4xl">
      <PageFade>
        <div className="flex flex-col gap-5">
          <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
            <Character pose="cheer" size={104} label="Mascot cheering who is playing" />
            <div className="min-w-0">
              <h1 className="font-display text-kid-2xl font-semibold tracking-tight sm:text-kid-3xl">
                Who&apos;s playing?
              </h1>
              <p className="break-words text-kid-base font-semibold text-muted">
                {active ? `${active.name} is playing now.` : "Tap your face to jump in."}
              </p>
            </div>
          </header>

          {empty ? <WelcomeHero onStart={() => setShowAdd(true)} /> : null}

          {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

          {!empty ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {doc.profiles.map((p, i) => {
                const playing = p.id === doc.activeProfileId;
                return (
                  <li
                    key={p.id}
                    className="relative mt-stagger-item min-w-0"
                    style={{ ["--mt-delay" as string]: `${Math.min(i, 8) * 60}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => requestPlay(p.id)}
                      aria-label={`Enter as ${p.name}`}
                      className={`duo-press touch-target mt-focus flex min-h-44 w-full min-w-0 flex-col items-center justify-center gap-3 rounded-card border-2 bg-card p-3 pt-6 text-center sm:p-4 ${
                        playing ? "border-primary" : "border-line"
                      }`}
                      style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
                    >
                      <AvatarFace name={p.name} animal={p.animal} color={p.color} photo={p.avatarDataUrl} />
                      <span className="w-full min-w-0 break-words font-display text-kid-lg font-semibold text-ink sm:text-kid-xl">
                        {p.name}
                      </span>
                      {playing ? (
                        <TilePill tone="playing">● Playing now</TilePill>
                      ) : p.pinHash ? (
                        <TilePill tone="pin">🔒 PIN</TilePill>
                      ) : (
                        <TilePill tone="idle">Tap to play</TilePill>
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
              <li className="min-w-0">
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

          <DuoCard
            title={empty ? "Grown-ups 💾" : "Backup 💾"}
            subtitle={
              empty
                ? "Restore a backup file made on this device."
                : lastBackup
                  ? `Last backup: ${lastBackup}`
                  : "So an iPad wipe can't erase progress"
            }
          >
            <div className="flex flex-wrap gap-3">
              {!empty ? (
                <ChunkyButton variant="secondary" onClick={doExport}>
                  Export backup ⬇️
                </ChunkyButton>
              ) : null}
              <label
                className="duo-press touch-target inline-flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-6 font-display text-kid-sm font-semibold uppercase tracking-wide text-ink"
                style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
              >
                {empty ? "Restore a backup ⬆️" : "Import ⬆️"}
                <input
                  type="file"
                  accept="application/json"
                  className="sr-only"
                  onChange={(e) => void pickImportFile(e.target.files?.[0])}
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
          <p className="mt-1 text-kid-sm font-semibold text-muted">Name, a color and an animal buddy.</p>
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
              <p className={labelCls}>Photo (optional)</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label
                  className="duo-press touch-target mt-focus inline-flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-5 font-display text-kid-sm font-bold uppercase tracking-wide text-ink"
                  style={{ boxShadow: "0 4px 0 var(--chunky-shadow)" }}
                >
                  📷 {photo ? "Change photo" : "Add photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void pickAddPhoto(e.target.files?.[0])}
                  />
                </label>
                {photo ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt={`${name || "New player"} photo preview`}
                      className="h-14 w-14 shrink-0 rounded-full border-2 border-line object-cover"
                    />
                    <ChunkyButton variant="secondary" size="sm" onClick={() => setPhoto("")}>
                      Remove
                    </ChunkyButton>
                  </>
                ) : null}
              </div>
            </div>
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
            <h2 className="break-words font-display text-kid-xl font-semibold">{menuProfile.name}</h2>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            <ChunkyButton
              onClick={() => {
                const id = menuProfile.id;
                setMenuFor(null);
                requestPlay(id);
              }}
            >
              Play as {menuProfile.name} ▶️
            </ChunkyButton>
            <ChunkyButton
              variant="secondary"
              onClick={() => {
                const id = menuProfile.id;
                setMenuFor(null);
                requestCustomize(id);
              }}
            >
              Customize ✏️
              {menuProfile.pinHash ? (
                <span className="rounded-pill bg-cream-deep px-2 py-0.5 font-display text-kid-xs font-bold uppercase tracking-wide text-ink-soft">
                  🔒 PIN protected
                </span>
              ) : null}
            </ChunkyButton>
            <ChunkyButton
              variant="coral"
              onClick={() => {
                const id = menuProfile.id;
                setMenuFor(null);
                openGate("delete", id);
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
          <p className="mt-1 text-kid-sm font-semibold text-muted">
            4 digits to unlock this player. Nobody can see them as you type.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <input
              ref={pinInputRef}
              value={pinEntry}
              onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, "").slice(0, 4))}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              disabled={pinLocked}
              aria-label="PIN"
              className={`${inputCls} text-center text-kid-xl tracking-[0.5em]`}
            />
            <PinPad
              disabled={pinLocked}
              onDigit={(d) => setPinEntry((v) => (v.length >= 4 ? v : v + d))}
              onBack={() => setPinEntry((v) => v.slice(0, -1))}
            />
            {pinError ? (
              <Alert tone="error">{pinError}</Alert>
            ) : null}
            <div className="flex gap-3">
              <ChunkyButton onClick={submitPin} className="flex-1" disabled={pinLocked || pinEntry.length < 4} shine>
                Go! 🚀
              </ChunkyButton>
              <ChunkyButton variant="secondary" onClick={() => setPinFor(null)}>
                Back
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}

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
          ) : (
            <p className="mt-1 break-words text-kid-sm font-semibold text-muted">
              Removing {gateProfile?.name ?? "this player"} erases their progress on this device.
            </p>
          )}
          <p className="mt-3 font-display text-kid-lg font-semibold">
            {gate.pinHash ? "Type the current PIN to go on." : `What is ${gate.challenge.text}`}
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <input
              ref={gateInputRef}
              value={gateValue}
              onChange={(e) =>
                setGateValue(e.target.value.replace(/\D/g, "").slice(0, gateMax))
              }
              type={gate.pinHash ? "password" : "text"}
              inputMode="numeric"
              autoComplete="off"
              disabled={gateLocked}
              aria-label={gate.pinHash ? "Current PIN" : "Answer"}
              className={`${inputCls} text-center text-kid-xl ${gate.pinHash ? "tracking-[0.5em]" : ""}`}
            />
            <PinPad
              disabled={gateLocked}
              maxLen={gateMax}
              onDigit={(d) => setGateValue((v) => (v.length >= gateMax ? v : v + d))}
              onBack={() => setGateValue((v) => v.slice(0, -1))}
            />
            {gateError ? (
              <Alert tone="error">{gateError}</Alert>
            ) : null}
            <div className="flex gap-3">
              <ChunkyButton variant="coral" onClick={submitGate} className="flex-1" disabled={gateLocked}>
                {gate.purpose === "import" ? "Replace players" : "Remove player"}
              </ChunkyButton>
              <ChunkyButton variant="secondary" onClick={closeGate}>
                {gate.purpose === "import" ? "Keep mine" : "Keep"}
              </ChunkyButton>
            </div>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
