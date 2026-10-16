/**
 * Live-socket sweep for paid-channel chat rooms.
 *
 * Access to a channel room is date-gated on every REST request and on join_room, but a socket that joined
 * BEFORE the subscription ended keeps its Socket.IO room membership until it reconnects, so an expired
 * subscriber with the app open would keep receiving live messages. Every few minutes this job looks at who is
 * currently in a channel room, re-checks them (one batch of queries per tick, not one per socket) and, for
 * those who no longer have access, makes the socket leave the room and tells it with `room_access_revoked`
 * { roomId, path } (path = the channel page, where the subscription is renewed).
 *
 * SUBSCRIPTION_SWEEP=0 switches it off; SUBSCRIPTION_SWEEP_MS changes the period (default 2 min, min 10 s).
 * Next-free imports only (same rule as alert-scheduler.ts).
 */

import type { Server as SocketIOServer } from "socket.io";
import type { PrismaClient } from "@prisma/client";
import { deniedChannelRoomUsers } from "../src/lib/channel-access";

const DEFAULT_TICK_MS = 2 * 60 * 1000;
// Rooms the server joins sockets to for other purposes — never chat rooms.
const NON_CHAT_PREFIXES = ["price_", "user_", "conv_"];

export interface PresentSocket { socketId: string; userId: string }
export interface Revocation { roomId: string; socketId: string }

/**
 * Pure: which (room, socket) pairs must be revoked, given who is in each room and who is denied there.
 * A user with several sockets in the room (two tabs, phone + PC) has every one of them revoked.
 */
export function selectRevocations(
  socketsByRoom: Map<string, PresentSocket[]>,
  deniedByRoom: Map<string, Set<string>>
): Revocation[] {
  const out: Revocation[] = [];
  for (const [roomId, sockets] of socketsByRoom) {
    const denied = deniedByRoom.get(roomId);
    if (!denied || denied.size === 0) continue;
    for (const s of sockets) if (denied.has(s.userId)) out.push({ roomId, socketId: s.socketId });
  }
  return out;
}

/** Socket.IO adapter rooms -> chat-room candidates with the connected sockets (and their users) in each. */
function collectChatRooms(io: SocketIOServer): Map<string, PresentSocket[]> {
  const byRoom = new Map<string, PresentSocket[]>();
  for (const [name, members] of io.sockets.adapter.rooms) {
    if (io.sockets.sockets.has(name)) continue; // a socket's own private room (name = socket id)
    if (NON_CHAT_PREFIXES.some((p) => name.startsWith(p))) continue;
    const list: PresentSocket[] = [];
    for (const socketId of members) {
      const userId = io.sockets.sockets.get(socketId)?.data?.userId;
      if (typeof userId === "string") list.push({ socketId, userId });
    }
    if (list.length > 0) byRoom.set(name, list);
  }
  return byRoom;
}

/** One pass; returns how many sockets were revoked. Exported for manual runs / tests with a fake io. */
export async function sweepChannelRooms(io: SocketIOServer, db: PrismaClient): Promise<number> {
  const socketsByRoom = collectChatRooms(io);
  if (socketsByRoom.size === 0) return 0;

  const present = new Map<string, Set<string>>();
  for (const [roomId, list] of socketsByRoom) present.set(roomId, new Set(list.map((s) => s.userId)));

  const { denied, paths } = await deniedChannelRoomUsers(db, present);
  const revocations = selectRevocations(socketsByRoom, denied);
  for (const r of revocations) {
    const socket = io.sockets.sockets.get(r.socketId);
    if (!socket) continue;
    socket.leave(r.roomId);
    socket.emit("room_access_revoked", { roomId: r.roomId, path: paths.get(r.roomId) ?? null });
  }
  return revocations.length;
}

const g = globalThis as unknown as { subscriptionSweepTimer?: ReturnType<typeof setInterval> };

export function startSubscriptionSweep(io: SocketIOServer, db: PrismaClient) {
  if (process.env.SUBSCRIPTION_SWEEP === "0") return;
  if (g.subscriptionSweepTimer) return;
  const ms = Math.max(10_000, Number(process.env.SUBSCRIPTION_SWEEP_MS) || DEFAULT_TICK_MS);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const n = await sweepChannelRooms(io, db);
      if (n > 0) console.log(`[SubscriptionSweep] revoked ${n} socket(s) from channel rooms`);
    } catch (e) {
      console.error("[SubscriptionSweep]", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  g.subscriptionSweepTimer = setInterval(run, ms);
}
