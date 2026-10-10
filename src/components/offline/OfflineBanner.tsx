"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useOnline } from "@/lib/offline/useOnline";
import { useOutboxAll } from "@/lib/outbox/useOutbox";
import { outboxUid, removeItem, retryItem, type OutboxItem } from "@/lib/outbox/outbox";

function describe(it: OutboxItem): string {
  const p = (it.preview || {}) as { text?: string; label?: string };
  if (it.kind === "idea_vote" || it.kind === "comment_reaction") return p.label || (p.text ?? "👍");
  return (p.text || "").slice(0, 60) || "…";
}

/**
 * Slim bar under the header: «Нет сети — показаны сохранённые данные» only while offline, «Ожидают отправки: N» while the queue has items
 * (online too, until it is flushed), «Не отправлено: N» with Повторить / Удалить for items the server refused.
 */
export default function OfflineBanner() {
  const { t } = useT();
  const online = useOnline();
  const all = useOutboxAll();
  const [open, setOpen] = useState(false);
  const uid = outboxUid();
  const mine = all.filter((i) => i.uid === uid);
  const pending = mine.filter((i) => i.status === "queued" || i.status === "retry" || i.status === "sending" || i.status === "auth").length;
  const failed = mine.filter((i) => i.status === "failed");
  if (online && pending === 0 && failed.length === 0) return null;

  return (
    <div data-offline-banner className="shrink-0 w-full text-[12px] leading-tight">
      {!online && (
        <div role="status" className="px-3 py-1 text-center font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          {t("offline.banner")}
        </div>
      )}
      {(pending > 0 || failed.length > 0) && (
        <div className="px-3 py-1 flex items-center justify-center gap-3 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
          {pending > 0 && <span data-outbox-pending>{"\u{1F551}"} {t("offline.pending", { n: pending })}</span>}
          {failed.length > 0 && (
            <button type="button" className="font-semibold text-red-600 dark:text-red-400 underline" onClick={() => setOpen((v) => !v)}>
              {t("offline.failed", { n: failed.length })}
            </button>
          )}
        </div>
      )}
      {open && failed.length > 0 && (
        <ul className="px-3 py-1 space-y-1 bg-red-50 dark:bg-red-950/40 text-gray-800 dark:text-gray-100">
          {failed.map((it) => (
            <li key={it.clientId} className="flex items-center gap-2">
              <span className="flex-1 truncate">{describe(it)}</span>
              <button type="button" className="font-semibold text-green-700 dark:text-green-400" onClick={() => void retryItem(it.clientId)}>
                {t("offline.retry")}
              </button>
              <button type="button" className="font-semibold text-red-600 dark:text-red-400" onClick={() => void removeItem(it.clientId)}>
                {t("offline.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
