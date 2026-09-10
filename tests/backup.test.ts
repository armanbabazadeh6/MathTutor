import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_GLOBAL_KEYS,
  BACKUP_SUFFIXES,
  LEGACY_KEYS,
  PROFILE_KEY,
  addProfile,
  backupToJson,
  emptyProfilesDoc,
  exportBackup,
  importBackup,
  importBackupReport,
  loadProfiles,
  migrateLegacyOnce,
  parseBackup,
  profileKey,
  purgeProfile,
  readProfileStats,
  saveProfiles,
} from "../src/lib/profile/store";
import type { BackupDoc, StorageLike } from "../src/lib/profile/store";

/** Enumerating mock: window.localStorage exposes key(i)/length, so mocks must. */
function mockStore(seed: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() {
      return m.size;
    },
  };
}

function keysOf(s: StorageLike): string[] {
  const out: string[] = [];
  for (let i = 0; i < (s.length ?? 0); i++) {
    const k = s.key?.(i);
    if (k) out.push(k);
  }
  return out.sort();
}

const MAYA = {
  id: "kid-1",
  name: "Maya",
  animal: "🦊",
  color: "#FF6B6B",
  createdAt: 1,
  lastActiveAt: 1,
};

/** A representative distinct payload for each managed per-kid suffix. */
function payloadFor(suffix: string): string {
  return JSON.stringify({ suffix, marker: `value-for-${suffix}` });
}

function seedFullKid(s: StorageLike, id: string): void {
  for (const suffix of BACKUP_SUFFIXES) {
    s.setItem(profileKey(suffix, id), payloadFor(suffix));
  }
}

/* ---------- (a) full round-trip: every managed key is byte-identical ---------- */

test("round-trip preserves every managed per-kid suffix and both parent globals byte-for-byte", () => {
  const src = mockStore();
  const r1 = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  const r2 = addProfile(r1.doc, { name: "Leo" }, 2000);
  saveProfiles(r2.doc, src);

  seedFullKid(src, "kid-1");
  seedFullKid(src, "kid-2");

  const rewards = JSON.stringify({ version: 1, catalog: [{ id: "r1", name: "Ice cream" }], redemptions: [] });
  const admin = JSON.stringify({ version: 1, pinHash: "salt$abcd1234", weeklyGoal: 5 });
  src.setItem("mathtutor.rewards.v1", rewards);
  src.setItem("mathtutor.admin.v1", admin);

  // A legacy un-namespaced key should also survive.
  src.setItem("mt.assignment.v1", JSON.stringify({ legacy: true }));

  const json = backupToJson(exportBackup(src, 9000));
  const parsed = parseBackup(json);
  assert.equal(parsed.version, 2);

  const dst = mockStore();
  const restored = importBackup(dst, parsed);
  assert.equal(restored.profiles.length, 2);

  for (const id of ["kid-1", "kid-2"]) {
    for (const suffix of BACKUP_SUFFIXES) {
      assert.equal(
        dst.getItem(profileKey(suffix, id)),
        payloadFor(suffix),
        `${suffix} for ${id} must round-trip identically`,
      );
    }
  }
  assert.equal(dst.getItem("mathtutor.rewards.v1"), rewards);
  assert.equal(dst.getItem("mathtutor.admin.v1"), admin);
  assert.equal(dst.getItem("mt.assignment.v1"), JSON.stringify({ legacy: true }));
  // Every global we claim to manage was actually exported.
  assert.deepEqual([...BACKUP_GLOBAL_KEYS].sort(), ["mathtutor.admin.v1", "mathtutor.rewards.v1"]);
});

/* ---------- (b) hybrid-state bug: play after the export is wiped on restore ---------- */

test("restore is a true replace: state created after the export is removed, not merged", () => {
  const s = mockStore();
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  saveProfiles(doc, s);
  s.setItem(profileKey("progress.v1", "kid-1"), JSON.stringify({ xp: 10 }));

  const json = backupToJson(exportBackup(s, 9000));

  // ...kid keeps playing in the same browser after the backup was taken.
  s.setItem(profileKey("progress.v1", "kid-1"), JSON.stringify({ xp: 999 }));
  s.setItem(profileKey("quest.v1", "kid-1"), JSON.stringify({ quest: "later-quest" }));
  s.setItem(profileKey("redemptions.v1", "kid-1"), JSON.stringify([{ id: "x" }]));

  importBackup(s, parseBackup(json));

  assert.equal(s.getItem(profileKey("progress.v1", "kid-1")), JSON.stringify({ xp: 10 }));
  assert.equal(s.getItem(profileKey("quest.v1", "kid-1")), null);
  assert.equal(s.getItem(profileKey("redemptions.v1", "kid-1")), null);
});

