"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";

interface Message {
  id: string;
  text: string;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface ChatRoomProps {
  roomId: string;
  roomName: string;
}

export default function ChatRoom({ roomId, roomName }: ChatRoomProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load history
    fetch(`/api/chat/messages?roomId=${roomId}`)
      .then((r) => r.json())
      .then(setMessages);
  }, [roomId]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const socket = getSocket(session.user.id);
    socket.emit("join_room", roomId);

    socket.on("new_message", (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.emit("leave_room", roomId);
      socket.off("new_message");
    };
  }, [roomId, session?.user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !session?.user?.id) return;

    const socket = getSocket(session.user.id);
    socket.emit("send_message", { roomId, text: input });
    setInput("");
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="bg-white dark:bg-gray-900 rounded-t-xl border-b dark:border-gray-700 px-4 py-3 font-semibold dark:text-gray-100">
        {roomName}
      </div>

      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900 px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-8">
            Нет сообщений. Начните общение!
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.user.id === session?.user?.id;
          return (
            <div key={msg.id} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                isMe
                  ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                  : "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
              }`}>
                {msg.user.displayName[0]}
              </div>
              <div className={isMe ? "text-right" : ""}>
                <div className={`flex items-baseline gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                  <span className="font-medium text-sm dark:text-gray-100">
                    {msg.user.displayName}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(msg.createdAt).toLocaleTimeString("ru", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className={`text-sm inline-block px-3 py-1.5 rounded-2xl ${
                  isMe
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-bl-md"
                }`}>{msg.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className="bg-white dark:bg-gray-900 rounded-b-xl border-t dark:border-gray-700 px-4 py-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Написать сообщение..."
          className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          Отправить
        </button>
      </form>
    </div>
  );
}
