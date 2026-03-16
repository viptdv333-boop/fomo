"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import LanguageSelector from "./LanguageSelector";

export default function Header() {
  const { data: session } = useSession();
  const user = session?.user as any;

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/images/logo-light.png"
            alt="FOMO"
            width={120}
            height={60}
            className="block dark:hidden"
            priority
          />
          <Image
            src="/images/logo-dark.png"
            alt="FOMO"
            width={120}
            height={60}
            className="hidden dark:block"
            priority
          />
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/feed"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Стакан
          </Link>
          <Link
            href="/chat"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Чат
          </Link>
          <Link
            href="/messages"
            className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Мессенджер
          </Link>
          {user?.role === "ADMIN" && (
            <Link
              href="/admin"
              className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
            >
              Админ
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSelector />
          <ThemeToggle />
          {session && <NotificationBell />}
          {session ? (
            <>
              <Link
                href="/ideas/new"
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
              >
                + Идея
              </Link>
              <Link
                href="/profile"
                className="text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
              >
                {user?.name}
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Выйти
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
