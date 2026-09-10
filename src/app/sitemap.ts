import type { MetadataRoute } from "next";

/** Public routes only; per-kid data is device-local and unindexable. */
const ROUTES = ["/", "/profiles", "/plan", "/progress", "/rewards"];

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = resolveSiteUrl().replace(/\/$/, "");
  const lastModified = new Date();
  return ROUTES.map((route) => ({
    url: `${base}${route === "/" ? "" : route}`,
    lastModified,
    changeFrequency: "weekly",
    priority: route === "/" ? 1 : 0.6,
  }));
}
