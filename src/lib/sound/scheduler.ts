/** Pure note schedules for the tiny WebAudio synth. No DOM, no AudioContext. */

export type WaveKind = "sine" | "triangle" | "square" | "sawtooth";

export interface Tone {
  /** Oscillator frequency in Hz. */
  freqHz: number;
  /** Offset from sequence start in ms. Overlapping starts = chord. */
  startMs: number;
  /** Audible length in ms (attack+decay envelope applied by engine). */
  durationMs: number;
  /** Peak gain 0..1. Wrong blip stays soft on purpose. */
  gain: number;
  wave: WaveKind;
}

export type SoundName = "correct" | "wrong" | "levelup" | "fanfare";

function tone(
  freqHz: number,
  startMs: number,
  durationMs: number,
  gain: number,
  wave: WaveKind = "sine",
): Tone {
  return { freqHz, startMs, durationMs, gain, wave };
}

/** Correct ding: bright two-note chime (A5 → E6). */
export function correctSequence(): Tone[] {
  return [tone(880, 0, 140, 0.22), tone(1318.51, 110, 260, 0.22)];
}

/** Gentle wrong blip: soft low pair, never harsh. Triangle, low gain. */
export function wrongSequence(): Tone[] {
  return [
    { ...tone(329.63, 0, 160, 0.12), wave: "triangle" },
    { ...tone(233.08, 140, 220, 0.1), wave: "triangle" },
  ];
}

/** Level-up arpeggio: C5 E5 G5 C6 ascending. */
export function levelUpSequence(): Tone[] {
  const freqs = [523.25, 659.25, 783.99, 1046.5];
  return freqs.map((f, i) => tone(f, i * 110, i === freqs.length - 1 ? 320 : 150, 0.2));
}

/** Quest-complete fanfare: rising line + held final chord. */
export function fanfareSequence(): Tone[] {
  return [
    tone(523.25, 0, 150, 0.2),
    tone(659.25, 130, 150, 0.2),
    tone(783.99, 260, 150, 0.2),
    tone(1046.5, 390, 420, 0.22),
    // Final chord shimmer over the held C6.
    tone(783.99, 390, 420, 0.1),
    tone(1318.51, 560, 320, 0.12),
  ];
}

export function sequenceFor(name: SoundName): Tone[] {
  switch (name) {
    case "correct":
      return correctSequence();
    case "wrong":
      return wrongSequence();
    case "levelup":
      return levelUpSequence();
    case "fanfare":
      return fanfareSequence();
  }
}

/** End of the last tone — used to stop the context tail / tests. */
export function totalDurationMs(tones: readonly Tone[]): number {
  let end = 0;
  for (const t of tones) end = Math.max(end, t.startMs + t.durationMs);
  return end;
}
