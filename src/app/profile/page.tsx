"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
} from "@/lib/profile/store";
import type { ProfilesDoc } from "@/lib/profile/store";

export default function ProfilePage() {
  const router = useRouter();
  const [doc, setDoc] = useState<ProfilesDoc | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [usage, setUsage] = useState("");

  useEffect(() => {
    migrateLegacyOnce();
    const d = loadProfiles();
    setDoc(d);
    const a = getActiveProfile(d);
    setName(a?.name ?? "");
    setUsage(storageUsageNote());
  }, []);

  if (!doc) return <main className="mx-auto max-w-2xl px-5 py-8"><p>Loading…</p></main>;
  const active = getActiveProfile(doc);
  if (!active) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-5 py-8">
        <h1 className="text-4xl font-extrabold">My profile 👤</h1>
        <Card title="No kid yet" subtitle="Pick or add one first">
          <Button onClick={() => router.push("/profiles")}>Choose profile</Button>
        </Card>
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-5 py-8">
      <header className="flex items-center gap-4">
        {active.avatarDataUrl ? (
          <img src={active.avatarDataUrl} alt={active.name} className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-full text-5xl" style={{ backgroundColor: `${active.color}33`, border: `3px solid ${active.color}` }}>
            {active.animal}
          </span>
        )}
        <div>
          <h1 className="text-4xl font-extrabold">{active.name}</h1>
          <p className="text-muted">Playing since {new Date(active.createdAt).toLocaleDateString()}</p>
        </div>
      </header>

      {error ? <p className="text-lg font-semibold text-coral" role="alert">{error}</p> : null}
      {saved ? <p className="text-lg font-bold text-green-700" role="status">{saved}</p> : null}

      <Card title="Photo 📸" subtitle="A small square photo works best">
        <div className="flex items-center gap-3">
          <label className="touch-target inline-flex cursor-pointer items-center justify-center rounded-pill border-2 border-line bg-card px-6 py-3 text-lg font-bold">
            {active.avatarDataUrl ? "Change photo" : "Add photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          </label>
          {active.avatarDataUrl ? (
            <Button variant="secondary" onClick={() => persist(removeProfilePhoto(doc, active.id), "Photo removed!")}>Remove</Button>
          ) : null}
        </div>
      </Card>

      <Card title="Name ✏️">
        <div className="flex gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            aria-label="Name"
            className="flex-1 rounded-card border-2 border-line bg-white px-5 py-3 text-lg outline-none focus:border-primary"
          />
          <Button onClick={saveName}>Save</Button>
        </div>
      </Card>

      <Card title="Color 🎨">
        <div className="flex flex-wrap gap-2">
          {PROFILE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => persist(setProfileColor(doc, active.id, c))}
              aria-label={`Color ${c}`}
              className={`h-10 w-10 rounded-full ${active.color === c ? "ring-4 ring-offset-2 ring-primary" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </Card>

      <Card title="Animal 🦊">
        <div className="flex flex-wrap gap-2">
          {PROFILE_ANIMALS.map((a) => (
            <button
              key={a}
              onClick={() => persist(setProfileAnimal(doc, active.id, a))}
              aria-label={`Animal ${a}`}
              className={`rounded-full border-2 p-2 text-3xl ${active.animal === a ? "border-primary" : "border-line"}`}
            >
              {a}
            </button>
          ))}
        </div>
      </Card>

      <Card title="PIN 🔒" subtitle={active.pinHash ? "A PIN is set — type a new one to change it, or save empty to remove." : "No PIN yet — optional 4 digits."}>
        <div className="flex gap-3">
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="e.g. 1234"
            aria-label="New PIN"
            className="flex-1 rounded-card border-2 border-line bg-white px-5 py-3 text-lg outline-none focus:border-primary"
          />
          <Button onClick={savePin}>Save PIN</Button>
        </div>
      </Card>

      <Card title="My stars ⭐" subtitle="Progress saved under this profile">
        <ul className="flex flex-col gap-1 text-lg">
          <li>⭐ {stats.xp} XP</li>
          <li>🔥 {stats.streakCount}-day streak</li>
          <li>🎯 {stats.sessionsCompleted} sessions finished</li>
          <li>🪙 {stats.balance} coins</li>
          <li>📚 {stats.skillsTouched} skills touched</li>
        </ul>
      </Card>

      <Card title="Backup 💾" subtitle={usage}>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={doExport}>Export backup ⬇️</Button>
          <label className="touch-target inline-flex cursor-pointer items-center justify-center rounded-pill border-2 border-line bg-card px-6 py-3 text-lg font-bold">
            Import ⬆️
            <input type="file" accept="application/json" className="hidden" onChange={(e) => void doImport(e.target.files?.[0])} />
          </label>
          <Button variant="secondary" onClick={switchKid}>Switch kid 🔄</Button>
        </div>
      </Card>
    </main>
  );
}
