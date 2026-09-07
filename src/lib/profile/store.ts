// MathTutor — kid profiles (pure store + versioned localStorage persistence).
//
// Owns ONLY profile state. Session/points/plan stores stay where they are;
// the integrator namespaces them per profile using profileKey() below.
// All functions accept an optional StorageLike so tests can inject a mock;
// in the browser they default to window.localStorage, on the server they
// no-op / return defaults.

export interface Profile {
  id: string;
  name: string;
  /** Emoji animal avatar when no photo is set. */
  animal: string;
  color: string;
  avatarDataUrl?: string;
  /** "salt$hex" salted hash; absent = no PIN. */
  pinHash?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface ProfilesDoc {
  version: typeof PROFILE_VERSION;
  profiles: Profile[];
  activeProfileId: string | null;
  /** Deterministic id counter: next profile gets `kid-${nextId}`. */
  nextId: number;
}

export const PROFILE_VERSION = 1;
export const PROFILE_KEY = "mt.profiles.v1";
export const MIGRATION_FLAG_KEY = "mt.profiles.migrated.v1";

/** Photo constraints: downscaled to <=256px, JPEG ~0.7, hard reject >300KB. */
export const PHOTO_MAX_DIM = 256;
export const PHOTO_JPEG_QUALITY = 0.7;
export const MAX_PHOTO_BYTES = 300 * 1024;

export const PROFILE_COLORS = [
  "#FF6B6B",
  "#FFA94D",
  "#FFD43B",
  "#69DB7C",
  "#4DABF7",
  "#9775FA",
  "#F783AC",
  "#63E6BE",
] as const;

export const PROFILE_ANIMALS = ["🦊", "🐼", "🦁", "🐸", "🐰", "🐯", "🐨", "🦄"] as const;

/** Legacy un-namespaced keys adopted into the default profile exactly once. */
export const LEGACY_KEYS = [
  "mt.assignment.v1",
  "mt.lastResult.v1",
  "mt.progress.v1",
  "mt.newBadges.v1",
  "mt.points.v1",
  "mt.planSession.v2",
] as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }
  return null;
}

function resolveStore(s?: StorageLike | null): StorageLike | null {
  if (s !== undefined) return s;
  return defaultStorage();
}

// ---------- doc ----------

export function emptyProfilesDoc(): ProfilesDoc {
  return { version: PROFILE_VERSION, profiles: [], activeProfileId: null, nextId: 1 };
}

function sanitizeProfile(p: unknown): Profile | null {
  if (!p || typeof p !== "object") return null;
  const r = p as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.name !== "string") return null;
  const name = r.name.trim().slice(0, 24) || "Kid";
  const animal = typeof r.animal === "string" && r.animal ? r.animal : "🦊";
  const color = typeof r.color === "string" && r.color ? r.color : PROFILE_COLORS[0];
  const out: Profile = {
    id: r.id,
    name,
    animal,
    color,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    lastActiveAt: typeof r.lastActiveAt === "number" ? r.lastActiveAt : Date.now(),
  };
  if (typeof r.avatarDataUrl === "string" && r.avatarDataUrl.startsWith("data:image/")) {
    out.avatarDataUrl = r.avatarDataUrl;
  }
  if (typeof r.pinHash === "string" && r.pinHash.includes("$")) out.pinHash = r.pinHash;
  return out;
}

