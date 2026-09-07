"use client";

import { useRouter } from "next/navigation";
import { ChunkyButton } from "@/components/duo/ChunkyButton";

/**
 * One consistent big Back button, reskinned on ChunkyButton.
 * Same props/behavior: goes to `href`, reads as `label`.
 */
export function BackButton({ href = "/", label = "Back" }: { href?: string; label?: string }) {
  const router = useRouter();
  return (
    <div className="flex">
      <ChunkyButton
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => router.push(href)}
        aria-label={label}
      >
        <span aria-hidden>←</span>
        {label}
      </ChunkyButton>
    </div>
  );
}
