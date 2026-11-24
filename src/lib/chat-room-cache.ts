/**
 * A small browser-side fallback for the public Boltalka room. The service worker
 * deliberately does not cache authenticated chat API responses; keep only the
 * latest room messages locally so a transient request failure or page reload
 * cannot make the conversation look empty.
 */
const GENERAL_ROOM_ID = "general";
const MAX_CACHED_MESSAGES = 200;
const cacheKey = (roomId: string) => `fomo-chat-room-v1:${roomId}`;

function validMessage(value: unknown, roomId: string): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const user = row.user as Record<string, unknown> | null;
  return (
    typeof row.id === "string" &&
    row.roomId === roomId &&
    typeof row.text === "string" &&
    typeof row.createdAt === "string" &&
    Number.isFinite(Date.parse(row.createdAt)) &&
    !!user && typeof user.id === "string" && typeof user.displayName === "string"
  );
}

export function readRoomMessageCache<T>(roomId: string): T[] {
  if (roomId !== GENERAL_ROOM_ID || typeof localStorage === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(cacheKey(roomId)) || "null");
    if (!Array.isArray(value)) return [];
    return value
      .filter((row) => validMessage(row, roomId) && !(row as { isDeleted?: boolean }).isDeleted)
      .slice(-MAX_CACHED_MESSAGES) as T[];
  } catch {
    return [];
  }
}

export function writeRoomMessageCache<T>(roomId: string, messages: T[]): void {
  if (roomId !== GENERAL_ROOM_ID || typeof localStorage === "undefined") return;
  try {
    const rows = messages.filter((row) =>
      validMessage(row, roomId) &&
      !(row as { isDeleted?: boolean }).isDeleted &&
      !(row as { pending?: unknown }).pending
    );
    const sorted = rows.sort((a, b) => {
      const left = Date.parse((a as { createdAt: string }).createdAt);
      const right = Date.parse((b as { createdAt: string }).createdAt);
      return left - right || (a as { id: string }).id.localeCompare((b as { id: string }).id);
    });
    localStorage.setItem(cacheKey(roomId), JSON.stringify(sorted.slice(-MAX_CACHED_MESSAGES)));
  } catch {
    // Storage can be disabled or full; the server and live socket remain authoritative.
  }
}