export function loadProfiles(store?: StorageLike | null): ProfilesDoc {
  const s = resolveStore(store);
  if (!s) return emptyProfilesDoc();
  try {
    const raw = s.getItem(PROFILE_KEY);
    if (!raw) return emptyProfilesDoc();
    const parsed = JSON.parse(raw) as Partial<ProfilesDoc>;
    if (parsed.version !== PROFILE_VERSION || !Array.isArray(parsed.profiles)) {
      return emptyProfilesDoc();
    }
    const profiles = parsed.profiles
      .map(sanitizeProfile)
      .filter((p): p is Profile => p !== null);
    const ids = new Set(profiles.map((p) => p.id));
    const activeProfileId =
      typeof parsed.activeProfileId === "string" && ids.has(parsed.activeProfileId)
        ? parsed.activeProfileId
        : null;
    // Repair nextId so ids stay unique + deterministic.
    let maxN = 0;
    for (const p of profiles) {
      const m = /^kid-(\d+)$/.exec(p.id);
      if (m) maxN = Math.max(maxN, Number(m[1]));
    }
    const nextId =
      typeof parsed.nextId === "number" && Number.isFinite(parsed.nextId) && parsed.nextId > maxN
        ? Math.floor(parsed.nextId)
        : maxN + 1;
    return { version: PROFILE_VERSION, profiles, activeProfileId, nextId };
  } catch {
    return emptyProfilesDoc();
  }
}

export function saveProfiles(doc: ProfilesDoc, store?: StorageLike | null): void {
  const s = resolveStore(store);
  if (!s) return;
  try {
    s.setItem(PROFILE_KEY, JSON.stringify(doc));
  } catch {
    /* storage full/blocked: profiles still work in memory */
  }
}

// ---------- CRUD (pure, operate on a doc) ----------

export interface NewProfileInput {
  name: string;
  color?: string;
  animal?: string;
  avatarDataUrl?: string;
  pin?: string;
}

export function nextProfileId(doc: ProfilesDoc): string {
  return `kid-${doc.nextId}`;
}

/** Deterministic id gen: `kid-${nextId}`, counter advances per add. */
export function addProfile(
  doc: ProfilesDoc,
  input: NewProfileInput,
  now = Date.now(),
): { doc: ProfilesDoc; profile: Profile } {
  const name = input.name.trim().slice(0, 24);
  if (!name) throw new Error("Please type a name first!");
  const profile: Profile = {
    id: nextProfileId(doc),
    name,
    animal: input.animal || "🦊",
    color: input.color || PROFILE_COLORS[(doc.nextId - 1) % PROFILE_COLORS.length],
    createdAt: now,
    lastActiveAt: now,
  };
  if (input.avatarDataUrl) {
    const err = validatePhotoDataUrl(input.avatarDataUrl);
    if (err) throw new Error(err);
    profile.avatarDataUrl = input.avatarDataUrl;
  }
  if (input.pin !== undefined && input.pin !== "") {
    profile.pinHash = hashPinForTest(input.pin, `salt-${profile.id}`);
  }
  return {
    doc: {
      ...doc,
      profiles: [...doc.profiles, profile],
      activeProfileId: doc.activeProfileId ?? profile.id,
      nextId: doc.nextId + 1,
    },
    profile,
  };
}

/** Browser path: same as addProfile but with a random salt for the PIN. */
export function addProfileWithRandomSalt(
  doc: ProfilesDoc,
  input: NewProfileInput,
  now = Date.now(),
): { doc: ProfilesDoc; profile: Profile } {
  const { doc: next, profile } = addProfile(doc, { ...input, pin: undefined }, now);
  if (input.pin !== undefined && input.pin !== "") {
    const added = next.profiles[next.profiles.length - 1];
    added.pinHash = hashPin(input.pin, makeSalt());
    saveProfilesTouched(next);
  }
  return { doc: next, profile: next.profiles[next.profiles.length - 1] ?? profile };
}

// Internal: placeholder to keep single-file API small; pages call saveProfiles.
function saveProfilesTouched(_doc: ProfilesDoc): void {
  /* pages persist via saveProfiles explicitly */
}

export function removeProfile(doc: ProfilesDoc, id: string): ProfilesDoc {
  const profiles = doc.profiles.filter((p) => p.id !== id);
  return {
    ...doc,
    profiles,
    activeProfileId:
      doc.activeProfileId === id ? (profiles[0]?.id ?? null) : doc.activeProfileId,
  };
}

