/** Persisted master-mute flag. StorageLike keeps it unit-testable (no window). */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const MUTE_KEY = "mathtutor:sound-muted";
export const INSTALL_DISMISSED_KEY = "mathtutor:install-dismissed";

export function loadMuted(storage: StorageLike | null | undefined): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(
  storage: StorageLike | null | undefined,
  muted: boolean,
): void {
  try {
    if (!storage) return;
    if (muted) storage.setItem(MUTE_KEY, "1");
    else storage.removeItem(MUTE_KEY);
  } catch {
    /* storage full / blocked — sound still works, just not persisted */
  }
}

export function browserStorage(): StorageLike | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
    return null;
  } catch {
    return null;
  }
}
