"use client";

import { usePathname, useRouter } from "next/navigation";
import { BottomNav } from "@/components/duo/BottomNav";
import type { NavItem } from "@/components/duo/BottomNav";

const LINKS = [
  { id: "today", href: "/", label: "Today" },
  { id: "plan", href: "/plan", label: "Plan" },
  { id: "progress", href: "/progress", label: "Goals" },
  { id: "rewards", href: "/rewards", label: "Prizes" },
];

const ICONS: Record<string, string> = {
  today: "☀️",
  plan: "🗺️",
  progress: "📈",
  rewards: "🏅",
};

/**
 * Student bottom nav, reskinned on the shared Duo BottomNav.
 * Same behavior: sticky bottom nav, active state from pathname.
 */
export function StudentNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const activeId =
    LINKS.find((l) => isActive(l.href))?.id ?? "today";
  const items: NavItem[] = LINKS.map((l) => ({
    id: l.id,
    label: l.label,
    icon: (
      <span aria-hidden className="text-2xl leading-none">
        {ICONS[l.id]}
      </span>
    ),
  }));
  return (
    <div className="sticky bottom-0 -mx-5 mt-8 px-5 pb-4 pt-2">
      <div className="overflow-hidden rounded-3xl border-2 border-line bg-card shadow-chunky">
        <BottomNav
          items={items}
          activeId={activeId}
          onNavigate={(id) => {
            const link = LINKS.find((l) => l.id === id);
            if (link) router.push(link.href);
          }}
        />
      </div>
    </div>
  );
}
