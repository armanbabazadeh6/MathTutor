import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PHOTO_BYTES,
  addProfile,
  backupToJson,
  clearProfilePin,
  emptyProfilesDoc,
  estimateDataUrlBytes,
  exportBackup,
  getActiveProfile,
  hashPin,
  importBackup,
  isValidPin,
  loadProfiles,
  migrateLegacyOnce,
  parseBackup,
  profileKey,
  readProfileStats,
  removeProfile,
  renameProfile,
  saveProfiles,
  setActiveProfile,
  setProfilePhoto,
  setProfilePin,
  validatePhotoDataUrl,
  verifyPin,
} from "../src/lib/profile/store";
import type { StorageLike } from "../src/lib/profile/store";

function mockStore(seed: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const SMALL_PHOTO = "data:image/jpeg;base64," + "A".repeat(1000);
const BIG_PHOTO = "data:image/jpeg;base64," + "A".repeat(500_000);

/* ---------- CRUD ---------- */

test("addProfile assigns deterministic kid-N ids and activates the first", () => {
  let doc = emptyProfilesDoc();
  const r1 = addProfile(doc, { name: "Maya" }, 1000);
  assert.equal(r1.profile.id, "kid-1");
  assert.equal(r1.doc.activeProfileId, "kid-1");
  const r2 = addProfile(r1.doc, { name: "Leo" }, 2000);
  assert.equal(r2.profile.id, "kid-2");
  assert.equal(r2.doc.profiles.length, 2);
  doc = r2.doc;
  assert.equal(getActiveProfile(doc)?.name, "Maya");
});

test("addProfile rejects a blank name", () => {
  assert.throws(() => addProfile(emptyProfilesDoc(), { name: "   " }), /name/i);
});

test("renameProfile updates the name and rejects blanks", () => {
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" });
  const next = renameProfile(doc, "kid-1", "  Maya R.  ");
  assert.equal(next.profiles[0].name, "Maya R.");
  assert.throws(() => renameProfile(doc, "kid-1", "  "), /name/i);
});

test("setActiveProfile switches kids and stamps lastActiveAt", () => {
  const r1 = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  const r2 = addProfile(r1.doc, { name: "Leo" }, 1000);
  const next = setActiveProfile(r2.doc, "kid-2", 9999);
  assert.equal(next.activeProfileId, "kid-2");
  assert.equal(next.profiles[1].lastActiveAt, 9999);
  // Unknown id is ignored.
  assert.equal(setActiveProfile(next, "kid-9").activeProfileId, "kid-2");
});

test("removeProfile drops the kid and falls back to a surviving active", () => {
  const r1 = addProfile(emptyProfilesDoc(), { name: "Maya" });
  const r2 = addProfile(r1.doc, { name: "Leo" });
  const active2 = setActiveProfile(r2.doc, "kid-2");
  const next = removeProfile(active2, "kid-2");
  assert.equal(next.profiles.length, 1);
  assert.equal(next.activeProfileId, "kid-1");
  const empty = removeProfile(next, "kid-1");
  assert.equal(empty.activeProfileId, null);
});

test("profiles persist across close/reopen via save/load", () => {
  const s = mockStore();
  const r = addProfile(emptyProfilesDoc(), { name: "Maya", avatarDataUrl: SMALL_PHOTO }, 1234);
  saveProfiles(r.doc, s);
  const back = loadProfiles(s);
  assert.equal(back.profiles.length, 1);
  assert.equal(back.profiles[0].avatarDataUrl, SMALL_PHOTO);
  assert.equal(back.activeProfileId, "kid-1");
  // nextId survives so ids never collide after reopen.
  const r2 = addProfile(back, { name: "Leo" });
  assert.equal(r2.profile.id, "kid-2");
});

/* ---------- PIN ---------- */

test("PIN hashes verify, wrong PINs fail", () => {
  const h = hashPin("1234", "somesalt");
  assert.ok(h.startsWith("somesalt$"));
  assert.equal(verifyPin(h, "1234"), true);
  assert.equal(verifyPin(h, "4321"), false);
  assert.equal(verifyPin(undefined, "1234"), false);
});

test("PIN validation rejects non-4-digit codes", () => {
  assert.equal(isValidPin("1234"), true);
  assert.equal(isValidPin("123"), false);
  assert.equal(isValidPin("12345"), false);
  assert.equal(isValidPin("12a4"), false);
  assert.throws(() => hashPin("12", "s"), /4 digits/);
});

test("same PIN with different salts hashes differently", () => {
  assert.notEqual(hashPin("1234", "salt-a"), hashPin("1234", "salt-b"));
});

test("setProfilePin and clearProfilePin round-trip", () => {
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" });
  const locked = setProfilePin(doc, "kid-1", "9876", "fixed-salt");
  assert.equal(verifyPin(locked.profiles[0].pinHash, "9876"), true);
  const open = clearProfilePin(locked, "kid-1");
  assert.equal(open.profiles[0].pinHash, undefined);
  assert.equal(verifyPin(open.profiles[0].pinHash, "9876"), false);
});

/* ---------- photo ---------- */

test("estimateDataUrlBytes decodes base64 length correctly", () => {
  // "TQ==" is "M" (1 byte); "TWE=" is "Ma" (2 bytes).
  assert.equal(estimateDataUrlBytes("data:image/jpeg;base64,TQ=="), 1);
  assert.equal(estimateDataUrlBytes("data:image/jpeg;base64,TWE="), 2);
});

test("photo guard accepts small images with a null verdict", () => {
  assert.equal(validatePhotoDataUrl(SMALL_PHOTO), null);
});

test("photo guard rejects non-images with a friendly error", () => {
  const err = validatePhotoDataUrl("data:text/plain;base64,SGVsbG8=");
  assert.ok(err && /photo|image/i.test(err));
});

test("photo guard rejects >300KB with a friendly size error", () => {
  const bytes = estimateDataUrlBytes(BIG_PHOTO);
  assert.ok(bytes > MAX_PHOTO_BYTES);
  const err = validatePhotoDataUrl(BIG_PHOTO);
  assert.ok(err && /too big|smaller/i.test(err));
});

test("setProfilePhoto enforces the size guard", () => {
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" });
  assert.throws(() => setProfilePhoto(doc, "kid-1", BIG_PHOTO), /too big|smaller/i);
  const ok = setProfilePhoto(doc, "kid-1", SMALL_PHOTO);
  assert.equal(ok.profiles[0].avatarDataUrl, SMALL_PHOTO);
});

/* ---------- migration ---------- */

test("migration adopts legacy progress into Kid 1 exactly once", () => {
  const legacy = JSON.stringify({ xp: 42, streakCount: 3, sessionsCompleted: 5 });
  const s = mockStore({ "mt.progress.v1": legacy });
  const first = migrateLegacyOnce(s, 5000);
  assert.equal(first.migrated, true);
  assert.equal(first.profile?.name, "Kid 1");
  // Payload copied to the namespaced key; legacy left intact.
  assert.equal(s.getItem(profileKey("progress.v1", first.profile!.id)), legacy);
  assert.equal(s.getItem("mt.progress.v1"), legacy);
  const stats = readProfileStats(s, first.profile!.id);
  assert.equal(stats.xp, 42);
  // Second run is a no-op: no duplicate kid.
  const second = migrateLegacyOnce(s);
  assert.equal(second.migrated, false);
  assert.equal(loadProfiles(s).profiles.length, 1);
});

test("migration with no legacy data creates nothing but still marks done", () => {
  const s = mockStore();
  assert.equal(migrateLegacyOnce(s).migrated, false);
  assert.equal(loadProfiles(s).profiles.length, 0);
  // Flag set: a later legacy write must NOT be re-adopted over profiles.
  s.setItem("mt.progress.v1", JSON.stringify({ xp: 1 }));
  assert.equal(migrateLegacyOnce(s).migrated, false);
  assert.equal(loadProfiles(s).profiles.length, 0);
});

/* ---------- backup ---------- */

test("export/import round-trips profiles plus namespaced payloads", () => {
  const s = mockStore();
  const r1 = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  const r2 = addProfile(r1.doc, { name: "Leo" }, 2000);
  saveProfiles(r2.doc, s);
  s.setItem(profileKey("progress.v1", "kid-1"), JSON.stringify({ xp: 77 }));
  s.setItem("mt.progress.v1", JSON.stringify({ xp: 1 }));

  const json = backupToJson(exportBackup(s, 9000));
  const fresh = mockStore();
  const restored = importBackup(fresh, parseBackup(json));
  assert.equal(restored.profiles.length, 2);
  assert.equal(restored.profiles[0].name, "Maya");
  assert.equal(fresh.getItem(profileKey("progress.v1", "kid-1")), JSON.stringify({ xp: 77 }));
  assert.equal(fresh.getItem("mt.progress.v1"), JSON.stringify({ xp: 1 }));
  // Imported state counts as migrated.
  assert.equal(migrateLegacyOnce(fresh).migrated, false);
});

test("parseBackup rejects garbage and wrong-shaped files", () => {
  assert.throws(() => parseBackup("not json{{{"), /backup/i);
  assert.throws(() => parseBackup(JSON.stringify({ kind: "nope" })), /backup/i);
});

test("profileKey prefixes per profile and falls back to legacy", () => {
  assert.equal(profileKey("progress.v1", "kid-2"), "mt.p.kid-2.progress.v1");
  assert.equal(profileKey("progress.v1"), "mt.progress.v1");
  assert.equal(profileKey("mt.points.v1", "kid-1"), "mt.p.kid-1.points.v1");
});

test("readProfileStats never leaks legacy keys to a fresh sibling after migration", () => {
  const s = mockStore({ "mt.progress.v1": JSON.stringify({ xp: 42, streakCount: 5, sessionsCompleted: 9 }) });
  // Pre-migration: legacy still live, visible once.
  assert.equal(readProfileStats(s, "kid-1").xp, 42);
  const m = migrateLegacyOnce(s, 1000);
  assert.equal(m.migrated, true);
  // Kid 1 keeps adopted stats; a fresh sibling starts at zero.
  assert.equal(readProfileStats(s, "kid-1").xp, 42);
  assert.equal(readProfileStats(s, "kid-2").xp, 0);
  assert.equal(readProfileStats(s, "kid-2").streakCount, 0);
  assert.equal(readProfileStats(s, "kid-2").balance, 0);
});