export function renameProfile(doc: ProfilesDoc, id: string, name: string): ProfilesDoc {
  const clean = name.trim().slice(0, 24);
  if (!clean) throw new Error("Please type a name first!");
  return {
    ...doc,
    profiles: doc.profiles.map((p) => (p.id === id ? { ...p, name: clean } : p)),
  };
}

export function setProfileColor(doc: ProfilesDoc, id: string, color: string): ProfilesDoc {
  return { ...doc, profiles: doc.profiles.map((p) => (p.id === id ? { ...p, color } : p)) };
}

export function setProfileAnimal(doc: ProfilesDoc, id: string, animal: string): ProfilesDoc {
  return { ...doc, profiles: doc.profiles.map((p) => (p.id === id ? { ...p, animal } : p)) };
}

export function setProfilePhoto(doc: ProfilesDoc, id: string, avatarDataUrl?: string): ProfilesDoc {
  if (avatarDataUrl !== undefined) {
    const err = validatePhotoDataUrl(avatarDataUrl);
    if (err) throw new Error(err);
  }
  return {
    ...doc,
    profiles: doc.profiles.map((p) =>
      p.id === id ? { ...p, ...(avatarDataUrl === undefined ? {} : { avatarDataUrl }) } : p,
    ),
  };
}

export function removeProfilePhoto(doc: ProfilesDoc, id: string): ProfilesDoc {
  return {
    ...doc,
    profiles: doc.profiles.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p };
      delete next.avatarDataUrl;
      return next;
    }),
  };
}

export function setActiveProfile(
  doc: ProfilesDoc,
  id: string | null,
  now = Date.now(),
): ProfilesDoc {
  if (id !== null && !doc.profiles.some((p) => p.id === id)) return doc;
  return {
    ...doc,
    activeProfileId: id,
    profiles: doc.profiles.map((p) => (p.id === id ? { ...p, lastActiveAt: now } : p)),
  };
}

export function touchProfile(doc: ProfilesDoc, id: string, now = Date.now()): ProfilesDoc {
  return {
    ...doc,
    profiles: doc.profiles.map((p) => (p.id === id ? { ...p, lastActiveAt: now } : p)),
  };
}

export function getActiveProfile(doc: ProfilesDoc): Profile | null {
  return doc.profiles.find((p) => p.id === doc.activeProfileId) ?? null;
}

export function getProfile(doc: ProfilesDoc, id: string): Profile | null {
  return doc.profiles.find((p) => p.id === id) ?? null;
}

// ---------- PIN: simple salted hash (kid gate, not auth) ----------

function hashStr(s: string): string {
  // FNV-1a 32-bit, hex. Kid-gate grade: obscures the PIN from casual
  // viewing; real auth (when supabase lands) must use server-side checks.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function makeSalt(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Salted hash in "salt$hex" form. Throws on non-4-digit PINs. */
export function hashPin(pin: string, salt: string): string {
  if (!isValidPin(pin)) throw new Error("PIN must be exactly 4 digits.");
  if (!salt || salt.includes("$")) throw new Error("Bad salt.");
  return `${salt}$${hashStr(`${salt}:${pin}`)}`;
}

/** Deterministic variant used by addProfile/tests (salt derived from id). */
export function hashPinForTest(pin: string, salt: string): string {
  return hashPin(pin, salt);
}

export function verifyPin(pinHash: string | undefined, pin: string): boolean {
  if (!pinHash) return false;
  const sep = pinHash.indexOf("$");
  if (sep < 0) return false;
  const salt = pinHash.slice(0, sep);
  try {
    return hashPin(pin, salt) === pinHash;
  } catch {
    return false;
  }
}

export function setProfilePin(doc: ProfilesDoc, id: string, pin: string, salt?: string): ProfilesDoc {
  const s = salt ?? `salt-${id}`;
  const pinHash = hashPin(pin, s);
  return { ...doc, profiles: doc.profiles.map((p) => (p.id === id ? { ...p, pinHash } : p)) };
}

export function clearProfilePin(doc: ProfilesDoc, id: string): ProfilesDoc {
  return {
    ...doc,
    profiles: doc.profiles.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p };
      delete next.pinHash;
      return next;
    }),
  };
}

