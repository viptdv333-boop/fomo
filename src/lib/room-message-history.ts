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

  begin(roomId: string): HistoryRequest {
    this.select(roomId);
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
    const rows = new Map(current.map(row => [row.id, row]));
    for (const row of incoming) {
      // A socket edit/delete or a successful send after this request began is newer than its HTTP snapshot.
      if ((this.changed.get(row.id) ?? 0) <= ticket.version || !rows.has(row.id)) rows.set(row.id, row);
    }
    return [...rows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
}
