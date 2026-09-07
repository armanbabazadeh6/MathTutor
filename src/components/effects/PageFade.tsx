"use client";

import type { CSSProperties, ReactNode } from "react";
import "./effects.css";

/** Gentle page/section entrance. CSS-only, honors prefers-reduced-motion. */
export function PageFade({ children }: { children: ReactNode }) {
  return <div className="mt-page-fade">{children}</div>;
}
