import type { ReactNode } from "react";
import { Character } from "./Character";

/**
 * Shared empty state: mascot, one sentence, one optional action.
 * Used wherever a screen would otherwise show nothing (no quest, no prizes,
 * nothing due for review) so "empty" reads as designed, not broken.
 */
export function EmptyState({
  title,
  body,
  pose = "sleep",
  action,
  className = "",
}: {
  title: string;
  body?: string;
  pose?: "happy" | "cheer" | "think" | "wow" | "oops" | "sleep";
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 py-6 text-center ${className}`}>
      <Character pose={pose} size={104} label="Mascot waiting" />
      <p className="font-display text-kid-xl font-semibold">{title}</p>
      {body ? <p className="max-w-sm text-kid-base font-semibold text-muted">{body}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
