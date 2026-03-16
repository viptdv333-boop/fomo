"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import LanguageSelector from "./LanguageSelector";

export default function Header() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src="/images/logo-light.png"
            alt="FOMO"
            width={100}
            height={50}
            className="block dark:hidden w-[80px] sm:w-[100px] h-auto"
            priority
          />
          <Image
            src="/images/logo-dark.png"
            alt="FOMO"
            width={100}
            height={50}
            className="hidden dark:block w-[80px] sm:w-[100px] h-auto"
            priority
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/feed" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
            Стакан
          </Link>
          <Link href="/chat" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
            Чат
          </Link>
          <Link href="/messages" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
            Мессенджер
          </Link>
          {user?.role === "ADMIN" && (
            <Link href="/admin" className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium">
              Админ
            </Link>
          )}
        </nav>

        {/* Desktop right section */}
        <div className="hidden md:flex items-center gap-3">
          <LanguageSelector />
          <ThemeToggle />
          {session && <NotificationBell />}
          {session ? (
            <>
              <Link href="/ideas/new" className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                + Идея
              </Link>
              <Link href="/profile" className="text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                {user?.name}
              </Link>
              <button onClick={() => signOut({ callbackUrl: "/" })} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                Выйти
              </button>
            </>
          ) : (
            <Link href="/login" className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
              Войти
            </Link>
          )}
        </div>

        {/* Mobile right section */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          {session && <NotificationBell />}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 space-y-1">
          <Link href="/feed" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600">
            Стакан
          </Link>
          <Link href="/chat" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600">
            Чат
          </Link>
          <Link href="/messages" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600">
            Мессенджер
          </Link>
          {user?.role === "ADMIN" && (
            <Link href="/admin" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-red-600 font-medium">
              Админ
            </Link>
          )}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2">
            {session ? (
              <>
                <Link href="/ideas/new" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-blue-600 font-medium">
                  + Новая идея
                </Link>
                <Link href="/profile" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-700 dark:text-gray-300">
                  {user?.name} — Профиль
                </Link>
                <button onClick={() => { signOut({ callbackUrl: "/" }); setMenuOpen(false); }} className="block w-full text-left py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  Выйти
                </button>
              </>
            ) : (
              <Link href="/login" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-blue-600 font-medium">
                Войти
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