// ---------- photo ----------

/** Approximate decoded byte size of a data: URL without decoding it. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const clean = b64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/**
 * Size/type guard for avatar photos. Returns a friendly error string, or
 * null when the photo is acceptable.
 */
export function validatePhotoDataUrl(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:image/")) return "That file isn't a photo — please pick an image!";
  const bytes = estimateDataUrlBytes(dataUrl);
  if (bytes > MAX_PHOTO_BYTES) {
    return `That photo is too big (${Math.round(bytes / 1024)}KB). Please pick a smaller one — under ${Math.round(MAX_PHOTO_BYTES / 1024)}KB!`;
  }
  return null;
}

/**
 * Browser-only: downscale an image file via canvas to <=256px on the long
 * edge and return a JPEG (~0.7) data URL. Rejects files that are still
 * >300KB after downscaling, with a friendly error.
 */
export function processPhotoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("Photo upload needs a browser!"));
      return;
    }
    if (!file.type.startsWith("image/")) {
      reject(new Error("That file isn't a photo — please pick an image!"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Photo helper needs canvas support!");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
        const err = validatePhotoDataUrl(dataUrl);
        if (err) {
          reject(new Error(err));
          return;
        }
        resolve(dataUrl);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Couldn't read that photo — try another one!"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo — try another one!"));
    };
    img.src = url;
  });
}

// ---------- namespacing helper (for the integrator) ----------

/**
 * Per-profile storage key for a namespaced store. `ns` is the store's
 * versioned suffix WITHOUT the legacy "mt." prefix, e.g. "progress.v1".
 * Without a profile id it returns the legacy key (pre-migration reads).
 */
export function profileKey(ns: string, profileId?: string | null): string {
  const clean = ns.replace(/^mt\./, "");
  if (!profileId) return `mt.${clean}`;
  return `mt.p.${profileId}.${clean}`;
}

// ---------- per-profile stats summary (reads namespaced, falls back legacy) ----------

export interface ProfileStats {
  xp: number;
  streakCount: number;
  sessionsCompleted: number;
  balance: number;
  skillsTouched: number;
}

