import type { MetadataRoute } from "next";

// Private surfaces: kid data and parent controls live here, and the app is
// device-local, so there is nothing for a crawler to index.
const DISALLOW = ["/admin", "/profile", "/practice"];

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }],
    sitemap: `${resolveSiteUrl()}/sitemap.xml`,
  };
}