test("restore also clears newer per-kid state on a profile that is not in the backup", () => {
  const s = mockStore();
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  saveProfiles(doc, s);
  const json = backupToJson(exportBackup(s, 9000));

  // A second kid gets added + plays after the export.
  const r2 = addProfile(doc, { name: "Leo" }, 2000);
  saveProfiles(r2.doc, s);
  s.setItem(profileKey("progress.v1", "kid-2"), JSON.stringify({ xp: 50 }));

  importBackup(s, parseBackup(json));

  assert.equal(s.getItem(profileKey("progress.v1", "kid-2")), null);
  assert.equal(importBackup(s, parseBackup(json)).profiles.length, 1);
});

/* ---------- (c) a version-1 backup still imports ---------- */

test("a v1 backup (no globals, six suffixes) still imports", () => {
  const v1: BackupDoc = {
    kind: "mathtutor-backup",
    version: 1,
    exportedAt: 100,
    profiles: {
      version: 1,
      profiles: [
        {
          id: "kid-1",
          name: "Maya",
          animal: "🦊",
          color: "#FF6B6B",
          createdAt: 1,
          lastActiveAt: 1,
        },
      ],
      activeProfileId: "kid-1",
      nextId: 2,
    },
    data: { "kid-1": { "progress.v1": JSON.stringify({ xp: 5 }) } },
    legacy: {},
    // no `globals` key at all, mirroring a real pre-v2 file
  } as unknown as BackupDoc;

  const json = JSON.stringify({
    kind: v1.kind,
    version: v1.version,
    exportedAt: v1.exportedAt,
    profiles: v1.profiles,
    data: v1.data,
    legacy: v1.legacy,
  });

  const s = mockStore();
  // Parent prize catalog already on the device — a v1 file does not own
  // globals, so a v1 restore must leave it alone.
  s.setItem("mathtutor.rewards.v1", JSON.stringify({ catalog: ["keep me"] }));

  const parsed = parseBackup(json);
  assert.equal(parsed.version, 1);
  const restored = importBackup(s, parsed);

  assert.equal(restored.profiles.length, 1);
  assert.equal(restored.profiles[0].name, "Maya");
  assert.equal(s.getItem(profileKey("progress.v1", "kid-1")), JSON.stringify({ xp: 5 }));
  assert.equal(s.getItem("mathtutor.rewards.v1"), JSON.stringify({ catalog: ["keep me"] }));
});

/* ---------- (d) a foreign file is rejected with the friendly message ---------- */

test("a foreign file is rejected with the warm, non-technical message", () => {
  assert.throws(
    () => parseBackup(JSON.stringify({ kind: "some-other-app", stuff: 1 })),
    /doesn't look right — is it a MathTutor backup\?/,
  );
  assert.throws(() => parseBackup("not json at all {{{"), /is it a MathTutor backup\?/);
});

test("a backup from a newer app version is rejected clearly instead of half-importing", () => {
  const doc = exportBackup(mockStore(), 1);
  const future = JSON.stringify({ ...doc, version: 3 });
  assert.throws(() => parseBackup(future), /newer version of MathTutor/);
});

/* ---------- (e) keys the format does not own survive a restore untouched ---------- */

