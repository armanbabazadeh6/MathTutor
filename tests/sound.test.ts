import { test } from "node:test";
import assert from "node:assert/strict";
import {
  correctSequence,
  fanfareSequence,
  levelUpSequence,
  sequenceFor,
  totalDurationMs,
  wrongSequence,
} from "../src/lib/sound/scheduler";
import { loadMuted, saveMuted, type StorageLike } from "../src/lib/sound/store";
import { SoundEngine, __resetAutoUnlockForTests } from "../src/lib/sound/engine";

function mockStore(seed: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

/** Fake AudioContext recording scheduled oscillators. */
function fakeContexts() {
  const calls: { freq: number; start: number }[] = [];
  const fake = {
    currentTime: 100,
    state: "running",
    destination: {},
    createOscillator() {
      const osc = {
        type: "",
        frequency: { setValueAtTime: (f: number) => void (oscFreq.f = f) },
        connect: () => {},
        start: (s: number) => void calls.push({ freq: oscFreq.f, start: s }),
        stop: () => {},
      };
      const oscFreq = { f: 0 };
      return osc;
    },
    createGain() {
      return {
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
      };
    },
    resume: () => Promise.resolve(),
  };
  return {
    calls,
    factory: { create: () => fake as unknown as AudioContext },
  };
}

function engineWithFake(storage?: StorageLike) {
  __resetAutoUnlockForTests();
  const { calls, factory } = fakeContexts();
  const engine = new SoundEngine({
    storage: storage ?? mockStore(),
    contexts: factory,
    autoUnlock: false,
  });
  return { engine, calls };
}

/* ---------- scheduler sequences ---------- */

test("correct ding is a two-note ascending chime", () => {
  const seq = correctSequence();
  assert.equal(seq.length, 2);
  assert.ok(seq[1].freqHz > seq[0].freqHz);
  assert.ok(seq[1].startMs > seq[0].startMs);
});

test("wrong blip is gentle: low frequencies, soft gain", () => {
  const seq = wrongSequence();
  assert.equal(seq.length, 2);
  for (const t of seq) {
    assert.ok(t.freqHz < 500, `too harsh: ${t.freqHz}Hz`);
    assert.ok(t.gain <= 0.12, `too loud: ${t.gain}`);
  }
});

test("level-up is a 4-note ascending arpeggio with staggered starts", () => {
  const seq = levelUpSequence();
  assert.equal(seq.length, 4);
  for (let i = 1; i < seq.length; i++) {
    assert.ok(seq[i].freqHz > seq[i - 1].freqHz);
    assert.ok(seq[i].startMs > seq[i - 1].startMs);
  }
});

test("fanfare ends with an overlapping final chord", () => {
  const seq = fanfareSequence();
  assert.ok(seq.length >= 5);
  const last = seq[seq.length - 1];
  const prev = seq[seq.length - 2];
  assert.ok(last.startMs >= prev.startMs);
  assert.ok(last.startMs < prev.startMs + prev.durationMs);
});

test("sequenceFor covers every sound name", () => {
  for (const name of ["correct", "wrong", "levelup", "fanfare"] as const) {
    const seq = sequenceFor(name);
    assert.ok(seq.length > 0, name);
    for (const t of seq) {
      assert.ok(t.freqHz > 0 && t.durationMs > 0);
    }
  }
});

test("scheduler returns fresh arrays (no shared mutation)", () => {
  const a = correctSequence();
  a.push({ freqHz: 1, startMs: 0, durationMs: 1, gain: 1, wave: "sine" });
  assert.equal(correctSequence().length, 2);
});

test("totalDurationMs spans the last tone end", () => {
  assert.equal(totalDurationMs(correctSequence()), 110 + 260);
  assert.equal(totalDurationMs([]), 0);
});

/* ---------- mute persistence ---------- */

test("mute persists round-trip through storage", () => {
  const s = mockStore();
  assert.equal(loadMuted(s), false);
  saveMuted(s, true);
  assert.equal(loadMuted(s), true);
  assert.equal(s.getItem("mathtutor:sound-muted"), "1");
  saveMuted(s, false);
  assert.equal(loadMuted(s), false);
});

test("mute load defaults to audible on garbage or missing storage", () => {
  assert.equal(loadMuted(mockStore({ "mathtutor:sound-muted": "yes" })), false);
  assert.equal(loadMuted(null), false);
  assert.equal(loadMuted(undefined), false);
});

test("engine starts with persisted mute and toggles persist", () => {
  __resetAutoUnlockForTests();
  const s = mockStore({ "mathtutor:sound-muted": "1" });
  const { factory } = fakeContexts();
  const engine = new SoundEngine({ storage: s, contexts: factory, autoUnlock: false });
  assert.equal(engine.isMuted(), true);
  engine.toggleMuted();
  assert.equal(engine.isMuted(), false);
  assert.equal(loadMuted(s), false);
});

/* ---------- engine scheduling ---------- */

test("muted engine schedules nothing", () => {
  const { engine, calls } = engineWithFake();
  engine.setMuted(true);
  assert.equal(engine.playCorrect(), false);
  assert.equal(calls.length, 0);
});

test("engine schedules one oscillator per scheduled tone", () => {
  const { engine, calls } = engineWithFake();
  assert.equal(engine.playLevelUp(), true);
  assert.equal(calls.length, levelUpSequence().length);
  assert.equal(engine.playWrong(), true);
  assert.equal(calls.length, levelUpSequence().length + wrongSequence().length);
});
