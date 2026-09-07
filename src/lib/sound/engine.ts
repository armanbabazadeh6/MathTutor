/**
 * WebAudio engine: schedules pure scheduler sequences on oscillators.
 * No assets. Scheduler stays DOM-free; only this file touches AudioContext.
 */
import { sequenceFor, type SoundName, type Tone } from "./scheduler";
import { browserStorage, loadMuted, saveMuted, type StorageLike } from "./store";

export type { SoundName, Tone };

/** Minimal structural context so tests can inject a fake. */
export interface ContextFactory {
  create(): AudioContext | null;
}

export interface EngineOptions {
  storage?: StorageLike | null;
  contexts?: ContextFactory;
  autoUnlock?: boolean;
}

let sharedCtx: AudioContext | null = null;
let unlockInstalled = false;

function defaultContexts(): ContextFactory {
  return {
    create() {
      try {
        if (typeof window === "undefined") return null;
        const w = window as Window & { webkitAudioContext?: typeof AudioContext };
        const Ctor = window.AudioContext ?? w.webkitAudioContext;
        if (!Ctor) return null;
        if (!sharedCtx) sharedCtx = new Ctor();
        return sharedCtx;
      } catch {
        return null;
      }
    },
  };
}

export class SoundEngine {
  private storage: StorageLike | null;
  private contexts: ContextFactory;
  private muted: boolean;

  constructor(opts: EngineOptions = {}) {
    this.storage = opts.storage === undefined ? browserStorage() : opts.storage;
    this.contexts = opts.contexts ?? defaultContexts();
    this.muted = loadMuted(this.storage);
    if (opts.autoUnlock !== false) installAutoUnlock(this);
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(this.storage, muted);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Create/resume the shared context. Safe to call from any kid tap. */
  ensureUnlocked(): AudioContext | null {
    const ctx = this.contexts.create();
    try {
      if (ctx && ctx.state === "suspended") void ctx.resume();
    } catch {
      /* resume is best-effort; next tap retries */
    }
    return ctx;
  }

  play(name: SoundName): boolean {
    if (this.muted) return false;
    const ctx = this.ensureUnlocked();
    if (!ctx) return false;
    try {
      scheduleTones(ctx, sequenceFor(name));
      return true;
    } catch {
      return false;
    }
  }

  playCorrect(): boolean {
    return this.play("correct");
  }
  playWrong(): boolean {
    return this.play("wrong");
  }
  playLevelUp(): boolean {
    return this.play("levelup");
  }
  playFanfare(): boolean {
    return this.play("fanfare");
  }
}

export function scheduleTones(ctx: AudioContext, tones: readonly Tone[]): void {
  const t0 = ctx.currentTime;
  for (const t of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = t.wave;
    osc.frequency.setValueAtTime(Math.max(30, t.freqHz), t0 + t.startMs / 1000);
    const peak = Math.min(1, Math.max(0, t.gain));
    const start = t0 + t.startMs / 1000;
    const dur = Math.max(0.02, t.durationMs / 1000);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
}

/**
 * iOS-unlock safe: first tap/keypress creates + resumes the context inside
 * a user gesture. Idempotent; no-op on server / in tests.
 */
export function installAutoUnlock(engine?: Pick<SoundEngine, "ensureUnlocked">): void {
  try {
    if (typeof window === "undefined") return;
    if (unlockInstalled) return;
    unlockInstalled = true;
    const unlock = () => engine?.ensureUnlocked();
    const opts: AddEventListenerOptions = { once: true, passive: true } as AddEventListenerOptions;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("touchend", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
  } catch {
    /* listeners are enhancement-only */
  }
}

/** Reset module unlock flag — tests only. */
export function __resetAutoUnlockForTests(): void {
  unlockInstalled = false;
}

// Browser singleton. Module import has no side effects beyond lazy storage
// read; unlocking happens via constructor (client components) or first play().
let singleton: SoundEngine | null = null;

export function sound(): SoundEngine {
  if (!singleton) singleton = new SoundEngine();
  return singleton;
}

/** Inject a preconfigured engine (tests / storybook). */
export function __setSoundForTests(engine: SoundEngine | null): void {
  singleton = engine;
}
