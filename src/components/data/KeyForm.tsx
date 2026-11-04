"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { refreshConnections } from "@/lib/data/use-connections";

/** The key field of a data provider: paste, «Check and save» (the server checks it with the provider and stores it encrypted). */
export default function KeyForm({ provider, keyUrl, onSaved }: { provider: string; keyUrl?: string; onSaved?: () => void }) {
  const { t } = useT();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!key.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/data/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, key }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setKey("");
        await refreshConnections();
        onSaved?.();
      } else {
        const k = `dp.err.${d?.error}`;
        const text = t(k);
        setErr(text === k ? t("dp.err.generic") : text);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t("dp.keyPh")}
          className="min-w-0 flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-green-500"
        />
        <button type="submit" disabled={busy || !key.trim()} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 cursor-pointer disabled:opacity-50">
          {t("dp.save")}
        </button>
      </form>
      {keyUrl && (
        <a href={keyUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-green-700 dark:text-green-400 hover:underline">
          {t("dp.getKey")} →
        </a>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}
