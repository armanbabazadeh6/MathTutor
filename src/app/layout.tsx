import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Fredoka, Nunito } from "next/font/google";
import { ErrorGate } from "@/components/duo/ErrorGate";
import { InstallPrompt } from "@/components/effects/InstallPrompt";

const display = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
  fallback: ["Nunito", "ui-rounded", "system-ui", "sans-serif"],
});

const body = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-body",
  display: "swap",
  fallback: ["ui-rounded", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

// Absolute origin used to build link-preview/sitemap URLs. Explicit env wins;
// otherwise fall back to the Vercel deployment URL (set automatically by
// Vercel) and finally localhost for dev, so metadataBase is never undefined.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

const SITE_TITLE = "MathTutor — 4th Grade Practice";
const SITE_DESCRIPTION = "Warm, playful daily math practice for 4th graders.";

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteUrl()),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "MathTutor",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MathTutor",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "MathTutor",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "MathTutor mascot",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/icons/icon-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Deliberately no `maximumScale`/`userScalable` lock: blocking pinch-zoom is
  // a WCAG 1.4.4 failure, and a kid may genuinely need to zoom a fraction bar.
  viewportFit: "cover",
  themeColor: "#3a8400",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="MathTutor" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <ErrorGate>{children}</ErrorGate>
        <InstallPrompt />
      </body>
    </html>
  );
}
