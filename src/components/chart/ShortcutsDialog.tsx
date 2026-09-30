"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";
import ModalPortal from "./ModalPortal";
import { CS_ICONS } from "./icons-cs";
import { SHORTCUTS, SHORTCUT_GROUPS } from "@/lib/chart/shortcuts";

export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  // groups that other modules use but SHORTCUT_GROUPS does not list still show up, after the known ones
  const known = new Set<string>(SHORTCUT_GROUPS.map((g) => g.id));
  const extra = [...new Set(SHORTCUTS.map((s) => s.group as string))].filter((g) => !known.has(g));
  const groups = [...SHORTCUT_GROUPS.map((g) => ({ id: g.id as string, title: t(g.key) })), ...extra.map((g) => ({ id: g, title: g }))];

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[70] flex items-stretch sm:items-center justify-center bg-black/50 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("shortcuts.title")} className="flex flex-col w-full sm:w-[640px] sm:max-w-full h-full sm:h-auto sm:max-h-[85vh] sm:rounded-xl overflow-hidden bg-white dark:bg-[#1e222d] border border-gray-200 dark:border-[#2a2e39] shadow-2xl text-gray-900 dark:text-gray-100">
        <div className="flex items-center justify-between h-12 px-4 shrink-0 border-b border-gray-200 dark:border-[#2a2e39]">
          <h2 className="text-base font-semibold">{t("shortcuts.title")}</h2>
          <button onClick={onClose} aria-label={t("shell.close")} className="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer">
            {CS_ICONS.close}
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {groups.map((g) => {
            const items = SHORTCUTS.filter((s) => s.group === g.id);
            if (items.length === 0) return null;
            return (
              <div key={g.id} className="mb-3 break-inside-avoid">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{g.title}</div>
                {items.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 min-h-8 py-0.5">
                    <span className="text-[13px] text-gray-800 dark:text-gray-200">{t(s.text)}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="min-w-6 h-6 px-1.5 inline-flex items-center justify-center rounded border border-gray-300 dark:border-[#363a45] bg-gray-50 dark:bg-[#131722] text-[11px] font-medium text-gray-700 dark:text-gray-300"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-200 dark:border-[#2a2e39]">{t("shortcuts.hint")}</div>
      </div>
    </div>
    </ModalPortal>
  );
}
