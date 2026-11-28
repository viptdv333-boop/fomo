import SessionProvider from "@/components/layout/SessionProvider";
import Link from "next/link";
import type { Metadata } from "next";
import { isTerminalSite } from "@/lib/site-mode";
import AdminPullToRefresh from "@/components/admin/AdminPullToRefresh";
import AdminBadge from "@/components/admin/AdminBadge";

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
      <div className="min-h-screen flex flex-col md:flex-row">
        <aside className="w-full shrink-0 bg-gray-900 text-white p-3 md:w-64 md:min-h-screen md:p-6">
          <Link href="/admin" className="text-lg md:text-xl font-bold text-green-400 block mb-2 md:mb-8">
            {TERMINAL ? "FOMO Terminal Admin" : "FOMO Admin"}
          </Link>
          <nav className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-2 md:overflow-visible md:pb-0" aria-label="Разделы панели управления">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm md:text-base text-gray-300 hover:bg-gray-800 hover:text-white transition md:whitespace-normal"
              >
                {link.label}
                {link.href === "/admin/reports" && <AdminBadge kind="reports" />}
                {link.href === "/admin/users" && <AdminBadge kind="users" />}
              </Link>
            ))}
          </nav>
          <div className="mt-2 pt-2 border-t border-gray-700 md:mt-8 md:pt-4">
            <Link
              href={TERMINAL ? "/terminal" : "/feed"}
              className="block px-3 py-2 text-gray-400 hover:text-white text-xs md:text-sm"
            >
              ← Вернуться на сайт
            </Link>
          </div>
        </aside>
        <AdminPullToRefresh>
          <main className="min-w-0 w-full flex-1 bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 md:p-8">{children}</main>
        </AdminPullToRefresh>
      </div>
    </SessionProvider>
  );
}
