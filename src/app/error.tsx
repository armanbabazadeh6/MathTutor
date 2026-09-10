"use client";

import { useEffect } from "react";
import { Character } from "@/components/duo/Character";
import { ChunkyButton } from "@/components/duo/ChunkyButton";

/**
 * Route-level error boundary. Rendered inside the root layout, so the app's
 * design tokens and fonts are already loaded. Reset re-renders the segment —
 * localStorage (progress, points, quest, prizes) is never touched.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      console.error("[route error]", error);
    } catch {
      /* logging is best-effort */
    }
  }, [error]);

  return (
    <main className="mt-shell flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-5 px-5 text-center">
      <Character pose="oops" size={132} label="Mascot looking apologetic" />
      <p className="mt-eyebrow text-muted">Something broke</p>
      <h1 className="font-display text-kid-2xl font-semibold text-ink">Oops! Something tripped.</h1>
      <p className="text-kid-base font-semibold text-muted">
        Your stars and progress are safe on this device. Let&apos;s try that screen again.
      </p>
      <ChunkyButton size="lg" onClick={reset}>
        Try again
      </ChunkyButton>
    </main>
  );
}
