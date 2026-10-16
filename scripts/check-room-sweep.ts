/* Paid-channel live-socket sweep: server/subscription-sweep.ts + the batch rule in src/lib/channel-access.ts.
   Pure parts (who is revoked), the batch rule against an in-memory fake of the three tables, and a full sweep with a fake Socket.IO server.
   Run: npx tsx scripts/check-room-sweep.ts   (exit code 1 on a failed assertion) */
import { mayStayInChannelRoom, deniedChannelRoomUsers } from "../src/lib/channel-access";
import { selectRevocations, sweepChannelRooms } from "../server/subscription-sweep";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const NOW = new Date("2026-10-16T12:00:00Z");
const past = new Date("2020-01-01T00:00:00Z"); // far enough in the past for the real clock too (the full sweep below uses it)
const future = new Date("2099-01-01T00:00:00Z");
const T = { id: "t1", authorId: "author" };
const sub = (over: Partial<{ subscriberId: string; authorId: string; tariffId: string | null; status: string; endDate: Date }> = {}) => ({
  subscriberId: "u1", authorId: "author", tariffId: "t1" as string | null, status: "active", endDate: future, ...over,
});

/* the pure rule */
eq("active subscriber stays", mayStayInChannelRoom(T, "u1", false, [sub()], NOW), true);
eq("term already ended -> out", mayStayInChannelRoom(T, "u1", false, [sub({ endDate: past })], NOW), false);
eq("term ends exactly now -> out (gt, not gte)", mayStayInChannelRoom(T, "u1", false, [sub({ endDate: NOW })], NOW), false);
eq("status not active -> out", mayStayInChannelRoom(T, "u1", false, [sub({ status: "cancelled" })], NOW), false);
eq("subscription to another channel of the same author -> out", mayStayInChannelRoom(T, "u1", false, [sub({ tariffId: "t2" })], NOW), false);
eq("legacy author-wide subscription (tariffId null) stays", mayStayInChannelRoom(T, "u1", false, [sub({ tariffId: null })], NOW), true);
eq("subscription to another author -> out", mayStayInChannelRoom(T, "u1", false, [sub({ authorId: "other" })], NOW), false);
eq("someone else's subscription does not count", mayStayInChannelRoom(T, "u1", false, [sub({ subscriberId: "u2" })], NOW), false);
eq("no subscriptions -> out", mayStayInChannelRoom(T, "u1", false, [], NOW), false);
eq("author stays", mayStayInChannelRoom(T, "author", false, [], NOW), true);
eq("staff stays", mayStayInChannelRoom(T, "adm", true, [], NOW), true);
eq("one expired + one live row -> stays", mayStayInChannelRoom(T, "u1", false, [sub({ endDate: past }), sub()], NOW), true);

/* which sockets are revoked */
const byRoom = new Map([
  ["roomA", [{ socketId: "s1", userId: "u1" }, { socketId: "s2", userId: "u1" }, { socketId: "s3", userId: "u2" }]],
  ["roomB", [{ socketId: "s4", userId: "u1" }]],
  ["general", [{ socketId: "s5", userId: "u1" }]],
]);
eq(
  "every socket of a denied user in that room, only that room",
  selectRevocations(byRoom, new Map([["roomA", new Set(["u1"])]])),
  [{ roomId: "roomA", socketId: "s1" }, { roomId: "roomA", socketId: "s2" }]
);
eq("nobody denied -> nothing", selectRevocations(byRoom, new Map()), []);
eq("empty denied set -> nothing", selectRevocations(byRoom, new Map([["roomA", new Set<string>()]])), []);
eq(
  "denied in two rooms",
  selectRevocations(byRoom, new Map([["roomA", new Set(["u2"])], ["roomB", new Set(["u1"])]])),
  [{ roomId: "roomA", socketId: "s3" }, { roomId: "roomB", socketId: "s4" }]
);

