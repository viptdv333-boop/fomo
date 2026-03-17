import { Server as SocketIOServer } from "socket.io";

const globalForIO = globalThis as unknown as {
  io: SocketIOServer | undefined;
};

export function setIO(io: SocketIOServer) {
  globalForIO.io = io;
}

export function getIO(): SocketIOServer | null {
  return globalForIO.io ?? null;
}
