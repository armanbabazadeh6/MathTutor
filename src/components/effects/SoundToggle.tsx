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
      className="duo-press mt-focus inline-flex h-14 w-14 items-center justify-center rounded-pill border-2 border-line bg-card text-2xl"
      style={{ boxShadow: "0 3px 0 var(--chunky-shadow)" }}
    >
      <span aria-hidden>{!ready ? "🔊" : muted ? "🔇" : "🔊"}</span>
    </button>
  );
}
