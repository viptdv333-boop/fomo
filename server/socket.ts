import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export function initSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    path: "/api/socketio",
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    const userId = socket.handshake.auth.userId;
    if (!userId) {
      return next(new Error("Authentication required"));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, status: true },
    });

    if (!user || user.status !== "APPROVED") {
      return next(new Error("User not approved"));
    }

    socket.data.userId = user.id;
    socket.data.displayName = user.displayName;
    next();
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.data.displayName}`);

    socket.on("join_room", async (roomId: string) => {
      const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
      if (!room) return;
      socket.join(roomId);
    });

    socket.on("leave_room", (roomId: string) => {
      socket.leave(roomId);
    });

    socket.on("send_message", async (data: { roomId: string; text: string }) => {
      const { roomId, text } = data;
      if (!text?.trim()) return;

      const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
      if (!room) return;

      const message = await prisma.chatMessage.create({
        data: {
          roomId,
          userId: socket.data.userId,
          text: text.trim(),
        },
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      });

      io.to(roomId).emit("new_message", message);
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.displayName}`);
    });
  });

  return io;
}
