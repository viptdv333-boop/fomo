"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { useChatBadge } from "./useChatBadge";

/** Messenger icon in the header with a red counter of unread personal / болталка messages. */
export default function MessengerButton() {
  const { data: session } = useSession();
  const { t } = useT();
  const count = useChatBadge();

  if (!session?.user?.id) return null;
  const label = count > 0 ? `${t("nav.messenger")}: ${count}` : t("nav.messenger");
  return (
    <Link
      href="/messages"
      title={label}
      aria-label={label}
      className="relative p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6A8.4 8.4 0 0112.5 3H13a8.5 8.5 0 018 8v.5z" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
