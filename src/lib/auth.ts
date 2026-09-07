// src/lib/auth.ts
// Student username+PIN session abstraction (local stub over a Supabase-ready
// interface) plus admin email/password passthrough.
//
// MIGRATION PATH to Supabase:
//   1. Students today have no Supabase Auth user: LocalStubStudentAuth keeps a
//      signed-in { userId, username } session in memory/localStorage and checks
//      the PIN against a server-provided verifier. It NEVER mints trust — the
//      client session only personalizes the UI; RLS/service-role checks on the
//      server remain the real gate (see supabase/migrations/0001_init.sql A2).
//   2. To migrate: create one Supabase Auth user per student with
//      auth.uid() = public.users.id, move PIN verification into a server route
//      (or Edge Function) comparing against users.pin_hash, then swap
//      LocalStubStudentAuth for a SupabaseStudentAuth implementing the same
//      StudentAuth interface — no caller changes.
//   3. Admins need no migration: SupabaseAdminAuth below already passes
//      straight through to Supabase Auth email/password.

export interface StudentSession {
  userId: string;
  username: string;
  displayName: string | null;
  /** ISO timestamp when the session started. */
  startedAt: string;
  /** Always true for the stub: reminds callers this is not server trust. */
  stub: true;
}

export interface StudentCredentials {
  username: string;
  pin: string;
}

export interface StudentAuth {
  getSession(): StudentSession | null;
  signInWithPin(credentials: StudentCredentials): Promise<StudentSession>;
  signOut(): void;
}

/** Minimal store so the stub works in the browser and in tests. */
export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STUDENT_SESSION_KEY = "mathtutor:student-session";

/** Demo-only credential; never used for real authorization. */
export const DEMO_STUDENT = { username: "demo", pin: "1234" } as const;

function memoryStore(): SessionStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function defaultStore(): SessionStore {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return memoryStore();
}

/**
 * Local stub: accepts the demo credential (or any verifier injected by the
 * server layer) and persists a UI-personalization session. Replace per the
 * migration path above without touching callers.
 */
export class LocalStubStudentAuth implements StudentAuth {
  private store: SessionStore;
  /** Server-injected check; defaults to the demo credential. */
  private verify: (credentials: StudentCredentials) => Promise<{ userId: string; displayName: string | null } | null>;

  constructor(
    store: SessionStore = defaultStore(),
    verify?: (credentials: StudentCredentials) => Promise<{ userId: string; displayName: string | null } | null>,
  ) {
    this.store = store;
    this.verify =
      verify ??
      (async ({ username, pin }) =>
        username === DEMO_STUDENT.username && pin === DEMO_STUDENT.pin
          ? { userId: "11111111-1111-1111-1111-111111111111", displayName: "Demo Student" }
          : null);
  }

  getSession(): StudentSession | null {
    const raw = this.store.getItem(STUDENT_SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StudentSession;
    } catch {
      this.store.removeItem(STUDENT_SESSION_KEY);
      return null;
    }
  }

  async signInWithPin(credentials: StudentCredentials): Promise<StudentSession> {
    const match = await this.verify(credentials);
    if (!match) throw new Error("Invalid username or PIN.");
    const session: StudentSession = {
      userId: match.userId,
      username: credentials.username,
      displayName: match.displayName,
      startedAt: new Date().toISOString(),
      stub: true,
    };
    this.store.setItem(STUDENT_SESSION_KEY, JSON.stringify(session));
    return session;
  }

  signOut(): void {
    this.store.removeItem(STUDENT_SESSION_KEY);
  }
}

// ------------------------------------------------------------ admin ----
// Structural Supabase Auth surface: no @supabase/supabase-js import, so this
// file compiles before that dependency lands. Pass the real client:
//   new SupabaseAdminAuth(supabase.auth)

export interface AdminCredentials {
  email: string;
  password: string;
}

export interface SupabaseAuthLike {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{ error: Error | null }>;
  signOut(): Promise<{ error: Error | null }>;
  getSession(): Promise<{ data: { session: unknown } | null; error: Error | null }>;
}

export class SupabaseAdminAuth {
  private auth: SupabaseAuthLike;

  constructor(auth: SupabaseAuthLike) {
    this.auth = auth;
  }

  /** Passthrough to Supabase Auth; surfaces the error message on failure. */
  async signInWithPassword(credentials: AdminCredentials): Promise<void> {
    const { error } = await this.auth.signInWithPassword(credentials);
    if (error) throw new Error(error.message);
  }

  async signOut(): Promise<void> {
    const { error } = await this.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async getSession(): Promise<unknown> {
    const { data, error } = await this.auth.getSession();
    if (error) throw new Error(error.message);
    return data?.session ?? null;
  }
}
