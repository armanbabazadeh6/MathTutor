"use client";

import { useEffect, useState } from "react";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { INSTALL_DISMISSED_KEY } from "@/lib/sound";

function isStandalone(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    return false;
  } catch {
    return false;
  }
}

function isIPad(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const ua = window.navigator.userAgent;
    if (/iPad/i.test(ua)) return true;
    // iPadOS 13+ reports as Macintosh with touch.
    if (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1) return true;
    return false;
  } catch {
    return false;
  }
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * Pure gate for the iPad Add-to-Home-Screen nudge. Shown once, dismissable,
 * only when running in the browser (not standalone).
 */
export function shouldShowInstallPrompt(opts: {
  standalone: boolean;
  dismissed: boolean;
  isIPad: boolean;
}): boolean {
  return !opts.standalone && !opts.dismissed && opts.isIPad;
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShowInstallPrompt({ standalone: isStandalone(), dismissed: wasDismissed(), isIPad: isIPad() }))
      return;
    setVisible(true);
  }, []);
  const dismiss = () => {
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      /* dismiss still applies for this session */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Add MathTutor to your Home Screen"
      className="fixed inset-x-3 bottom-3 z-50 rounded-card border-2 border-line bg-card p-4 shadow-lift"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <p className="font-display text-kid-base font-bold">📲 Add MathTutor to your Home Screen</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-kid-sm font-semibold text-muted">
        <li>
          Tap <span aria-hidden>⎙</span> Share in Safari&apos;s toolbar
        </li>
        <li>Tap “Add to Home Screen”</li>
        <li>Tap “Add” — then open it like an app</li>
      </ol>
      <ChunkyButton size="sm" variant="secondary" className="mt-3" onClick={dismiss}>
        Got it
      </ChunkyButton>
    </div>
  );
}
