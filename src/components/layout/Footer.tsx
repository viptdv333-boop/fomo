export default function Footer() {
  return (
    <footer className="h-12 flex items-center px-4 bg-white dark:bg-gray-900 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="w-[60px] h-[28px] overflow-hidden relative shrink-0">
        <img src="/logo-fomo.png" alt="FOMO" className="absolute w-full" style={{ top: '-18%' }} />
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-600 flex-1 text-center">Copyright © Neurotrader 2026</span>
      <div className="w-[60px] shrink-0" />
    </footer>
  );
}
