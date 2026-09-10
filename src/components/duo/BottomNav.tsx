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
      className="sticky bottom-0 z-20 border-t-2 border-line bg-card/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col gap-1 px-2 py-1.5">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onNavigate?.(item.id)}
                aria-current={active ? "page" : undefined}
                className={`duo-press mt-focus flex min-h-[56px] w-full flex-col items-center gap-0.5 rounded-2xl px-2 py-1 font-display text-kid-xs font-bold uppercase tracking-wide ${
                  active ? "text-primaryink" : "text-muted"
                }`}
              >
                <span
                  aria-hidden
                  className={`relative inline-flex items-center justify-center rounded-pill px-4 py-1 ${
                    active ? "bg-mint" : ""
                  }`}
                >
                  <span
                    className={active ? "animate-duo-pop inline-flex" : "inline-flex"}
                    style={{ transform: active ? "scale(1.1)" : undefined }}
                  >
                    {item.icon}
                  </span>
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span className="absolute -right-1 -top-1 flex min-h-[20px] min-w-[20px] items-center justify-center rounded-pill border-2 border-card bg-coralink px-1 text-[11px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
