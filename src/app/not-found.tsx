"use client";

import { useRouter } from "next/navigation";
import { Character } from "@/components/duo/Character";
import { ChunkyButton } from "@/components/duo/ChunkyButton";

/** 404 route. Client component so the mascot button can navigate home. */
export default function NotFound() {
  const router = useRouter();

  return (
    <main className="mt-shell flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-5 px-5 text-center">
      <Character pose="think" size={132} label="Mascot looking puzzled" />
      <p className="mt-eyebrow text-muted">Page not found</p>
      <h1 className="font-display text-kid-2xl font-semibold text-ink">This path wandered off!</h1>
      <p className="text-kid-base font-semibold text-muted">
        We could not find that screen. Your stars and progress are safe.
      </p>
      <ChunkyButton size="lg" onClick={() => router.push("/")}>
        Back to Today
      </ChunkyButton>
    </main>
  );
}
