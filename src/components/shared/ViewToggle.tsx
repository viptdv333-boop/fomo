"use client";

import { useT } from "@/lib/i18n/client";

export type ViewKind = "list" | "cards";

/** The two views of every wall / channel / catalogue: a list (the default everywhere) and a grid of cards. */
export default function ViewToggle({ mode, onChange }: { mode: ViewKind; onChange: (m: ViewKind) => void }) {
  const { t } = useT();
  const cls = (on: boolean) => `p-1.5 rounded transition ${on ? "text-gray-900 dark:text-gray-100" : "text-gray-300 dark:text-gray-600 hover:text-gray-500"}`;
  return (
    <div className="app-views flex items-center gap-0.5 shrink-0">
      <button type="button" data-on={mode === "list" ? "1" : undefined} onClick={() => onChange("list")} className={cls(mode === "list")} title={t("feed2.viewList")} aria-pressed={mode === "list"}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
      </button>
      <button type="button" data-on={mode === "cards" ? "1" : undefined} onClick={() => onChange("cards")} className={cls(mode === "cards")} title={t("feed2.viewCards")} aria-pressed={mode === "cards"}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      </button>
    </div>
  );
}
