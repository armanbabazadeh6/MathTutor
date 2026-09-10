"use client";

// Replaces the root layout when everything above it fails, so this file owns
// <html>/<body> and imports the global stylesheet itself (the layout's import
// is not rendered on this path).
import "./globals.css";
import { useEffect } from "react";

/**
 * Last-resort boundary. Kept dependency-light on purpose: no mascot, no
 * client stores, no navigation — just enough to tell the user their data is
 * local and let them retry a full render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      console.error("[global error]", error);
    } catch {
      /* logging is best-effort */
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-cream font-sans antialiased">
        <main className="mt-shell flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-5 px-5 text-center">
          <p className="mt-eyebrow text-muted">Something broke</p>
          <h1 className="font-display text-kid-2xl font-semibold text-ink">
            MathTutor needs a fresh start.
          </h1>
          <p className="text-kid-base font-semibold text-muted">
            Your stars and progress are saved on this device. Reload to keep playing.
          </p>
          <button
            type="button"
            onClick={reset}
            className="touch-target rounded-card border-2 border-line bg-primary px-6 py-3 text-kid-base font-bold text-white shadow-chunky"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
