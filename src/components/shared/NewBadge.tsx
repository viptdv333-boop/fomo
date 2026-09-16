"use client";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether an idea published at `createdAt` is still within its first 24h. */
export function isRecentlyPublished(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < DAY_MS;
}

export default function NewBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide text-white bg-gradient-to-r from-orange-500 via-pink-500 to-red-500 shadow-sm animate-pulse ${className}`}
    >
      Новое
    </span>
  );
}

export function ArchivedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide text-white bg-gray-400 dark:bg-gray-600 shadow-sm ${className}`}
    >
      Архив
    </span>
  );
}
