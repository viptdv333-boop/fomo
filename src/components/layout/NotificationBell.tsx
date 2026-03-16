"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch("/api/notifications?limit=10");
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-lg border dark:border-gray-700 z-50 max-h-96 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
            <h3 className="text-sm font-semibold dark:text-gray-100">
              Уведомления
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-600 hover:text-blue-800 transition"
              >
                Прочитать все
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-72">
            {notifications.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">
                Нет уведомлений
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b dark:border-gray-700 last:border-0 ${
                    !n.isRead
                      ? "bg-blue-50/50 dark:bg-blue-900/10"
                      : ""
                  }`}
                >
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => setOpen(false)}
                      className="block"
                    >
                      <div className="text-sm font-medium dark:text-gray-200">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {n.body}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        {new Date(n.createdAt).toLocaleDateString("ru", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </Link>
                  ) : (
                    <>
                      <div className="text-sm font-medium dark:text-gray-200">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {n.body}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        {new Date(n.createdAt).toLocaleDateString("ru", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