function readJson(store: StorageLike | null, key: string): unknown {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Read a namespaced key, falling back to the legacy un-namespaced key ONLY
 * before migration has run. After migration the legacy keys are stale copies
 * (kept intentionally), so a fresh sibling must never inherit them.
 */
function readNsOrPreMigrationLegacy(s: StorageLike, suffix: string, profileId: string): unknown {
  const namespaced = readJson(s, profileKey(suffix, profileId));
  if (namespaced !== null && namespaced !== undefined) return namespaced;
  if (s.getItem(MIGRATION_FLAG_KEY)) return null;
  return readJson(s, profileKey(suffix));
}

/**
 * Best-effort stats for one profile. Reads namespaced keys first
 * (mt.p.<id>.progress.v1 etc.), falls back to legacy keys only when migration
 * has never run (pre-migration writers). Never throws.
 */
export function readProfileStats(
  store: StorageLike | null | undefined,
  profileId: string,
): ProfileStats {
  const s = resolveStore(store);
  const empty: ProfileStats = {
    xp: 0,
    streakCount: 0,
    sessionsCompleted: 0,
    balance: 0,
    skillsTouched: 0,
  };
  if (!s) return empty;
  const progress = readNsOrPreMigrationLegacy(s, "progress.v1", profileId);
  if (progress && typeof progress === "object") {
    const r = progress as Record<string, unknown>;
    if (typeof r.xp === "number") empty.xp = r.xp;
    if (typeof r.streakCount === "number") empty.streakCount = r.streakCount;
    if (typeof r.sessionsCompleted === "number") empty.sessionsCompleted = r.sessionsCompleted;
  }
  const points = readNsOrPreMigrationLegacy(s, "points.v1", profileId);
  const pointsState =
    points && typeof points === "object" && "state" in (points as Record<string, unknown>)
      ? (points as Record<string, unknown>).state
      : points;
  if (pointsState && typeof pointsState === "object") {
    const r = pointsState as Record<string, unknown>;
    if (typeof r.balance === "number") empty.balance = r.balance;
  }
  const plan = readNsOrPreMigrationLegacy(s, "planSession.v2", profileId);
  if (plan && typeof plan === "object") {
    const r = plan as Record<string, unknown>;
    if (r.levels && typeof r.levels === "object") {
      empty.skillsTouched = Object.keys(r.levels as Record<string, unknown>).length;
    }
  }
  return empty;
}

// ---------- storage usage note ----------

export function storageUsageNote(store?: StorageLike | null): string {
  const s = resolveStore(store);
  if (!s || typeof window === "undefined") {
    return "Photos and progress save on this device only — export a backup so an iPad wipe can't erase them!";
  }
  try {
    let bytes = 0;
    // localStorage has no enumeration on StorageLike; use the real one.
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith("mt.")) continue;
      bytes += (k.length + (ls.getItem(k)?.length ?? 0)) * 2;
    }
    const kb = Math.max(1, Math.round(bytes / 1024));
    return `Using about ${kb}KB on this device (browsers allow ~5MB). Photos and progress save on this device only — export a backup so an iPad wipe can't erase them!`;
  } catch {
    return "Photos and progress save on this device only — export a backup so an iPad wipe can't erase them!";
  }
}

// ---------- migration: adopt legacy stores into 'Kid 1' exactly once ----------

export interface MigrationResult {
  migrated: boolean;
  profile: Profile | null;
}

/**
 * One-time adoption: if legacy un-namespaced keys hold data and no profile
 * exists yet, create "Kid 1", copy each legacy payload to its namespaced
 * key, and set the migration flag. Runs ONCE (flag-guarded) so current
 * progress is never lost and never double-copied. Legacy keys are kept.
 */
export function migrateLegacyOnce(
  store?: StorageLike | null,
  now = Date.now(),
): MigrationResult {
  const s = resolveStore(store);
  const none: MigrationResult = { migrated: false, profile: null };
  if (!s) return none;
  try {
    if (s.getItem(MIGRATION_FLAG_KEY)) return none;
    const doc = loadProfiles(s);
    const finish = (result: MigrationResult): MigrationResult => {
      try {
        s.setItem(MIGRATION_FLAG_KEY, "1");
      } catch {
        /* noop */
      }
      return result;
    };
    if (doc.profiles.length > 0) return finish(none);
    let hasLegacy = false;
    const payloads: Array<[string, string]> = [];
    for (const k of LEGACY_KEYS) {
      const v = s.getItem(k);
      if (v !== null) {
        hasLegacy = true;
        payloads.push([k, v]);
      }
    }
    if (!hasLegacy) return finish(none);
    const { doc: next, profile } = addProfile(doc, { name: "Kid 1" }, now);
    saveProfiles(next, s);
    const ns = (legacyKey: string): string => {
      const suffix = legacyKey.replace(/^mt\./, "");
      return profileKey(suffix, profile.id);
    };
    for (const [k, v] of payloads) {
      try {
        s.setItem(ns(k), v);
      } catch {
        /* keep going: one full key must not block the rest */
      }
    }
    return finish({ migrated: true, profile });
  } catch {
    return none;
  }
}

// ---------- backup: export JSON download + import restore ----------

