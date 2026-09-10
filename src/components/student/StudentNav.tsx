"use client";

import { usePathname, useRouter } from "next/navigation";
import { BottomNav } from "@/components/duo/BottomNav";
import type { NavItem } from "@/components/duo/BottomNav";
import { useRewardStore } from "@/components/admin/rewardStore";

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
 * Student bottom nav: the shared Duo nav, bled past the page gutter so the bar
 * runs edge to edge.
 *
 * The frame exists for that bleed (`-mx-5`), and it carries the pin: sticky is
 * clamped by the containing block, so the shared nav's own `sticky bottom-0`
 * cannot move inside a box exactly its own height — it would just track the
 * scroll. The frame is the only sticky layer and adds no chrome: no border,
 * background, shadow, or `overflow-hidden` (which used to clip the nav's focus
 * rings). The bar's top border, translucent background, and safe-area padding
 * all come from the shared nav.
 *
 * The Prizes tab badges a prize a grown-up has approved: that is the one status
 * a kid can act on, since `requested` is still waiting and `fulfilled` is
 * already handed over.
 */
export function StudentNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useRewardStore();
  const readyPrizes = state.redemptions.filter((r) => r.status === "approved").length;
  const activeId =
    LINKS.find((l) =>
      l.href === "/" ? pathname === "/" : pathname.startsWith(l.href),
    )?.id ?? "today";
  const items: NavItem[] = LINKS.map((l) => ({
    id: l.id,
    label: l.label,
    icon: (
      <span aria-hidden className="text-2xl leading-none">
        {ICONS[l.id]}
      </span>
    ),
    ...(l.id === "rewards" && readyPrizes > 0 ? { badge: readyPrizes } : {}),
  }));
  return (
    <div className="sticky bottom-0 z-20 -mx-5 mt-8">
      <BottomNav
        items={items}
        activeId={activeId}
        onNavigate={(id) => {
          const link = LINKS.find((l) => l.id === id);
          if (link) router.push(link.href);
        }}
      />
    </div>
  );
}
