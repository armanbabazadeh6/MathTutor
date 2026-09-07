"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { loadAssignment } from "@/lib/session";

/**
 * One-tap start for the Today screen.
 *
 * INTEGRATOR: drop `<QuickStart />` at the top of the Today screen
 * (src/app/page.tsx). It reads the saved plan queue (read-only) and renders
 * nothing when there is no queued practice — so it is safe to always mount.
 * Tapping it jumps straight to /practice: 2 taps total (open app, tap Go).
 */
export function QuickStart() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    try {
      const queued = loadAssignment();
      if (queued && queued.problems.length > 0) setCount(queued.problems.length);
    } catch {
      setCount(0);
    }
  }, []);

  if (count === 0) return null;

  return (
    <ChunkyButton
      type="button"
      variant="accent"
      size="lg"
      fullWidth
      shine
      onClick={() => router.push("/practice")}
    >
      <span aria-hidden>▶</span>
      Keep going! {count} problems waiting
    </ChunkyButton>
  );
}