test("unmanaged keys (sound preference and friends) are untouched by a restore", () => {
  const s = mockStore();
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  saveProfiles(doc, s);
  seedFullKid(s, "kid-1");
  s.setItem("mathtutor.admin.v1", JSON.stringify({ v: "old" }));

  const json = backupToJson(exportBackup(s, 9000));

  // Set the sacred, un-owned keys AFTER the export and confirm restore ignores them.
  s.setItem("mathtutor:sound-muted", "1");
  s.setItem("mathtutor:install-dismissed", "1");
  s.setItem("mt.redemptions.legacyAdopted.v1", "1");
  s.setItem("mt.progress.openDomains", JSON.stringify(["add"]));
  s.setItem("mathtutor.admin.unlocked", "1");

  importBackup(s, parseBackup(json));

  assert.equal(s.getItem("mathtutor:sound-muted"), "1");
  assert.equal(s.getItem("mathtutor:install-dismissed"), "1");
  assert.equal(s.getItem("mt.redemptions.legacyAdopted.v1"), "1");
  assert.equal(s.getItem("mt.progress.openDomains"), JSON.stringify(["add"]));
  // mathtutor.admin.unlocked must survive even though mathtutor.admin.v1 is managed.
  assert.equal(s.getItem("mathtutor.admin.unlocked"), "1");
  // ...and the managed neighbour was in fact restored.
  assert.equal(s.getItem("mathtutor.admin.v1"), JSON.stringify({ v: "old" }));
});

/* ---------- storage access never throws ---------- */

test("import never throws when writes are blocked (quota / private mode)", () => {
  const readOnly: StorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  const backup = exportBackup(mockStore(), 1);
  assert.doesNotThrow(() => importBackup(readOnly, backup));
});

/* ---------- imported state counts as migrated ---------- */

test("after import the legacy migration never re-runs", () => {
  const s = mockStore();
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  saveProfiles(doc, s);
  seedFullKid(s, "kid-1");
  const json = backupToJson(exportBackup(s, 9000));

  const fresh = mockStore();
  importBackup(fresh, parseBackup(json));
  assert.equal(migrateLegacyOnce(fresh).migrated, false);
});

/* ---------- practiceProgress: a managed suffix like any other ---------- */

test("practiceProgress.v1 round-trips (namespaced + legacy twin) and is cleared on restore", () => {
  const payload = JSON.stringify({ assignmentId: "a1", index: 7, attempts: [] });
  const legacyPayload = JSON.stringify({ assignmentId: "legacy", index: 0, attempts: [] });

  const src = mockStore();
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  saveProfiles(doc, src);
  src.setItem(profileKey("practiceProgress.v1", "kid-1"), payload);
  src.setItem("mt.practiceProgress.v1", legacyPayload);

  const backup = exportBackup(src, 9000);
  assert.equal(backup.data["kid-1"]["practiceProgress.v1"], payload);
  assert.equal(backup.legacy["mt.practiceProgress.v1"], legacyPayload);
  assert.ok(BACKUP_SUFFIXES.includes("practiceProgress.v1"));
  assert.ok(LEGACY_KEYS.includes("mt.practiceProgress.v1"));

  // A mid-run save after the export must be replaced by the file, not kept.
  src.setItem(profileKey("practiceProgress.v1", "kid-1"), JSON.stringify({ assignmentId: "later" }));
  const dst = mockStore();
  importBackup(dst, backup);
  assert.equal(dst.getItem(profileKey("practiceProgress.v1", "kid-1")), payload);
  assert.equal(dst.getItem("mt.practiceProgress.v1"), legacyPayload);

  // A kid the file does not carry loses their resume state.
  const target = mockStore();
  saveProfiles(doc, target);
  target.setItem(profileKey("practiceProgress.v1", "kid-1"), payload);
  importBackup(target, parseBackup(backupToJson(exportBackup(mockStore(), 1))));
  assert.equal(target.getItem(profileKey("practiceProgress.v1", "kid-1")), null);
});

/* ---------- cross-kid contamination: an id only storage can see ---------- */

