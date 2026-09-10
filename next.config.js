/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// Next.js injects its runtime as inline <script> tags and inline styles, so a
// nonce-less CSP must allow 'unsafe-inline' for both. React Refresh needs
// 'unsafe-eval' in development only — production stays as tight as Next allows.
const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

// The app is local-first: nothing talks to Supabase today, but
// NEXT_PUBLIC_SUPABASE_URL is the documented optional sync target, so allow
// that origin (and nothing else) rather than silently breaking the wiring.
const connectSrc = isDev ? "'self' ws: wss: https://*.supabase.co" : "'self' https://*.supabase.co";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
