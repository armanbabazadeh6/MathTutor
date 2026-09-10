"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Bottom-anchored modal sheet (centred on wide screens).
 *
 * Owns the behaviour that every hand-rolled sheet in the app was missing:
 * Escape to dismiss, focus moved in and restored on close, Tab kept inside,
 * background scroll locked, and a labelled dialog node for screen readers.
 */
export function Sheet({
  title,
  onClose,
  children,
  maxWidth = "28rem",
}: {
  /** Accessible name. Rendered visually unless `hideTitle` is set. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const query = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    // Prefer the first real control; fall back to the panel itself.
    (query()[0] ?? panel)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = query();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div aria-hidden className="mt-scrim absolute inset-0 bg-ink/45 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="mt-slide-up relative max-h-[90vh] w-full overflow-y-auto overscroll-contain rounded-t-card border-2 border-line bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] outline-none sm:rounded-card sm:pb-6"
        style={{ maxWidth, boxShadow: "0 8px 0 var(--chunky-shadow), var(--shadow-lift)" }}
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <span
          aria-hidden
          className="mx-auto mb-4 block h-1.5 w-12 rounded-pill bg-line sm:hidden"
        />
        {children}
      </div>
    </div>
  );
}