/* batch rule against a fake db (tariff "t1" -> roomA of "author", slug "alpha"; tariff "t2" -> roomB of "author2", no slug) */
const queries = { tariff: 0, user: 0, sub: 0 };
const fakeDb = {
  subscriptionTariff: {
    findMany: async (a: { where: { channelRoomId: { in: string[] } } }) => {
      queries.tariff++;
      const all = [
        { id: "t1", authorId: "author", slug: "alpha", channelRoomId: "roomA" },
        { id: "t2", authorId: "author2", slug: null, channelRoomId: "roomB" },
      ];
      return all.filter((t) => a.where.channelRoomId.in.includes(t.channelRoomId));
    },
  },
  user: {
    findMany: async (a: { where: { id: { in: string[] } } }) => {
      queries.user++;
      return a.where.id.in.filter((id) => id === "adm").map((id) => ({ id }));
    },
  },
  subscription: {
    findMany: async (a: { where: { subscriberId: { in: string[] }; authorId: { in: string[] }; endDate: { gt: Date } } }) => {
      queries.sub++;
      const rows = [
        sub({ subscriberId: "live" }),
        sub({ subscriberId: "gone", endDate: past }),
        sub({ subscriberId: "legacy", tariffId: null }),
        sub({ subscriberId: "wrongch", authorId: "author2", tariffId: "t9" }),
      ];
      return rows.filter(
        (r) => a.where.subscriberId.in.includes(r.subscriberId) && a.where.authorId.in.includes(r.authorId) && r.endDate > a.where.endDate.gt
      );
    },
  },
};
(async () => {
  const present = new Map([
    ["roomA", new Set(["live", "gone", "legacy", "adm", "author", "nobody"])],
    ["roomB", new Set(["wrongch", "author2"])],
    ["general", new Set(["gone"])], // not a channel room: never denied
  ]);
  const { denied, paths } = await deniedChannelRoomUsers(fakeDb as never, present, NOW);
  eq("roomA denied", [...(denied.get("roomA") ?? [])].sort(), ["gone", "nobody"]);
  eq("roomB denied", [...(denied.get("roomB") ?? [])].sort(), ["wrongch"]);
  eq("non-channel room untouched", denied.has("general"), false);
  eq("renew paths (slug, else id)", [paths.get("roomA"), paths.get("roomB")], ["/channels/alpha", "/channels/t2"]);
  eq("one query per table, however many rooms/users", queries, { tariff: 1, user: 1, sub: 1 });

  /* full sweep with a fake Socket.IO server */
  const left: string[] = [];
  const emitted: Array<[string, string, unknown]> = [];
  const mk = (id: string, userId: string) => ({
    id, data: { userId },
    leave: (r: string) => { left.push(`${id}:${r}`); },
    emit: (ev: string, payload: unknown) => { emitted.push([id, ev, payload]); },
  });
  const socks = new Map([
    ["s1", mk("s1", "gone")], ["s2", mk("s2", "live")], ["s3", mk("s3", "gone")], ["s4", mk("s4", "wrongch")],
  ]);
  const fakeIo = {
    sockets: {
      sockets: socks,
      adapter: {
        rooms: new Map<string, Set<string>>([
          ["s1", new Set(["s1"])], // a socket's own room
          ["user_gone", new Set(["s1", "s3"])],
          ["price_SBER", new Set(["s1"])],
          ["conv_x", new Set(["s1"])],
          ["roomA", new Set(["s1", "s2"])],
          ["roomB", new Set(["s4"])],
          ["general", new Set(["s3"])],
        ]),
      },
    },
  };
  const n = await sweepChannelRooms(fakeIo as never, fakeDb as never);
  eq("sweep revokes 2 sockets", n, 2);
  eq("left rooms", left, ["s1:roomA", "s4:roomB"]);
  eq("told with the renew path", emitted, [
    ["s1", "room_access_revoked", { roomId: "roomA", path: "/channels/alpha" }],
    ["s4", "room_access_revoked", { roomId: "roomB", path: "/channels/t2" }],
  ]);

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
})();
