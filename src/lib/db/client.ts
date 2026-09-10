import "server-only";

// src/lib/db/client.ts
// Supabase client helpers. Reads configuration from environment only — no
// secrets are hardcoded here or anywhere in client code.
//
// Installed dependency: @supabase/supabase-js (see package.json).
//
// Env vars (see .env.example):
//   Browser: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
//   Server:  SUPABASE_URL (falls back to NEXT_PUBLIC_SUPABASE_URL),
//            SUPABASE_SERVICE_ROLE_KEY (server-only) or
//            SUPABASE_ANON_KEY (falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type TypedSupabaseClient = SupabaseClient<Database>;

const BROWSER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const BROWSER_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the browser-safe (publishable) config is present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(BROWSER_URL && BROWSER_ANON_KEY);
}

let browserClient: TypedSupabaseClient | null = null;

/**
 * Browser singleton. Uses the anon key, so RLS applies. Throws when the
 * public env vars are missing — call isSupabaseConfigured() to guard.
 */
export function getBrowserClient(): TypedSupabaseClient {
  if (browserClient) return browserClient;
  if (!BROWSER_URL || !BROWSER_ANON_KEY) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }
  browserClient = createClient<Database>(BROWSER_URL, BROWSER_ANON_KEY);
  return browserClient;
}

/** For tests/dev only: drops the cached browser singleton. */
export function resetBrowserClient(): void {
  browserClient = null;
}

export interface ServerClientOptions {
  /**
   * Use the service-role key (bypasses RLS). Server components, route
   * handlers, and server actions only — NEVER expose to the browser.
   * Defaults to false (anon key, RLS enforced).
   */
  useServiceRole?: boolean;
}

/**
 * Server-side factory (no singleton: safe for concurrent requests). Resolves
 * SUPABASE_URL then NEXT_PUBLIC_SUPABASE_URL; with useServiceRole resolves
 * SUPABASE_SERVICE_ROLE_KEY, otherwise SUPABASE_ANON_KEY then
 * NEXT_PUBLIC_SUPABASE_ANON_KEY. Throws when the resolved pair is missing.
 */
export function createServerClient(
  options: ServerClientOptions = {},
): TypedSupabaseClient {
  const url = process.env.SUPABASE_URL ?? BROWSER_URL;
  const key = options.useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : (process.env.SUPABASE_ANON_KEY ?? BROWSER_ANON_KEY);
  if (!url || !key) {
    throw new Error(
      options.useServiceRole
        ? "Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example)."
        : "Supabase is not configured: set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