test("restore wipes payloads of a kid whose doc entry was lost, so the next kid inherits nothing", () => {
  const s = mockStore();
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  saveProfiles(doc, s);
  s.setItem(profileKey("progress.v1", "kid-1"), JSON.stringify({ xp: 10 }));
  s.setItem(profileKey("progress.v1", "kid-2"), JSON.stringify({ xp: 4242 }));
  s.setItem(profileKey("points.v1", "kid-2"), JSON.stringify({ version: 2, balance: 99 }));

  const backup = parseBackup(backupToJson(exportBackup(s, 9000)));
  // kid-2 exists only as payloads: absent from the doc AND from the file.
  assert.deepEqual(Object.keys(backup.data), ["kid-1"]);

  s.removeItem(PROFILE_KEY); // profiles doc lost/corrupt, kid-2 keys survive
  importBackup(s, backup);

  assert.equal(s.getItem(profileKey("progress.v1", "kid-2")), null);
  assert.equal(s.getItem(profileKey("points.v1", "kid-2")), null);
  assert.equal(s.getItem(profileKey("progress.v1", "kid-1")), JSON.stringify({ xp: 10 }));

  // nextId comes from the restored doc, so the next kid IS kid-2.
  const { doc: after, profile } = addProfile(loadProfiles(s), { name: "Leo" }, 5000);
  saveProfiles(after, s);
  assert.equal(profile.id, "kid-2");
  assert.deepEqual(readProfileStats(s, profile.id), {
    xp: 0,
    streakCount: 0,
    sessionsCompleted: 0,
    balance: 0,
    skillsTouched: 0,
  });
});

/* ---------- malformed payload maps cannot inject junk keys ---------- */

test("a same-kind file with a string where data/kid-1 should be a record writes no junk keys", () => {
  const hostile = {
    kind: "mathtutor-backup",
    version: 2,
    exportedAt: 1,
    profiles: { version: 1, profiles: [MAYA], activeProfileId: "kid-1", nextId: 2 },
    data: { "kid-1": "not-an-object" },
    legacy: "nope",
    globals: { "evil.key": "1", "mathtutor.rewards.v1": JSON.stringify({ kept: true }) },
  };

  const parsed = parseBackup(JSON.stringify(hostile));
  assert.deepEqual(parsed.data, {});
  assert.deepEqual(parsed.legacy, {});

  const s = mockStore();
  assert.equal(importBackup(s, parsed).profiles.length, 1);
  // Object.entries("not-an-object") would otherwise write one key per character.
  assert.deepEqual(
    keysOf(s).filter((k) => /^mt\.p\.kid-1\.\d+$/.test(k)),
    [],
  );
  assert.equal(s.getItem("evil.key"), null);
  assert.equal(s.getItem("mathtutor.rewards.v1"), JSON.stringify({ kept: true }));
});

/* ---------- export is a read path and must never throw ---------- */

test("export returns a sane empty backup on hostile storage instead of throwing", () => {
  const danger: StorageLike = {
    getItem: () => {
      throw new Error("SecurityError: storage disabled");
    },
    setItem: () => {
      throw new Error("SecurityError: storage disabled");
    },
    removeItem: () => {
      throw new Error("SecurityError: storage disabled");
    },
  };
  const backup = exportBackup(danger, 5);
  assert.deepEqual(backup.profiles.profiles, []);
  assert.deepEqual(backup.data, {});
  assert.deepEqual(backup.legacy, {});
  assert.deepEqual(backup.globals, {});
  assert.equal(backup.version, 2);

  const getItemOnly: StorageLike = {
    getItem: () => {
      throw new Error("boom");
    },
    setItem: () => {},
    removeItem: () => {},
  };
  assert.deepEqual(exportBackup(getItemOnly, 5).globals, {});
});

/* ---------- a partial restore must be reported and non-destructive ---------- */

test("a restore whose payload writes fail reports them and leaves existing play alone", () => {
  const src = mockStore();
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  saveProfiles(doc, src);
  src.setItem(profileKey("progress.v1", "kid-1"), JSON.stringify({ xp: 10 }));
  src.setItem(profileKey("points.v1", "kid-1"), JSON.stringify({ version: 2, balance: 5 }));
  const backup = parseBackup(backupToJson(exportBackup(src, 9000)));

  const device = mockStore();
  saveProfiles(backup.profiles, device);
  const newer = JSON.stringify({ xp: 999 });
  device.setItem(profileKey("progress.v1", "kid-1"), newer);

  const removes: string[] = [];
  const noRoom: StorageLike = {
    getItem: (k) => device.getItem(k),
    setItem: (k, v) => {
      if (k.startsWith("mt.p.")) throw new Error("QuotaExceededError");
      device.setItem(k, v);
    },
    removeItem: (k) => void removes.push(k),
    key: (i) => device.key?.(i) ?? null,
    get length() {
      return device.length ?? 0;
    },
  };

  const full = importBackupReport(noRoom, backup);
  assert.equal(full.doc.profiles.length, 1);
  assert.deepEqual(full.failed.slice().sort(), [
    profileKey("points.v1", "kid-1"),
    profileKey("progress.v1", "kid-1"),
  ].sort());
  // Nothing was deleted in exchange for payloads that never landed.
  assert.equal(device.getItem(profileKey("progress.v1", "kid-1")), newer);
  assert.deepEqual(removes, []);

  // Same file into a device with room: a clean replace, nothing reported.
  const dst = mockStore();
  const ok = importBackupReport(dst, backup);
  assert.deepEqual(ok.failed, []);
  assert.equal(dst.getItem(profileKey("progress.v1", "kid-1")), JSON.stringify({ xp: 10 }));
});

