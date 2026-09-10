/**
 * Route transition wrapper.
 *
 * Next re-mounts a `template.tsx` on every navigation, so this is the one
 * place a page-level entrance can live without every screen remembering to
 * add it. Pure CSS (`mt-route`) and disabled by `prefers-reduced-motion`.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="mt-route">{children}</div>;
}
