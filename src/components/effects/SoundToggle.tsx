"use client";

import { useCallback, useEffect, useState } from "react";
import { installAutoUnlock, sound } from "@/lib/sound";

/** Mutable 🔊/🔇 toggle. Reads persisted mute; never touches game storage. */
export function SoundToggle() {
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installAutoUnlock(sound());
    setMuted(sound().isMuted());
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    const next = sound().toggleMuted();
    setMuted(next);
    if (!next) sound().playCorrect();
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl shadow-md transition active:scale-95"
    >
      <span aria-hidden>{!ready ? "🔊" : muted ? "🔇" : "🔊"}</span>
    </button>
  );
}
