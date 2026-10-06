import SessionProvider from "@/components/layout/SessionProvider";
import Link from "next/link";
import type { Metadata } from "next";
import { isTerminalSite } from "@/lib/site-mode";

const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/ideas", label: "Идеи" },
  { href: "/admin/categories", label: "Категории" },
  { href: "/admin/instruments", label: "Инструменты" },
  { href: "/admin/chat", label: "Болталка" },
  { href: "/admin/reports", label: "Жалобы" },
  { href: "/admin/broadcast", label: "Рассылка" },
  { href: "/admin/rating", label: "Рейтинг" },
  { href: "/admin/languages", label: "Языки" },
  { href: "/admin/site-settings", label: "Настройки сайта" },
];

// terminal.fomo.spot: the instance owner manages users, mailing and site settings; the social sections do not exist there
const TERMINAL_ADMIN_HREFS = ["/admin", "/admin/users", "/admin/broadcast", "/admin/site-settings"];
const TERMINAL = isTerminalSite();
const links = TERMINAL ? adminLinks.filter((l) => TERMINAL_ADMIN_HREFS.includes(l.href)) : adminLinks;

// terminal.fomo.spot: the owner's admin is not for search (noindex; the main site's admin is only disallowed in robots.txt, unchanged)
export function generateMetadata(): Metadata {
  return TERMINAL ? { robots: { index: false, follow: false } } : {};
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="min-h-screen flex">
        <aside className="w-64 bg-gray-900 text-white p-6">
          <Link href="/admin" className="text-xl font-bold text-green-400 block mb-8">
            {TERMINAL ? "FOMO Terminal Admin" : "FOMO Admin"}
          </Link>
          <nav className="space-y-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 pt-4 border-t border-gray-700">
            <Link
              href={TERMINAL ? "/terminal" : "/feed"}
              className="block px-3 py-2 text-gray-400 hover:text-white text-sm"
            >
              ← Вернуться на сайт
            </Link>
          </div>
        </aside>
        <main className="flex-1 bg-gray-50 dark:bg-gray-900 p-8">{children}</main>
      </div>
    </SessionProvider>
  );
}
