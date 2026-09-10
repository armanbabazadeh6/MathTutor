"use client";

import { useRouter } from "next/navigation";
import { ChunkyButton } from "@/components/duo/ChunkyButton";

/**
 * One consistent big Back control, reskinned on ChunkyButton: a real labelled
 * secondary button (56px tall, visible arrow + word, chunky focus ring), not a
 * bare text link. Same props/behavior: goes to `href`, reads as `label`.
 */
export function BackButton({ href = "/", label = "Back" }: { href?: string; label?: string }) {
  const router = useRouter();
  return (
    <div className="flex">
      <ChunkyButton
        type="button"
        variant="secondary"
        size="md"
        onClick={() => router.push(href)}
        icon={<span aria-hidden>←</span>}
      >
        {label}
      </ChunkyButton>
    </div>
  );
}
