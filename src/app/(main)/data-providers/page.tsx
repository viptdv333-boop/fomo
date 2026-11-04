"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { DATA_PROVIDERS, type DataMarket, type DataProvider } from "@/lib/data/providers";

interface Conn {
  provider: string;
  keyHint: string;
  enabled: boolean;
  status: string;
}

// only what needs a key: the public sources (Binance) work by default and are not listed here
const KEYED = DATA_PROVIDERS.filter((p) => p.needsKey);
const MARKETS: DataMarket[] = (["moex", "us", "world", "crypto"] as DataMarket[]).filter((m) => KEYED.some((p) => p.market === m));

function ProviderCard({ p, conn, onChanged }: { p: DataProvider; conn: Conn | undefined; onChanged: () => void }) {
  const { t } = useT();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sure, setSure] = useState(false);
  const [editing, setEditing] = useState(false);
  const connected = p.needsKey ? !!conn : true;

  async function save() {
    if (!key.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/data/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p.id, key }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setKey("");
        setEditing(false);
        setMsg({ ok: true, text: t("dp.saved") });
        onChanged();
      } else {
        const k = `dp.err.${d?.error}`;
        const text = t(k);
        setMsg({ ok: false, text: text === k ? t("dp.err.generic") : text });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!sure) return setSure(true);
    setBusy(true);
    try {
      await fetch(`/api/data/connections?provider=${p.id}`, { method: "DELETE" });
      setSure(false);
      setMsg(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{p.name}</div>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {p.gives.map((g) => (
              <li key={g} className="rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs text-gray-600 dark:text-gray-300">
                {t(g)}
              </li>
            ))}
          </ul>
        </div>
        {connected && (
          <span className="shrink-0 rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">{t("dp.connected")}</span>
        )}
      </div>

      {!p.needsKey ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t("dp.noKey")}</p>
      ) : (
        <div className="mt-3">
          {conn && !editing ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                {t("dp.onAccount")} •••• {conn.keyHint}
              </span>
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer">
                {t("dp.replace")}
              </button>
              <button type="button" disabled={busy} onClick={remove} className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer disabled:opacity-50">
                {sure ? t("dp.removeSure") : t("dp.remove")}
              </button>
            </div>
          ) : (
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
          )}
          {p.keyUrl && (
            <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-green-700 dark:text-green-400 hover:underline">
              {t("dp.getKey")} →
            </a>
          )}
          {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}

export default function DataProvidersPage() {
  const { t } = useT();
  const { status } = useSession();
  const [conns, setConns] = useState<Conn[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/data/connections", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setConns(Array.isArray(d?.connections) ? d.connections : []))
      .catch(() => setError(t("dp.err.generic")));
  }, [t]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p className="text-gray-600 dark:text-gray-300">{t("dp.err.unauthorized")}</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700">
          {t("nav.login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("dp.title")}</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t("dp.lead")}</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-6 space-y-7">
        {MARKETS.map((m) => (
          <section key={m}>
            <h2 className="mb-2.5 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t(`dp.market.${m}`)}
              {(m === "us" || m === "world") && <span className="ml-2 font-normal normal-case tracking-normal">{t(`dp.market.${m}.sub`)}</span>}
            </h2>
            <div className="space-y-3">
              {KEYED.filter((p) => p.market === m).map((p) => (
                <ProviderCard key={p.id} p={p} conn={conns.find((c) => c.provider === p.id)} onChanged={load} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
