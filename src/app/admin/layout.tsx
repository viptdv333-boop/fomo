import SessionProvider from "@/components/layout/SessionProvider";
import Link from "next/link";

const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/ideas", label: "Идеи" },
  { href: "/admin/categories", label: "Категории" },
  { href: "/admin/instruments", label: "Инструменты" },
  { href: "/admin/rating", label: "Рейтинг" },
  { href: "/admin/languages", label: "Языки" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="min-h-screen flex">
        <aside className="w-64 bg-gray-900 text-white p-6">
          <Link href="/admin" className="text-xl font-bold text-blue-400 block mb-8">
            FOMO Admin
          </Link>
          <nav className="space-y-2">
            {adminLinks.map((link) => (
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
              href="/feed"
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
