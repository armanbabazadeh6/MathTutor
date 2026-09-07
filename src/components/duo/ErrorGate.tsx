"use client";

import React from "react";

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
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-amber-50 p-6 text-center"
      >
        <div aria-hidden className="text-6xl">
          🦁
        </div>
        <h1 className="text-2xl font-extrabold">Oops! Leo tripped.</h1>
        <p className="max-w-sm text-base font-semibold text-slate-600">
          Your stars and progress are safe. Let&apos;s try that screen again.
        </p>
        <button
          type="button"
          onClick={this.retry}
          className="rounded-full bg-green-500 px-6 py-3 text-lg font-extrabold text-white shadow-md transition active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }
}
