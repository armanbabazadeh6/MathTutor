// Admin route guard stub.
//
// Gates /admin behind a simple PIN so students sharing the device do not
// wander into parent controls. This is NOT real security: the PIN lives in
// the client bundle and the unlock flag in sessionStorage.
//
// The unlock flag itself lives in ./store (ADMIN_PIN + setAdminUnlocked) so the
// dashboard's Lock button can clear it and send this tab back to the gate.
//
// PRODUCTION SWAP: enforce auth server-side instead —
//   - Supabase Auth (parent/teacher role) + middleware.ts checking the
//     session/role before serving /admin/*,
//   - remove this component and ADMIN_PIN entirely at that point.
"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ADMIN_PIN,
  setAdminUnlocked,
  useAdminUnlocked,
} from "@/components/admin/store";

export function AdminGate({ children }: { children: ReactNode }) {
  const unlocked = useAdminUnlocked();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  if (unlocked) return <>{children}</>;

  function submit(): void {
    if (pin === ADMIN_PIN) {
      setPin("");
      setAdminUnlocked(true);
    } else {
      setError(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-5 py-10">
      <Card title="Parent area" subtitle="Enter the parent PIN to continue.">
        <div className="flex flex-col gap-3">
          <label className="text-sm font-bold" htmlFor="admin-pin">
            PIN
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
            <p className="text-sm font-bold text-coralink">Wrong PIN — try again.</p>
          ) : null}
          <Button onClick={submit}>Unlock</Button>
        </div>
      </Card>
    </main>
  );
}
