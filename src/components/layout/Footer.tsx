import Link from "next/link";

export default function Footer() {
  return (
    <footer className="h-12 flex items-center px-4 bg-white dark:bg-gray-900 shrink-0 gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="w-[60px] h-[28px] overflow-hidden relative shrink-0">
        <img src="/logo-fomo.png" alt="FOMO" className="absolute w-full" style={{ top: '-18%' }} />
      </div>
      <div className="flex-1 flex items-center justify-center gap-4 text-xs text-gray-400 dark:text-gray-600">
        <span>Copyright © Neurotrader 2026</span>
        <Link href="/help" className="hover:text-gray-600 dark:hover:text-gray-400 transition hidden sm:inline">
          Как пользоваться
        </Link>
        <Link href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-400 transition hidden sm:inline">
          Конфиденциальность
        </Link>
        <Link href="/terms" className="hover:text-gray-600 dark:hover:text-gray-400 transition hidden sm:inline">
          Условия
        </Link>
      </div>
      <div className="w-[60px] shrink-0" />
    </footer>
  );
}
