import { AdminGate } from "@/components/admin/AdminGate";
import { Dashboard } from "@/components/admin/Dashboard";
import { DuoCard } from "@/components/duo/Card";

/**
 * Light theme touch only: the dashboard keeps its density and logic;
 * just the page chrome adopts the kid-theme header/cards.
 */
export default function AdminPage() {
  return (
    <AdminGate>
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 px-5 pb-8 pt-6">
        <DuoCard title="Grown-up corner 🛠️" subtitle="Stats and prizes live here. Kids, keep playing!">
          <p className="text-kid-sm font-semibold text-muted">
            Everything below works exactly as before — just wearing the new theme.
          </p>
        </DuoCard>
        <Dashboard />
      </main>
    </AdminGate>
  );
}
