"use client";

import React from "react";
import { ChunkyButton } from "@/components/duo/ChunkyButton";
import { Character } from "@/components/duo/Character";

interface ErrorGateState {
  error: Error | null;
}

/**
 * Friendly crash screen. Try Again resets UI state only —
 * never touches localStorage / game progress.
 */
export class ErrorGate extends React.Component<
  { children: React.ReactNode },
  ErrorGateState
> {
  state: ErrorGateState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorGateState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    try {
      console.error("[ErrorGate]", error);
    } catch {
      /* logging is best-effort */
    }
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-5 p-6 text-center"
      >
        <Character pose="oops" size={132} label="Mascot looking apologetic" />
        <h1 className="font-display text-kid-2xl font-semibold">Oops! Something tripped.</h1>
        <p className="text-kid-base font-semibold text-muted">
          Your stars and progress are safe. Let&apos;s try that screen again.
        </p>
        <ChunkyButton size="lg" onClick={this.retry}>
          Try again
        </ChunkyButton>
      </div>
    );
  }
}
