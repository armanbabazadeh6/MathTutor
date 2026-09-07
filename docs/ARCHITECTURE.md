# Architecture

Next.js 14 App Router + TypeScript, `src/` layout. Vercel-ready, no custom server.

## Layout

- `src/app/` — routes. `layout.tsx` (shell + fonts), `page.tsx` (Today placeholder).
- `src/components/ui/` — design-system primitives: Button, Card, Badge, ProgressBar.
- `src/lib/skills.ts` — skill taxonomy (id, domain, name, description). Single source of truth for curriculum; math engine and progress tracking consume it later.
- `docs/` — product/architecture/DB/roadmap/status records.

## Later (other tasks own)

- Math engine (question generation, answer checking) — new `src/lib/math/` (not created here).
- DB migrations + data access — new `src/lib/db/` (not created here).
- Student player routes, admin dashboard routes — not created here.

## Design system

Warm playful-but-clean: cream background `#fdf6ec`, ink text, forest-green primary, sunny/mint/sky accents. No purple gradients. CSS vars in `globals.css` + Tailwind theme extension. Rounded cards (1.25rem), 48px touch targets, 17px base type.
