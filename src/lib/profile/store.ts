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

/**
 * Legacy un-namespaced keys the v1 backup format owns. Adopted into the
 * default profile exactly once by migrateLegacyOnce().
 */
export const LEGACY_KEYS_V1 = [
  "mt.assignment.v1",
  "mt.lastResult.v1",
  "mt.progress.v1",
  "mt.newBadges.v1",
  "mt.points.v1",
  "mt.planSession.v2",
] as const;

/**
 * Every legacy un-namespaced key the backup format owns. The v1 list plus the
 * un-namespaced keys session.ts's writeStored() still emits for quest /
 * grade-override / celebrated-graduation / practice-progress state when no
 * profile is active. Redemptions has no legacy entry on purpose — rewardStore
 * only ever writes it namespaced (profileKey(REDEMPTIONS_NS, pid)), never
 * un-namespaced.
 */
export const LEGACY_KEYS = [
  ...LEGACY_KEYS_V1,
  "mt.quest.v1",
  "mt.gradeOverrides.v1",
  "mt.celebratedGraduations.v1",
  "mt.practiceProgress.v1",
] as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /**
   * Optional enumeration, exactly as window.localStorage exposes it. Backup
   * restore and purgeProfile use it to find `mt.p.<id>.*` payloads whose
   * profile entry is gone (lost or corrupt profiles doc) — the only way to
   * see such an id. A store without these members still works; discovery then
   * falls back to ids derived from the profiles doc and the backup file.
   */
  key?(index: number): string | null;
  readonly length?: number;
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

/** getItem that never throws: a locked-down browser raises SecurityError. */
function safeGet(s: StorageLike, key: string): string | null {
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Every stored key, or null when this store cannot enumerate (plain object
 * mocks; window.localStorage always can). Snapshotted into an array so
 * removal during a sweep cannot shift the list under us.
 */
function listKeys(s: StorageLike): string[] | null {
  if (typeof s.key !== "function" || typeof s.length !== "number") return null;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null) keys.push(k);
    }
    return keys;
  } catch {
    return null;
  }
}

/** `mt.p.` + profile id + `.` + suffix — the per-profile key namespace. */
const PROFILE_KEY_PREFIX = "mt.p.";

/**
 * Profile ids that own one of `suffixes`, read off the storage's own key list
 * rather than the profiles doc — the only way to see a kid whose doc entry was
 * lost while their payloads survived. null when the store cannot enumerate.
 */
