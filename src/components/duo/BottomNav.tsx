import type { ReactNode } from "react";

export type NavItem = {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
};

/** Big-icon bottom nav with active pop. Original styling. */
export function BottomNav({
  items,
  activeId,
  onNavigate,
}: {
  items: NavItem[];
  activeId: string;
  onNavigate?: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 border-t-2 border-line bg-card/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col gap-1 px-2 py-2">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onNavigate?.(item.id)}
                aria-current={active ? "page" : undefined}
                className={`touch-target flex w-full flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 font-display text-xs font-semibold uppercase tracking-wide transition-transform ${
                  active ? "animate-duo-pop scale-105 text-primary" : "text-muted"
                }`}
              >
                <span aria-hidden className="relative inline-flex" style={{ transform: active ? "scale(1.15)" : undefined }}>
                  {item.icon}
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span className="absolute -right-2 -top-1 flex min-h-[20px] min-w-[20px] items-center justify-center rounded-pill bg-coral px-1 text-[11px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
                <span
                  aria-hidden
                  className="h-1.5 w-10 rounded-pill"
                  style={{ background: active ? "var(--color-primary)" : "transparent" }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
