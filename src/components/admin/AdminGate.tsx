// Admin route guard stub.
//
// Gates /admin behind a simple PIN so students sharing the device do not
// wander into parent controls. This is NOT real security: the PIN lives in
// the client bundle and the unlock flag in sessionStorage.
//
// PRODUCTION SWAP: enforce auth server-side instead —
//   - Supabase Auth (parent/teacher role) + middleware.ts checking the
//     session/role before serving /admin/*,
//   - remove this component and ADMIN_PIN entirely at that point.
"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ADMIN_PIN } from "@/components/admin/store";

const SESSION_KEY = "mathtutor.admin.unlocked";

export function AdminGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  if (open) return <>{children}</>;

  function submit(): void {
    if (pin === ADMIN_PIN) {
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Private mode: gate still opens for this render.
      }
      setOpen(true);
    } else {
      setError(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-5 py-10">
      <Card title="Parent area" subtitle="Enter the parent PIN to continue.">
        <div className="flex flex-col gap-3">
          <label className="text-sm font-bold" htmlFor="admin-pin">
            PIN (demo: {ADMIN_PIN})
          </label>
          <input
            id="admin-pin"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="touch-target rounded-pill border-2 border-line bg-card px-5 text-lg tracking-widest outline-none focus:border-primary"
          />
          {error ? (
            <p className="text-sm font-bold text-coral">Wrong PIN — try again.</p>
          ) : null}
          <Button onClick={submit}>Unlock</Button>
        </div>
      </Card>
    </main>
  );
}