/* ---------- a restore writes only what its format version owns ---------- */

test("a v1 file cannot smuggle a v2 suffix or an orphan id into storage", () => {
  const v1 = {
    kind: "mathtutor-backup",
    version: 1,
    exportedAt: 1,
    profiles: { version: 1, profiles: [MAYA], activeProfileId: "kid-1", nextId: 2 },
    data: {
      "kid-1": {
        "progress.v1": JSON.stringify({ xp: 5 }),
        "quest.v1": JSON.stringify({ quest: "smuggled" }),
      },
      "kid-9": { "progress.v1": JSON.stringify({ xp: 7 }) },
    },
    legacy: {},
  };

  const s = mockStore();
  assert.equal(importBackup(s, parseBackup(JSON.stringify(v1))).profiles.length, 1);
  assert.equal(s.getItem(profileKey("progress.v1", "kid-1")), JSON.stringify({ xp: 5 }));
  assert.equal(s.getItem(profileKey("quest.v1", "kid-1")), null);
  assert.equal(s.getItem(profileKey("progress.v1", "kid-9")), null);
});

/* ---------- purgeProfile: the delete UI's promise ---------- */

test("purgeProfile removes the profile and every payload key namespaced to it", () => {
  const s = mockStore();
  const r1 = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  const r2 = addProfile(r1.doc, { name: "Leo" }, 2000);
  saveProfiles(r2.doc, s);
  seedFullKid(s, "kid-1");
  seedFullKid(s, "kid-2");
  s.setItem("mt.p.kid-1.someFutureStore.v9", JSON.stringify({ future: true }));
  s.setItem("mt.progress.v1", JSON.stringify({ legacy: "shared" }));

  const next = purgeProfile("kid-1", s);
  assert.deepEqual(next.profiles.map((p) => p.id), ["kid-2"]);
  assert.deepEqual(
    keysOf(s).filter((k) => k.startsWith("mt.p.kid-1.")),
    [],
  );
  for (const suffix of BACKUP_SUFFIXES) {
    assert.equal(s.getItem(profileKey(suffix, "kid-2")), payloadFor(suffix));
  }
  // Legacy un-namespaced keys are device-wide, not this kid's to erase.
  assert.equal(s.getItem("mt.progress.v1"), JSON.stringify({ legacy: "shared" }));
  assert.deepEqual(loadProfiles(s).profiles.map((p) => p.id), ["kid-2"]);
});

test("purgeProfile keeps the profile when a payload cannot be removed", () => {
  const backing = mockStore();
  const { doc } = addProfile(emptyProfilesDoc(), { name: "Maya" }, 1000);
  saveProfiles(doc, backing);
  const payload = JSON.stringify({ xp: 3 });
  backing.setItem(profileKey("progress.v1", "kid-1"), payload);

  const blocked: StorageLike = {
    getItem: (k) => backing.getItem(k),
    setItem: (k, v) => backing.setItem(k, v),
    removeItem: () => {
      throw new Error("blocked");
    },
    key: (i) => backing.key?.(i) ?? null,
    get length() {
      return backing.length ?? 0;
    },
  };

  assert.deepEqual(purgeProfile("kid-1", blocked).profiles.map((p) => p.id), ["kid-1"]);
  assert.equal(backing.getItem(profileKey("progress.v1", "kid-1")), payload);
  assert.deepEqual(loadProfiles(backing).profiles.map((p) => p.id), ["kid-1"]);
});
