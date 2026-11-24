import assert from "node:assert/strict";
import { RoomMessageHistory, ROOM_HISTORY_ORDER } from "../src/lib/room-message-history";

const rows = Array.from({ length: 210 }, (_, i) => ({
  id: `m${String(i).padStart(4, "0")}`, createdAt: new Date(1700000000000 + i * 1000).toISOString(), text: `message ${i}`,
}));

// Execute the same ordered-window selection the route passes to Prisma: the 201st+ posts must survive reopening.
const newest = [...rows].sort((a, b) => {
  for (const order of ROOM_HISTORY_ORDER) {
    const field = Object.keys(order)[0] as "createdAt" | "id";
    const result = b[field].localeCompare(a[field]);
    if (result) return result;
  }
  return 0;
}).slice(0, 200).reverse();
assert.equal(newest.length, 200);
assert.equal(newest.at(-1)?.id, "m0209");
assert.equal(newest[0].id, "m0010");

const sync = new RoomMessageHistory("general");
const first = sync.begin("general");
assert.deepEqual(sync.merge(first, [], newest), newest);

// HTTP started before the next live message, edit and deletion. None may be rolled back by that response.
const fetch = sync.begin("general");
const edit = { ...rows[209], text: "edited live" };
const removed = { ...rows[208], text: "deleted live", isDeleted: true };
const newRow = { ...rows[209], id: "m0210", createdAt: new Date(1700000210000).toISOString() };
for (const row of [edit, removed, newRow]) assert.equal(sync.live("general", row.id), true);
const merged = sync.merge(fetch, [...newest.slice(0, -2), removed, edit, newRow], newest)!;
assert.equal(merged.at(-1)?.id, "m0210");
assert.equal(merged.find(x => x.id === edit.id)?.text, "edited live");
assert.equal(merged.find(x => x.id === removed.id)?.text, "deleted live");
assert.equal(new Set(merged.map(x => x.id)).size, merged.length);

// A fresh authoritative read may update old values; retained history outside the returned window does not vanish.
const refresh = sync.begin("general");
const refreshed = sync.merge(refresh, rows, newest.map(x => x.id === edit.id ? { ...x, text: "new server edit" } : x))!;
assert.equal(refreshed.length, 210);
assert.equal(refreshed.find(x => x.id === edit.id)?.text, "new server edit");

// Switching rooms while a request is in flight, including switching back, never accepts a previous screen's response.
sync.select("private");
assert.equal(sync.merge(refresh, [], newest), null);
assert.equal(sync.live("general", "wrong-room"), false);
const privateRequest = sync.begin("private");
sync.select("general");
assert.equal(sync.merge(privateRequest, [], newest), null);
assert.equal(sync.merge(refresh, [], newest), null);

const old = sync.begin("general");
const fresh = sync.begin("general");
assert.equal(sync.merge(old, [], newest), null);
assert.equal(sync.merge(fresh, [], newest)?.at(-1)?.id, "m0209");
console.log("OK: latest messages after 200, concurrent HTTP/socket/send/edit/delete, room switches, out-of-order loads, no duplicates");
