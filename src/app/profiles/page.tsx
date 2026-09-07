"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
    return <img src={photo} alt={name} className="h-20 w-20 rounded-full object-cover" />;
  }
  return (
    <span
      className="flex h-20 w-20 items-center justify-center rounded-full text-5xl"
      style={{ backgroundColor: `${color}33`, border: `3px solid ${color}` }}
      role="img"
      aria-label={name}
    >
      {animal}
    </span>
  );
}

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

  if (!doc) return <main className="mx-auto max-w-2xl px-5 py-8"><p>Loading…</p></main>;
  const active = getActiveProfile(doc);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-5 py-8">
      <header>
        <h1 className="text-4xl font-extrabold">Who&apos;s playing? 🎮</h1>
        <p className="text-lg text-muted">Tap your face to jump in. {active ? `${active.name} is playing now.` : ""}</p>
      </header>

      {error ? <p className="text-lg font-semibold text-coral" role="alert">{error}</p> : null}

      <div className="grid grid-cols-2 gap-4">
        {doc.profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => enter(p.id)}
            className="flex flex-col items-center gap-2 rounded-card border-2 border-line bg-card p-6 hover:border-primary"
            aria-label={`Enter as ${p.name}`}
          >
            <AvatarFace name={p.name} animal={p.animal} color={p.color} photo={p.avatarDataUrl} />
            <span className="text-xl font-extrabold">{p.name}</span>
            {p.pinHash ? <span className="text-sm text-muted">🔒 PIN</span> : null}
            {p.id === doc.activeProfileId ? <span className="text-sm font-bold text-primary">● playing</span> : null}
          </button>
        ))}
        <button
          onClick={() => setShowAdd(true)}
          className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line bg-card p-6 text-xl font-bold text-muted hover:border-primary"
        >
          <span className="text-5xl">➕</span> Add Kid
        </button>
      </div>

      {showAdd ? (
        <Card title="Add a kid" subtitle="Name + favorite color and animal">
          <div className="flex flex-col gap-4">
            <label className="text-lg font-bold">Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                placeholder="e.g. Maya"
                className="mt-2 w-full rounded-card border-2 border-line bg-white px-5 py-3 text-lg outline-none focus:border-primary"
              />
            </label>
            <div>
              <p className="text-lg font-bold">Color</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROFILE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    className={`h-10 w-10 rounded-full ${color === c ? "ring-4 ring-offset-2 ring-primary" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-lg font-bold">Animal</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROFILE_ANIMALS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAnimal(a)}
                    className={`rounded-full border-2 p-2 text-3xl ${animal === a ? "border-primary" : "border-line"}`}
                    aria-label={`Animal ${a}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-lg font-bold">Photo (optional)
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
                className="mt-2 w-full text-lg"
              />
            </label>
            {photo ? <img src={photo} alt="Preview" className="h-20 w-20 rounded-full object-cover" /> : null}
            <label className="text-lg font-bold">PIN (optional, 4 digits)
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                placeholder="e.g. 1234"
                className="mt-2 w-full rounded-card border-2 border-line bg-white px-5 py-3 text-lg outline-none focus:border-primary"
              />
            </label>
            <div className="flex gap-3">
              <Button onClick={create} className="flex-1">Add 🎉</Button>
              <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {pinFor ? (
        <Card title="Type your PIN 🔒" subtitle="4 digits">
          <div className="flex flex-col gap-3">
            <input
              value={pinEntry}
              onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              aria-label="PIN"
              className="w-full rounded-card border-2 border-line bg-white px-5 py-3 text-center text-2xl tracking-widest outline-none focus:border-primary"
            />
            {pinError ? <p className="font-semibold text-coral" role="alert">{pinError}</p> : null}
            <div className="flex gap-3">
              <Button onClick={submitPin} className="flex-1">Go! 🚀</Button>
              <Button variant="secondary" onClick={() => setPinFor(null)}>Back</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {doc.profiles.length > 0 ? (
        <Card title="Grown-up zone" subtitle="Removing a kid needs a quick math check">
          <div className="flex flex-col gap-2">
            {doc.profiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <span className="text-lg font-bold">{p.animal} {p.name}</span>
                <Button variant="secondary" onClick={() => { setGateFor(p.id); setGateAnswer(""); setGateError(""); }}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {gateFor ? (
        <Card title="Grown-up check 🧮" subtitle={`What is ${gate.text}`}>
          <div className="flex flex-col gap-3">
            <input
              value={gateAnswer}
              onChange={(e) => setGateAnswer(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              aria-label="Answer"
              className="w-full rounded-card border-2 border-line bg-white px-5 py-3 text-center text-2xl outline-none focus:border-primary"
            />
            {gateError ? <p className="font-semibold text-coral" role="alert">{gateError}</p> : null}
            <div className="flex gap-3">
              <Button onClick={confirmDelete} className="flex-1">Remove kid</Button>
              <Button variant="secondary" onClick={() => setGateFor(null)}>Keep</Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Backup" subtitle="So an iPad wipe can't erase progress">
        <div className="flex gap-3">
          <Button variant="secondary" onClick={doExport}>Export backup ⬇️</Button>
          <label className="touch-target inline-flex cursor-pointer items-center justify-center rounded-pill border-2 border-line bg-card px-6 py-3 text-lg font-bold">
            Import ⬆️
            <input type="file" accept="application/json" className="hidden" onChange={(e) => void doImport(e.target.files?.[0])} />
          </label>
        </div>
      </Card>
    </main>
  );
}
