"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { providerOfSource } from "@/lib/data/provider-catalog";
import { DATA_PROVIDERS, providerById } from "@/lib/data/providers";
import { useConnections } from "@/lib/data/use-connections";
import KeyForm from "@/components/data/KeyForm";

/** Providers whose chart data layer is live. The others show their catalogue and the connect window, and a «connected, data is being enabled» note. */
const DATA_READY: Record<string, boolean> = Object.fromEntries(DATA_PROVIDERS.map((p) => [p.id, p.live]));

/**
 * Instead of a chart: the connect window of the data provider an instrument needs. Instruments served without a key (and providers that are
 * connected and live) render `children`, the chart.
 */
export default function ProviderGate({ source, name, children }: { source: string; name: string; children: ReactNode }) {
  const { t } = useT();
  const { status } = useSession();
  const conns = useConnections();
  const pid = providerOfSource(source);
  if (!pid) return <>{children}</>;
  const connected = conns.on.has(pid);
  if (connected && DATA_READY[pid]) return <>{children}</>;
  const p = providerById(pid) ?? DATA_PROVIDERS[0];

  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t("pg.needs", { name: p.name })}</div>
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {p.gives.map((g) => (
            <li key={g} className="rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs text-gray-600 dark:text-gray-300">
              {t(g)}
            </li>
          ))}
        </ul>

        <div className="mt-4">
          {status === "unauthenticated" ? (
            <Link href="/login" className="inline-block rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              {t("dp.err.unauthorized")}
            </Link>
          ) : connected ? (
            <p className="text-sm text-green-700 dark:text-green-400">{t("pg.connected", { name: p.name })}</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">{t("pg.paste")}</p>
              <KeyForm provider={pid} keyUrl={p.keyUrl} />
            </>
          )}
        </div>
        <Link href="/data-providers" className="mt-4 inline-block text-sm text-gray-500 dark:text-gray-400 hover:underline">
          {t("pg.all")} →
        </Link>
      </div>
    </div>
  );
}