export interface BackupDoc {
  kind: "mathtutor-backup";
  version: 1;
  exportedAt: number;
  profiles: ProfilesDoc;
  /** Namespaced payloads per profile id: key suffix -> raw JSON string. */
  data: Record<string, Record<string, string>>;
  /** Legacy keys snapshot (for pre-migration restores). */
  legacy: Record<string, string>;
}

const BACKUP_SUFFIXES = [
  "assignment.v1",
  "lastResult.v1",
  "progress.v1",
  "newBadges.v1",
  "points.v1",
  "planSession.v2",
] as const;

export function exportBackup(store?: StorageLike | null, now = Date.now()): BackupDoc {
  const s = resolveStore(store);
  const doc = loadProfiles(s);
  const data: Record<string, Record<string, string>> = {};
  const legacy: Record<string, string> = {};
  if (s) {
    for (const p of doc.profiles) {
      const per: Record<string, string> = {};
      for (const suffix of BACKUP_SUFFIXES) {
        const v = s.getItem(profileKey(suffix, p.id));
        if (v !== null) per[suffix] = v;
      }
      if (Object.keys(per).length > 0) data[p.id] = per;
    }
    for (const k of LEGACY_KEYS) {
      const v = s.getItem(k);
      if (v !== null) legacy[k] = v;
    }
  }
  return { kind: "mathtutor-backup", version: 1, exportedAt: now, profiles: doc, data, legacy };
}

export function backupToJson(backup: BackupDoc): string {
  return JSON.stringify(backup);
}

export function parseBackup(json: string): BackupDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("That backup file doesn't look right — is it a MathTutor backup?");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("That backup file doesn't look right — is it a MathTutor backup?");
  }
  const r = parsed as Record<string, unknown>;
  if (r.kind !== "mathtutor-backup" || !r.profiles || typeof r.profiles !== "object") {
    throw new Error("That backup file doesn't look right — is it a MathTutor backup?");
  }
  const pr = r.profiles as Record<string, unknown>;
  if (!Array.isArray(pr.profiles)) {
    throw new Error("That backup file doesn't look right — is it a MathTutor backup?");
  }
  return parsed as BackupDoc;
}

/** Restore a backup: replaces profiles + namespaced payloads + legacy keys. */
export function importBackup(store: StorageLike | null | undefined, backup: BackupDoc): ProfilesDoc {
  const s = resolveStore(store);
  const profiles = (backup.profiles.profiles ?? []).map(sanitizeProfile).filter(
    (p): p is Profile => p !== null,
  );
  let maxN = 0;
  for (const p of profiles) {
    const m = /^kid-(\d+)$/.exec(p.id);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  }
  const doc: ProfilesDoc = {
    version: PROFILE_VERSION,
    profiles,
    activeProfileId:
      typeof backup.profiles.activeProfileId === "string" &&
      profiles.some((p) => p.id === backup.profiles.activeProfileId)
        ? backup.profiles.activeProfileId
        : (profiles[0]?.id ?? null),
    nextId:
      typeof backup.profiles.nextId === "number" && backup.profiles.nextId > maxN
        ? Math.floor(backup.profiles.nextId)
        : maxN + 1,
  };
  if (s) {
    saveProfiles(doc, s);
    for (const [profileId, per] of Object.entries(backup.data ?? {})) {
      for (const [suffix, value] of Object.entries(per ?? {})) {
        try {
          s.setItem(profileKey(suffix, profileId), value);
        } catch {
          /* keep going */
        }
      }
    }
    for (const [k, v] of Object.entries(backup.legacy ?? {})) {
      try {
        s.setItem(k, v);
      } catch {
        /* keep going */
      }
    }
    // Imported state counts as migrated — never re-adopt over it.
    try {
      s.setItem(MIGRATION_FLAG_KEY, "1");
    } catch {
      /* noop */
    }
  }
  return doc;
}

export function downloadBackup(filename: string, json: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
