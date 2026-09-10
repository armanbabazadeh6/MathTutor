"use client";

import { AdminGate } from "@/components/admin/AdminGate";
import { Dashboard } from "@/components/admin/Dashboard";
import { QuestControls } from "@/components/admin/QuestControls";
import { setAdminUnlocked } from "@/components/admin/store";
import { DuoCard } from "@/components/duo/Card";
import { Button } from "@/components/ui/Button";

/**
 * Grown-up corner: the real practice saved on this device, one kid at a time.
 * The dashboard reads each kid's stored payloads (src/components/admin/
 * Dashboard.tsx); QuestControls and RewardManager are the live parent actions.
 */
export default function AdminPage() {
  return (
    <AdminGate>
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 px-5 pb-8 pt-6">
        <DuoCard
          title="Grown-up corner 🛠️"
          subtitle="One kid at a time — real saved practice, never a sample."
          action={
            <Button variant="secondary" onClick={() => setAdminUnlocked(false)}>
              Lock
            </Button>
          }
        >
          <p className="text-kid-sm font-semibold text-muted">
            Pick a kid below to see the sessions, mastery, stars and prize requests
            saved on this device. A kid with nothing saved yet shows as empty — the
            numbers only appear once they have really practised. Lock takes this tab
            back to the PIN screen.
          </p>
        </DuoCard>
        <Dashboard />
        <QuestControls />
      </main>
    </AdminGate>
  );
}
