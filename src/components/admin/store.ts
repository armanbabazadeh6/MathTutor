// MathTutor parent-area gate state.
//
// The parent dashboard reads the selected kid's REAL payloads — assignment,
// last result, progress, plan session and points — straight through
// src/lib/session.ts, and the kid list through src/lib/profile/store.ts. There
// is no admin-side copy of a kid's data any more (the old seeded demo doc at
// mathtutor.admin.v1 is gone), so this module holds only the two things the
// gate needs: the parent PIN and the per-tab unlock flag.
"use client";

import { useSyncExternalStore } from "react";

/**
 * Parent-area PIN. This is a speed bump, NOT a security boundary: the value is
 * inlined into the client bundle and every kid's assignments, points and prize
 * ledger live in this device's localStorage, so anyone with devtools can read
 * both. Override with NEXT_PUBLIC_ADMIN_PIN; real auth replaces this entirely
 * (see AdminGate).
 */
export const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "2468";

/** sessionStorage flag: "1" while this tab has the parent area unlocked. */
export const ADMIN_UNLOCK_KEY = "mathtutor.admin.unlocked";

/**
 * In-memory fallback for private-mode tabs where sessionStorage throws. The
 * gate still opens for this tab; it just cannot be remembered across reloads.
 */
let fallbackUnlocked = false;

const listeners = new Set<() => void>();

/** True while this tab has the parent area unlocked. Never throws. */
export function isAdminUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_UNLOCK_KEY);
    if (raw !== null) return raw === "1";
  } catch {
    // Private mode: sessionStorage unavailable, use the in-memory flag.
  }
  return fallbackUnlocked;
}

/** Set (or clear) the unlock flag and re-render every subscriber. Never throws. */
export function setAdminUnlocked(unlocked: boolean): void {
  fallbackUnlocked = unlocked;
  try {
    if (unlocked) window.sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1");
    else window.sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
  } catch {
    // Private mode: the in-memory flag above still applies for this tab.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Unlock state for the gate and the Lock button. The server snapshot is always
 * locked, so the PIN form is what hydrates and the client swaps to the
 * unlocked tree on commit.
 */
export function useAdminUnlocked(): boolean {
  return useSyncExternalStore(subscribe, isAdminUnlocked, () => false);
}
