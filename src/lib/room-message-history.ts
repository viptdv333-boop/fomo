/** HTTP history and live socket events can finish in either order. */
export interface RoomMessageRow { id: string; createdAt: string }
export interface HistoryRequest { roomId: string; request: number; version: number }

export const ROOM_HISTORY_ORDER = [{ createdAt: "desc" }, { id: "desc" }] as const;

export class RoomMessageHistory {
  private roomId: string;
  private request = 0;
  private version = 0;
  private changed = new Map<string, number>();

  constructor(roomId: string) { this.roomId = roomId; }

  select(roomId: string) {
    if (roomId === this.roomId) return;
    this.roomId = roomId;
    this.request++;
    this.version = 0;
    this.changed.clear();
  }

  begin(roomId: string): HistoryRequest | null {
    // A delayed send/join acknowledgement from an old screen must not select that room again.
    if (roomId !== this.roomId) return null;
    return { roomId, request: ++this.request, version: this.version };
  }

  current(ticket: HistoryRequest) {
    return ticket.roomId === this.roomId && ticket.request === this.request;
  }

  live(roomId: string, id: string) {
    if (roomId !== this.roomId) return false;
    this.changed.set(id, ++this.version);
    return true;
  }

  merge<T extends RoomMessageRow>(ticket: HistoryRequest, current: T[], incoming: T[]): T[] | null {
    if (!this.current(ticket)) return null;
    // The server response is the authoritative latest window: cached messages
    // that were removed or deleted must not live forever in the local copy.
    const rows = new Map(incoming.map(row => [row.id, row]));
    // Keep only live changes that arrived after this request started.
    for (const row of current) {
      if ((this.changed.get(row.id) ?? 0) > ticket.version) rows.set(row.id, row);
    }
    return [...rows.values()]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(-200);
  }
}
