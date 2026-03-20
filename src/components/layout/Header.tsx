"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import LanguageSelector from "./LanguageSelector";

export default function Header() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const avatarUrl = user?.image || null;
  const fomoId = user?.fomoId || null;

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-20 flex items-center">
        {/* Logo */}
        <Link href="/" className="flex flex-col items-start shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fomo.png" alt="FOMO" className="h-14 sm:h-16 w-auto" />
          <span className="text-[7px] sm:text-[8px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.15em] font-medium leading-none -mt-0.5">Find Opportunities, Make Outcomes</span>
        </Link>

        {/* Desktop nav — centered */}
        <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
          {[
            { href: "/feed", label: "Доска" },
            { href: "/terminal", label: "Терминал" },
            { href: "/channels", label: "Каналы" },
            { href: "/authors", label: "Авторы" },
            { href: "/chat", label: "Болталка" },
            { href: "/messages", label: "Сообщения" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition ${
                isActive(link.href)
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop right section */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <LanguageSelector />
          <ThemeToggle />
          {session && <NotificationBell />}
          {session ? (
            <>
              {/* Profile dropdown */}
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-xs overflow-hidden">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      user?.name?.[0] || "?"
                    )}
                  </div>
                  <span>Профиль</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-full mt-1 w-60 bg-white dark:bg-gray-800 rounded-xl shadow-lg border dark:border-gray-700 py-2 z-50">
                    {/* User info */}
                    <div className="px-4 py-3 border-b dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-sm overflow-hidden shrink-0">
                          {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            user?.name?.[0] || "?"
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{fomoId ? `#${fomoId}` : user?.email}</div>
                        </div>
                      </div>
                    </div>

                    {/* Menu items — each goes to a DIFFERENT page/action */}
                    <Link href="/ideas/new" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                      Создать идею
                    </Link>
                    <Link href="/subscriptions" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                      Каналы и подписки
                    </Link>
                    <Link href="/profile" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      Редактировать профиль
                    </Link>
                    <Link href="/payments" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      Финансы
                    </Link>

                    <div className="border-t dark:border-gray-700 mt-1 pt-1">
                      <button
                        onClick={() => { signOut({ callbackUrl: "/" }); setProfileOpen(false); }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                        Выйти
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Admin — rightmost */}
              {user?.role === "ADMIN" && (
                <Link href="/admin" className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium px-2 py-1 rounded border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                  Панель
                </Link>
              )}
            </>
          ) : (
            <Link href="/login" className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 transition">
              Войти
            </Link>
          )}
        </div>

        {/* Mobile right section */}
        <div className="flex md:hidden items-center gap-2 ml-auto">
          <ThemeToggle />
          {session && <NotificationBell />}
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 space-y-1">
          {session && (
            <div className="flex items-center gap-3 py-2 mb-2 border-b dark:border-gray-800 pb-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-sm overflow-hidden">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  user?.name?.[0] || "?"
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{fomoId ? `#${fomoId}` : user?.email}</div>
              </div>
            </div>
          )}
          {[
            { href: "/feed", label: "Доска" },
            { href: "/terminal", label: "Терминал" },
            { href: "/channels", label: "Каналы" },
            { href: "/authors", label: "Авторы" },
            { href: "/chat", label: "Болталка" },
            { href: "/messages", label: "Сообщения" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`block py-2 text-sm ${
                isActive(link.href)
                  ? "text-green-600 dark:text-green-400 font-medium"
                  : "text-gray-700 dark:text-gray-300 hover:text-green-600"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {session && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2 space-y-1">
              <Link href="/ideas/new" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-700 dark:text-gray-300">+ Создать идею</Link>
              <Link href="/subscriptions" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-700 dark:text-gray-300">Каналы и подписки</Link>
              <Link href="/profile" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-700 dark:text-gray-300">Редактировать профиль</Link>
              <Link href="/payments" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-gray-700 dark:text-gray-300">Финансы</Link>
              {user?.role === "ADMIN" && (
                <Link href="/admin" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-red-600 font-medium">Панель управления</Link>
              )}
              <button onClick={() => { signOut({ callbackUrl: "/" }); setMenuOpen(false); }} className="block w-full text-left py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">Выйти</button>
            </div>
          )}
          {!session && (
            <Link href="/login" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-green-600 font-medium">Войти</Link>
          )}
        </div>
      )}
    </header>
  );
}
