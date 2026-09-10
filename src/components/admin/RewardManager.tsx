// MathTutor parent reward controls: catalog CRUD + redemption inbox/history.
//
// Wired into the admin Dashboard (see Dashboard.tsx); all state lives in
// ./rewardStore (localStorage, versioned, documented Supabase swap) using the
// canonical types from src/lib/rewards/types.ts.
"use client";

import { useState } from "react";
import type { Redemption } from "@/lib/rewards/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  rewardTitleFor,
  useRewardStore,
  validateRewardInput,
} from "@/components/admin/rewardStore";

interface FormDraft {
  title: string;
  cost: string;
  streakRequired: string;
}

const EMPTY_DRAFT: FormDraft = { title: "", cost: "", streakRequired: "0" };

function RedemptionRow({
  title,
  r,
  children,
}: {
  title: string;
  r: Redemption;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line p-3">
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-sm font-semibold text-muted">
          ⭐ {r.pointCost} pts · requested {r.requestedAt.slice(0, 10)}
          {r.decidedAt ? ` · decided ${r.decidedAt.slice(0, 10)}` : null}
        </p>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </li>
  );
}

function streakLabel(days: number | undefined): string | null {
  if (!days || days <= 0) return null;
  return ` · 🔥 ${days}-day streak`;
}

export function RewardManager() {
  const { state, actions } = useRewardStore();
  const [draft, setDraft] = useState<FormDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const pending = state.redemptions.filter((r) => r.status === "requested");
  const approved = state.redemptions.filter((r) => r.status === "approved");
  const history = state.redemptions.filter((r) => r.status !== "requested");

  function startEdit(id: string): void {
    const reward = state.catalog.find((r) => r.id === id);
    if (!reward) return;
    setEditingId(id);
    setDraft({
      title: reward.title,
      cost: String(reward.pointCost),
      streakRequired: String(reward.minStreakDays ?? 0),
    });
    setFormError(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormError(null);
  }

  function submit(): void {
    const input = {
      title: draft.title,
      pointCost: Number(draft.cost),
      minStreakDays: draft.streakRequired === "" ? 0 : Number(draft.streakRequired),
    };
    const error = validateRewardInput(input);
    if (error) {
      setFormError(error);
      return;
    }
    const result = editingId
      ? actions.updateReward(editingId, input)
      : actions.createReward(input);
    if (!result.ok) {
      setFormError(result.error ?? "Could not save.");
      return;
    }
    cancelEdit();
  }

  return (
    <Card
      title="Points economy"
      subtitle="Rewards kids spend points on, and the requests they send you."
    >
      <div className="flex flex-col gap-6">
        {/* Guard rails: fulfillment is offline. */}
        <p className="rounded-card border border-line bg-cream p-3 text-sm font-semibold">
          Real-world fulfillment happens offline — when you approve a gift card
          or outing, you buy and hand it over yourself. MathTutor only tracks
          the points, the request, and your decision.
        </p>

        {/* Catalog */}
        <section aria-label="Reward catalog">
          <h3 className="text-lg font-extrabold">Catalog</h3>
          {state.catalog.length === 0 ? (
            <p className="mt-2 text-muted">
              No rewards yet — create the first one below.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {state.catalog.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line p-3"
                >
                  <div>
                    <p className="font-bold">
                      <span aria-hidden>{r.icon} </span>
                      {r.title}{" "}
                      {r.example ? (
                        <Badge label="example" tone="sunny" />
                      ) : null}{" "}
                      {r.active ? null : (
                        <Badge label="off" tone="coral" />
                      )}
                    </p>
                    <p className="text-sm font-semibold text-muted">
                      ⭐ {r.pointCost} pts
                      {streakLabel(r.minStreakDays)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(r.id)}
                      className="touch-target text-sm font-bold text-primaryink underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.setActive(r.id, !r.active)}
                      aria-pressed={r.active}
                      className="touch-target text-sm font-bold text-primaryink underline"
                    >
                      {r.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Create / edit form */}
        <section aria-label={editingId ? "Edit reward" : "New reward"}>
          <h3 className="text-lg font-extrabold">
            {editingId ? "Edit reward" : "New reward"}
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-bold">
              Title
              <input
                value={draft.title}
                onChange={(e) =>
                  setDraft({ ...draft, title: e.target.value })
                }
                placeholder="Extra screen time"
                aria-label="Reward title"
                className="touch-target rounded-pill border-2 border-line bg-card px-4 text-base font-normal outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Cost (points)
              <input
                type="number"
                min={1}
                step={1}
                value={draft.cost}
                onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                placeholder="100"
                aria-label="Reward cost in points"
                className="touch-target rounded-pill border-2 border-line bg-card px-4 text-base font-normal outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Streak required (days)
              <input
                type="number"
                min={0}
                step={1}
                value={draft.streakRequired}
                onChange={(e) =>
                  setDraft({ ...draft, streakRequired: e.target.value })
                }
                aria-label="Required streak in days"
                className="touch-target rounded-pill border-2 border-line bg-card px-4 text-base font-normal outline-none focus:border-primary"
              />
            </label>
          </div>
          {formError ? (
            <p role="alert" className="mt-2 text-sm font-bold text-coralink">
              {formError}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-3">
            <Button onClick={submit}>
              {editingId ? "Save changes" : "Create reward"}
            </Button>
            {editingId ? (
              <Button variant="secondary" onClick={cancelEdit}>
                Cancel
              </Button>
            ) : null}
          </div>
        </section>

        {/* Pending inbox */}
        <section aria-label="Pending requests">
          <h3 className="text-lg font-extrabold">
            Requests waiting on you ({pending.length})
          </h3>
          {pending.length === 0 ? (
            <p className="mt-2 text-muted">
              Nothing waiting — new kid requests land here.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {pending.map((r) => (
                <RedemptionRow
                  key={r.id}
                  r={r}
                  title={rewardTitleFor(state, r)}
                >
                  <Button
                    variant="secondary"
                    onClick={() => actions.denyRedemption(r.id)}
                  >
                    Deny
                  </Button>
                  <Button onClick={() => actions.approveRedemption(r.id)}>
                    Approve
                  </Button>
                </RedemptionRow>
              ))}
            </ul>
          )}
        </section>

        {/* Approved: mark fulfilled */}
        {approved.length > 0 ? (
          <section aria-label="Approved, to fulfill">
            <h3 className="text-lg font-extrabold">
              Approved — buy & hand over ({approved.length})
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {approved.map((r) => (
                <RedemptionRow
                  key={r.id}
                  r={r}
                  title={rewardTitleFor(state, r)}
                >
                  <Button onClick={() => actions.markFulfilled(r.id)}>
                    Mark fulfilled
                  </Button>
                </RedemptionRow>
              ))}
            </ul>
          </section>
        ) : null}

        {/* History */}
        <section aria-label="Redemption history">
          <h3 className="text-lg font-extrabold">
            History ({history.length})
          </h3>
          {history.length === 0 ? (
            <p className="mt-2 text-muted">No decided requests yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {history.map((r) => (
                <RedemptionRow
                  key={r.id}
                  r={r}
                  title={rewardTitleFor(state, r)}
                >
                  <Badge label={r.status} tone="mint" />
                </RedemptionRow>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  );
}
