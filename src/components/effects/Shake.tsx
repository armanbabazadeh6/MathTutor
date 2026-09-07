import type { ReactNode } from "react";
import "./effects.css";

/** Gentle shake wrapper for wrong-answer feedback. Re-shakes when `shakeKey` changes. */
export function Shake({ shakeKey, children }: { shakeKey: string | number; children: ReactNode }) {
  return (
    <div key={String(shakeKey)} className="mt-shake">
      {children}
    </div>
  );
}