function storedIdsForSuffixes(s: StorageLike, suffixes: readonly string[]): string[] | null {
  const keys = listKeys(s);
  if (keys === null) return null;
  const ids: string[] = [];
  for (const key of keys) {
    if (!key.startsWith(PROFILE_KEY_PREFIX)) continue;
    const rest = key.slice(PROFILE_KEY_PREFIX.length);
    for (const suffix of suffixes) {
      const tail = `.${suffix}`;
      if (rest.length > tail.length && rest.endsWith(tail)) {
        ids.push(rest.slice(0, rest.length - tail.length));
      }
    }
  }
  return ids;
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
    for (const k of listKeys(s) ?? []) {
      if (!k.startsWith("mt.")) continue;
      bytes += (k.length + (safeGet(s, k)?.length ?? 0)) * 2;
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
      const v = safeGet(s, k);
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

/** Current backup format version. v1 files still import (see parseBackup). */
export const BACKUP_VERSION = 2 as const;

export interface BackupDoc {
  kind: "mathtutor-backup";
  /** 1 = pre-globals, fewer suffixes; 2 = every managed key + parent globals. */
  version: 1 | 2;
  exportedAt: number;
  profiles: ProfilesDoc;
  /** Namespaced payloads per profile id: key suffix -> raw JSON string. */
  data: Record<string, Record<string, string>>;
  /** Legacy un-namespaced keys snapshot (for pre-migration restores). */
  legacy: Record<string, string>;
  /**
   * Parent-global stores (not per-kid): full localStorage key -> raw JSON
   * string. Absent on v1 files; always written (possibly empty) on v2.
   */
  globals: Record<string, string>;
}

/** Per-kid namespaced suffixes the v1 backup format round-trips. */
export const BACKUP_SUFFIXES_V1 = [
  "assignment.v1",
  "lastResult.v1",
  "progress.v1",
  "newBadges.v1",
  "points.v1",
  "planSession.v2",
] as const;

/**
 * Every per-kid namespaced suffix the current format round-trips. Each string
 * is the EXACT suffix its writer passes through profileKey():
 *   quest.v1 / gradeOverrides.v1 / celebratedGraduations.v1 / practiceProgress.v1
 *                                                            — src/lib/session.ts
 *   redemptions.v1 (REDEMPTIONS_NS)                          — src/components/admin/rewardStore.ts
 */
export const BACKUP_SUFFIXES = [
  ...BACKUP_SUFFIXES_V1,
  "quest.v1",
  "gradeOverrides.v1",
  "celebratedGraduations.v1",
  "practiceProgress.v1",
  "redemptions.v1",
] as const;

/**
 * Parent-authored global stores (one per device, not per kid). Losing
 * mathtutor.rewards.v1 means re-entering every prize; mathtutor.admin.v1 is
 * the grown-up dashboard state. Only these keys are ever cleared or written
 * by the backup's globals handling.
 */
export const BACKUP_GLOBAL_KEYS = [
  "mathtutor.rewards.v1",
  "mathtutor.admin.v1",
] as const;

export function exportBackup(store?: StorageLike | null, now = Date.now()): BackupDoc {
  const s = resolveStore(store);
  const doc = loadProfiles(s);
  const data: Record<string, Record<string, string>> = {};
  const legacy: Record<string, string> = {};
  const globals: Record<string, string> = {};
  if (s) {
    for (const p of doc.profiles) {
      const per: Record<string, string> = {};
      for (const suffix of BACKUP_SUFFIXES) {
        const v = safeGet(s, profileKey(suffix, p.id));
        if (v !== null) per[suffix] = v;
      }
      if (Object.keys(per).length > 0) data[p.id] = per;
    }
    for (const k of LEGACY_KEYS) {
      const v = safeGet(s, k);
      if (v !== null) legacy[k] = v;
    }
    for (const k of BACKUP_GLOBAL_KEYS) {
      const v = safeGet(s, k);
      if (v !== null) globals[k] = v;
    }
  }
  return {
    kind: "mathtutor-backup",
    version: BACKUP_VERSION,
    exportedAt: now,
    profiles: doc,
    data,
    legacy,
    globals,
  };
}

export function backupToJson(backup: BackupDoc): string {
  return JSON.stringify(backup);
}

/**
 * `key -> raw JSON string`, dropping anything else. `Object.entries` on a
 * string iterates characters, so an unvalidated file could otherwise inject
 * one junk key per character (mt.p.kid-1.0 … mt.p.kid-1.12).
 */
function stringRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  // `as Record<string, unknown>` after a real object check: Object.entries on
  // an `object` only types cleanly through the generic index-signature overload.
  if (typeof v !== "object" || v === null || Array.isArray(v)) return out;
  for (const [k, value] of Object.entries(v as Record<string, unknown>)) {
    if (typeof value === "string") out[k] = value;
  }
  return out;
}

/** `profile id -> { suffix -> raw JSON string }`, dropping malformed entries. */
function payloadRecord(v: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (typeof v !== "object" || v === null || Array.isArray(v)) return out;
  for (const [id, per] of Object.entries(v as Record<string, unknown>)) {
    if (typeof per !== "object" || per === null || Array.isArray(per)) continue;
    const inner = stringRecord(per);
    if (Object.keys(inner).length > 0) out[id] = inner;
  }
  return out;
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
  // v1 files import fine (no globals, fewer suffixes). Anything else is from a
  // newer app than this one — importing it would silently drop whatever it
  // added, so stop with a clear (still kid-safe) message instead.
  if (r.version !== 1 && r.version !== 2) {
    throw new Error(
      "This backup was made by a newer version of MathTutor. Please update the app, then try again!",
    );
  }
  // Payload maps are normalised here, not rejected: a hand-edited file with a
  // malformed entry still restores everything that IS well formed, and the
  // malformed entry can never reach storage.
  return {
    kind: "mathtutor-backup",
    version: r.version,
    exportedAt: typeof r.exportedAt === "number" ? r.exportedAt : Date.now(),
    profiles: r.profiles as ProfilesDoc,
    data: payloadRecord(r.data),
    legacy: stringRecord(r.legacy),
    globals: stringRecord(r.globals),
  };
}

/**
 * Restore a backup as a true REPLACE, not a merge. The WRITE phase runs first
 * and the clear phase runs only when every write succeeded: a quota-blocked
 * iPad must never lose the keys it already had in exchange for payloads that
 * could not be written. Once the writes land, every key this backup's format
 * version owns — per-kid namespaced suffixes, legacy un-namespaced keys, and
 * (v2) the parent globals — is cleared, so play that happened after the export
 * is wiped instead of surviving as hybrid state. Keys the format does NOT own
 * (sound-muted, install-dismissed, mt.redemptions.legacyAdopted.v1,
 * mt.progress.openDomains, mathtutor.admin.unlocked, …) are never touched.
 *
 * `mt.profiles.migrated.v1` is the one deliberate exception: it is always set
 * to "1". Every app writer stores exactly "1" (migrateLegacyOnce and this
 * import), so no state is lost, and skipping it would let migrateLegacyOnce
 * re-adopt legacy keys over freshly imported state.
 *
 * `failed` lists every key whose write or clear raised (quota, private mode, a
 * locked-down browser). Empty = the replace completed; non-empty = storage
 * still holds part of the old state, so the UI must not claim success.
 */
export function importBackupReport(
  store: StorageLike | null | undefined,
  backup: BackupDoc,
): { doc: ProfilesDoc; failed: string[] } {
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
  if (!s) return { doc, failed: [] };

  // A v1 file never captured the newer suffixes or the parent globals, so the
  // v1 format does not own them — touching only what each format owns keeps
  // restore deterministic without destroying data the file couldn't represent.
  const isV1 = backup.version === 1;
  const ownedSuffixes: readonly string[] = isV1 ? BACKUP_SUFFIXES_V1 : BACKUP_SUFFIXES;
  const ownedLegacyKeys: readonly string[] = isV1 ? LEGACY_KEYS_V1 : LEGACY_KEYS;

  const failed: string[] = [];
  /** Keys whose value this restore owned; the clear phase must not delete them. */
  const replaced = new Set<string>();
  const write = (key: string, value: string): void => {
    try {
      s.setItem(key, value);
      replaced.add(key);
    } catch {
      failed.push(key);
    }
  };
  const remove = (key: string): void => {
    try {
      s.removeItem(key);
    } catch {
      failed.push(key);
    }
  };

  // ---- write phase, strictly before any clear (so failure is non-destructive)
  // Ids already on the device keep their payloads: a v1 file cannot represent
  // the newer suffixes, and must not wipe them.
  const deviceIds = loadProfiles(s).profiles.map((p) => p.id);
  const deviceIdSet = new Set<string>(deviceIds);
  const restoredIds = profiles.map((p) => p.id);
  const restoredIdSet = new Set<string>(restoredIds);

  write(PROFILE_KEY, JSON.stringify(doc));
  const ownedSuffixSet = new Set<string>(ownedSuffixes);
  for (const [profileId, per] of Object.entries(backup.data ?? {})) {
    // An id in neither the restored doc nor this device is orphan data from a
    // hand-edited file — never resurrect it.
    if (!restoredIdSet.has(profileId) && !deviceIdSet.has(profileId)) continue;
    for (const [suffix, value] of Object.entries(per ?? {})) {
      if (!ownedSuffixSet.has(suffix) || typeof value !== "string") continue;
      write(profileKey(suffix, profileId), value);
    }
  }
  const ownedLegacySet = new Set<string>(ownedLegacyKeys);
  for (const [k, v] of Object.entries(backup.legacy ?? {})) {
    // Only ever write the keys the format owns — a hand-edited file must not
    // be able to inject arbitrary localStorage keys.
    if (ownedLegacySet.has(k)) write(k, v);
  }
  if (!isV1) {
    const managedGlobals = new Set<string>(BACKUP_GLOBAL_KEYS);
    for (const [k, v] of Object.entries(backup.globals ?? {})) {
      if (managedGlobals.has(k)) write(k, v);
    }
  }
  // Imported state counts as migrated — never re-adopt over it.
  write(MIGRATION_FLAG_KEY, "1");

  // ---- clear phase (only when the replace landed in full) ------------------
  if (failed.length === 0) {
    // Every id the format could hold a payload for: the ids present now, the
    // ids coming in, any id carrying data in the file, and — the case a lost
    // profiles doc creates — every id discovered from the storage's own key
    // list. window.localStorage can enumerate; a plain object mock cannot, and
    // then only the doc/backup-derived ids are swept (fallback).
    const idsToSweep = new Set<string>(deviceIds);
    for (const id of restoredIds) idsToSweep.add(id);
    for (const id of Object.keys(backup.data ?? {})) idsToSweep.add(id);
    for (const id of storedIdsForSuffixes(s, ownedSuffixes) ?? []) idsToSweep.add(id);

    for (const id of Array.from(idsToSweep)) {
      for (const suffix of ownedSuffixes) {
        const key = profileKey(suffix, id);
        if (!replaced.has(key)) remove(key);
      }
    }
    for (const k of ownedLegacyKeys) {
      if (!replaced.has(k)) remove(k);
    }
    if (!isV1) {
      for (const k of BACKUP_GLOBAL_KEYS) {
        if (!replaced.has(k)) remove(k);
      }
    }
  }

  return { doc, failed };
}

/** Restore a backup. See importBackupReport for which keys failed. */
export function importBackup(store: StorageLike | null | undefined, backup: BackupDoc): ProfilesDoc {
  return importBackupReport(store, backup).doc;
}

/**
 * Delete a player for real: drop the doc entry AND every `mt.p.<id>.*`
 * payload, so the delete UI's promise ("removing a player erases their
 * progress on this device") is true. Enumeration covers every suffix under
 * that id, including ones this build does not know about; a non-enumerating
 * store falls back to the managed BACKUP_SUFFIXES set.
 *
 * Non-destructive: if any payload removal fails, the doc entry is left in
 * place — storage must never keep progress whose profile is gone, or the next
 * kid created with that id would inherit it. Never throws.
 */
export function purgeProfile(id: string, store?: StorageLike | null): ProfilesDoc {
  const s = resolveStore(store);
  const doc = loadProfiles(s);
  const next = removeProfile(doc, id);
  if (!s) return next;
  const prefix = `${PROFILE_KEY_PREFIX}${id}.`;
  const enumerated = listKeys(s);
  const keys =
    enumerated === null
      ? BACKUP_SUFFIXES.map((suffix) => profileKey(suffix, id))
      : enumerated.filter((k) => k.startsWith(prefix));
  let cleared = true;
  for (const k of keys) {
    try {
      s.removeItem(k);
    } catch {
      cleared = false;
    }
  }
  if (!cleared) return doc;
  try {
    s.setItem(PROFILE_KEY, JSON.stringify(next));
  } catch {
    // Payloads are already gone; report the doc the device actually holds.
    return doc;
  }
  return next;
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
