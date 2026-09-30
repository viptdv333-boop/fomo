/**
 * Client helper for per-user terminal data (drawing/indicator templates, custom indicator scripts, layouts…).
 * Signed-in users are stored on the account through /api/terminal/userdata; guests (401) fall back to
 * localStorage so everything still works, it just stays in this browser.
 */

export interface UserDataItem<T = unknown> {
  key: string;
  data: T;
  updatedAt?: string;
}

const LS = "fomo-terminal-userdata:";

function lsRead<T>(kind: string): UserDataItem<T>[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS + kind) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function lsWrite(kind: string, items: UserDataItem[]) {
  try {
    localStorage.setItem(LS + kind, JSON.stringify(items));
  } catch {}
}

let signedIn: boolean | null = null; // null = unknown yet

/** All items of a kind (optionally one key). Never throws. */
export async function listUserData<T = unknown>(kind: string, key?: string): Promise<UserDataItem<T>[]> {
  if (signedIn !== false) {
    try {
      const r = await fetch(`/api/terminal/userdata?kind=${encodeURIComponent(kind)}${key ? `&key=${encodeURIComponent(key)}` : ""}`, { cache: "no-store" });
      if (r.status === 401) signedIn = false;
      else if (r.ok) {
        signedIn = true;
        return ((await r.json()).items ?? []) as UserDataItem<T>[];
      }
    } catch {
      /* offline: fall through to the local copy */
    }
  }
  const all = lsRead<T>(kind);
  return key ? all.filter((i) => i.key === key) : all;
}

/** Create or replace an item. Resolves false when the server refused (limit, size). */
export async function saveUserData(kind: string, key: string, data: unknown): Promise<boolean> {
  if (signedIn !== false) {
    try {
      const r = await fetch("/api/terminal/userdata", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, key, data }) });
      if (r.status === 401) signedIn = false;
      else return r.ok;
    } catch {
      /* fall through to local */
    }
  }
  const all = lsRead(kind).filter((i) => i.key !== key);
  all.unshift({ key, data, updatedAt: new Date().toISOString() });
  lsWrite(kind, all.slice(0, 300));
  return true;
}

export async function deleteUserData(kind: string, key: string): Promise<void> {
  if (signedIn !== false) {
    try {
      const r = await fetch(`/api/terminal/userdata?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (r.status === 401) signedIn = false;
      else return;
    } catch {
      /* fall through */
    }
  }
  lsWrite(kind, lsRead(kind).filter((i) => i.key !== key));
}

/** True/false once known (after the first call), null before. */
export function isSignedInForUserData(): boolean | null {
  return signedIn;
}
