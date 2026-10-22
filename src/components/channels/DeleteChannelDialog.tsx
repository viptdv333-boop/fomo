"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

/**
 * «Удалить канал» for the author (site editor, «Мои каналы», the app's «Каналы и подписки»).
 * 0 active subscribers: a simple confirmation. With subscribers the dialog says what happens (subscriptions end at once, no
 * refund, posts and chat are closed), suggests «Скрыть канал» first (the soft alternative: nothing is lost, current subscribers
 * keep their paid term) and only then offers the permanent deletion, which needs the channel name typed in.
 * The server enforces the same (DELETE /api/users/[id]/tariffs/[tariffId], lib/channel-delete.ts).
 */
export default function DeleteChannelDialog({
  authorId,
  channelId,
  channelName,
  subscribers,
  onClose,
  onDone,
}: {
  authorId: string;
  channelId: string;
  channelName: string;
  /** Known active subscriber count (family), when the caller has it; otherwise the dialog asks the server. */
  subscribers?: number;
  onClose: () => void;
  /** After the channel was deleted or hidden. */
  onDone: (result: "deleted" | "hidden") => void;
}) {
  const { t } = useT();
  const [count, setCount] = useState<number | null>(typeof subscribers === "number" ? subscribers : null);
  const [danger, setDanger] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof subscribers === "number") return;
    let cancelled = false;
    fetch(`/api/users/${authorId}/tariffs?scope=manage`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; subscriberCount?: number }[]) => {
        if (cancelled) return;
        const row = Array.isArray(rows) ? rows.find((x) => x.id === channelId) : null;
        // unknown -> be careful: ask for the full confirmation
        setCount(row ? row.subscriberCount ?? 0 : 1);
      })
      .catch(() => !cancelled && setCount(1));
    return () => {
      cancelled = true;
    };
  }, [authorId, channelId, subscribers]);

  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const nameOk = norm(typed) === norm(channelName);

  async function hide() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${authorId}/tariffs/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || t("chdel.failed"));
      onDone("hidden");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chdel.failed"));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${authorId}/tariffs/${channelId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: typed }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || t("chdel.failed"));
      onDone("deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chdel.failed"));
      setBusy(false);
    }
  }

  const btn = "w-full py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50";
  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      data-testid="delete-channel-dialog"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-3">
        <h2 className="text-lg font-semibold dark:text-gray-100">{t("chdel.title", { name: channelName })}</h2>

        {count === null ? (
          <p className="text-sm text-gray-500">{t("common.loading")}</p>
        ) : count === 0 ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t("chdel.simple")}</p>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="button" disabled={busy} onClick={remove} data-testid="delete-confirm" className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
              {busy ? t("chdel.deleting") : t("chdel.confirm")}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-200 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3" data-testid="delete-warning">
              {t("chdel.warnSubs", { count })}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t("chdel.hideSuggest")}</p>
            <button type="button" disabled={busy} onClick={hide} data-testid="hide-channel" className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
              {t("chdel.hide")}
            </button>

            {!danger ? (
              <button type="button" disabled={busy} onClick={() => setDanger(true)} className={`${btn} border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                {t("chdel.stillDelete")}
              </button>
            ) : (
              <div className="space-y-2 border-t dark:border-gray-800 pt-3">
                <label className="block text-xs text-gray-500 dark:text-gray-400">{t("chdel.typeName", { name: channelName })}</label>
                <input
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  data-testid="delete-name-input"
                  className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100 text-sm"
                />
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button type="button" disabled={busy || !nameOk} onClick={remove} data-testid="delete-confirm" className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
                  {busy ? t("chdel.deleting") : t("chdel.confirmSubs", { count })}
                </button>
              </div>
            )}
          </>
        )}

        <button type="button" disabled={busy} onClick={onClose} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800`}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
