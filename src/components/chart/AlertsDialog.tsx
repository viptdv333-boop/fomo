"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { alertLevel, type LineSpec } from "@/lib/alerts/evaluate";
import { fmtPrice } from "@/lib/terminal-data";
import { Toggle } from "./tv3-ui";
import type { AlertItem, AlertResult, AlertsApi } from "./useAlerts";

/** What the create form starts from: a price (cursor / last), optionally bound to a drawn line. */
export interface AlertDraft {
  price: number;
  line?: LineSpec;
}

interface Props {
  open: boolean;
  onClose: () => void;
  api: AlertsApi;
  /** Current symbol (display ticker, data source and data ticker). */
  symbol: { ticker: string; name: string; source: string; dataTicker: string };
  /** Opens the form directly with these values; null opens the list. */
  draft: AlertDraft | null;
}

type Condition = AlertItem["condition"];
const CONDITIONS: Condition[] = ["cross", "up", "down"];
const EXPIRY: { id: string; days: number }[] = [
  { id: "none", days: 0 },
  { id: "1d", days: 1 },
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
];

const inputCls =
  "w-full rounded-[9px] border border-[var(--tv3-fill2)] bg-[var(--tv3-card)] px-2 py-1.5 text-sm text-[var(--tv3-text)] outline-none focus:border-[var(--tv3-accent)] focus:ring-1 focus:ring-[var(--tv3-accent)]";
const smallBtn =
  "rounded-lg px-2 py-1 text-xs text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]";
const primaryBtn =
  "rounded-lg bg-[var(--tv3-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--tv3-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)] disabled:opacity-50";

const STATUS_DOT: Record<AlertItem["status"], string> = {
  active: "bg-amber-500",
  triggered: "bg-[var(--tv3-accent)]",
  paused: "bg-gray-400",
  expired: "bg-[var(--tv3-fill2)]",
};

export default function AlertsDialog({ open, onClose, api, symbol, draft }: Props) {
  const { t, locale } = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [condition, setCondition] = useState<Condition>("cross");
  const [priceText, setPriceText] = useState("");
  const [message, setMessage] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [expiry, setExpiry] = useState("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState<LineSpec | null>(null);

  const supported = symbol.source === "moex" || symbol.source === "bybit";
  const { refetch } = api;

  // every opening: fresh data, and either the list or the form prefilled from the draft
  useEffect(() => {
    if (!open) return;
    refetch();
    setError(null);
    setMessage("");
    setRepeat(false);
    setExpiry("none");
    setCondition("cross");
    if (draft) {
      setCreating(true);
      setLine(draft.line ?? null);
      setPriceText(formatInput(draft.price));
    } else {
      setCreating(false);
      setLine(null);
    }
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, [open, draft, refetch]);

  const { here, others } = useMemo(() => {
    const isHere = (a: AlertItem) => a.source === symbol.source && a.dataTicker === symbol.dataTicker;
    const rank: Record<string, number> = { active: 0, paused: 1, triggered: 2, expired: 3 };
    const sorted = [...api.alerts].sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
    return { here: sorted.filter(isHere), others: sorted.filter((a) => !isHere(a)) };
  }, [api.alerts, symbol.source, symbol.dataTicker]);

  if (!open) return null;

  const errText = (r: Extract<AlertResult, { ok: false }>) => (r.error === "limit" ? t("alerts.limit") : t("alerts.error"));

  const startCreate = () => {
    setError(null);
    setLine(null);
    setMessage("");
    setRepeat(false);
    setExpiry("none");
    setCondition("cross");
    setCreating(true);
  };

  const submit = async () => {
    const price = parsePrice(priceText);
    if (!line && price === null) {
      setError(t("alerts.pricePlaceholder"));
      return;
    }
    setBusy(true);
    setError(null);
    const days = EXPIRY.find((e) => e.id === expiry)?.days ?? 0;
    const res = await api.create({
      source: symbol.source,
      ticker: symbol.ticker,
      dataTicker: symbol.dataTicker,
      name: symbol.name,
      kind: line ? "line" : "price",
      condition,
      ...(line ? { line } : { price: price as number }),
      message: message.trim() || undefined,
      repeat,
      expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    });
    setBusy(false);
    if (res.ok) setCreating(false);
    else setError(res.error === "auth" ? t("alerts.signIn") : errText(res));
  };

  const act = async (p: Promise<AlertResult>) => {
    const res = await p;
    setError(res.ok ? null : errText(res));
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      if (creating && !draft && !line) setCreating(false);
      else onClose();
    }
    e.stopPropagation(); // chart shortcuts (Delete, Ctrl+Z ...) must not fire behind the dialog
  };

  const level = line ? alertLevel({ kind: "line", price: null, line }, Date.now()) : null;

  const row = (a: AlertItem) => {
    const lv = alertLevel(a, Date.now());
    const cond = t(`alerts.cond.${a.condition}`);
    const what =
      a.kind === "line"
        ? `${t("alerts.line", { tool: t(`alerts.tool.${a.line?.tool ?? "trend"}`) })}${lv.state === "ok" ? ` (${fmtPrice(lv.level, locale)})` : ""}`
        : fmtPrice(a.price ?? 0, locale);
    const live = a.status === "active" || a.status === "paused";
    return (
      <li key={a.id} className="flex items-start gap-2 px-3 py-2">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[a.status]}`} title={t(`alerts.status.${a.status}`)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-[var(--tv3-text)]">{a.ticker}</span>
            <span className="text-sm text-[var(--tv3-text2)]">
              {cond} {what}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-[var(--tv3-muted)]">
            <span>{t(`alerts.status.${a.status}`)}</span>
            <span>{a.repeat ? t("alerts.repeatShort") : t("alerts.once")}</span>
            {a.expiresAt && <span>{t("alerts.expires", { date: new Date(a.expiresAt).toLocaleDateString(locale === "cn" ? "zh-CN" : locale === "en" ? "en-US" : "ru-RU") })}</span>}
            {a.triggerCount > 0 && <span>{t("alerts.triggeredTimes", { n: a.triggerCount })}</span>}
          </div>
          {a.message && <div className="mt-0.5 truncate text-xs text-[var(--tv3-text2)]">{a.message}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Toggle
            sm
            checked={a.status === "active"}
            label={a.status === "active" ? t("alerts.pause") : t("alerts.resume")}
            onChange={(on) => act(api.update(a.id, { status: on ? "active" : "paused" }))}
            className="mr-1.5"
          />
          <button type="button" className={`${smallBtn} hover:!text-[var(--tv3-down)]`} onClick={() => act(api.remove(a.id))}>
            {t("alerts.delete")}
          </button>
        </div>
        {!live && <span className="sr-only">{t(`alerts.status.${a.status}`)}</span>}
      </li>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("alerts.title")}
        className="flex max-h-[min(640px,92vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--tv3-card)] shadow-[var(--tv3-shadow-pop)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--tv3-hair)] px-3 py-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--tv3-text)]">
            {creating ? `${t("alerts.new")} · ${symbol.ticker}` : t("alerts.title")}
          </h2>
          {!creating && !api.guest && supported && (
            <button type="button" className={primaryBtn} onClick={startCreate}>
              {t("alerts.create")}
            </button>
          )}
          <button type="button" onClick={onClose} className={smallBtn} aria-label={t("shell.close")}>
            {t("shell.close")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {api.guest ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--tv3-text2)]">
              <p>{t("alerts.signIn")}</p>
              <Link href="/login" className="mt-3 inline-block rounded-lg bg-[var(--tv3-accent)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--tv3-accent-hover)]">
                {t("nav.login")}
              </Link>
            </div>
          ) : creating ? (
            <div className="space-y-3 px-4 py-3">
              {!supported && <p className="text-xs text-[var(--tv3-down)]">{t("alerts.unsupported")}</p>}

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-[var(--tv3-text2)]">
                  {t("alerts.condition")}
                  <select className={`${inputCls} mt-1`} value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {t(`alerts.cond.${c}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {line ? (
                  <div className="text-xs text-[var(--tv3-text2)]">
                    <div>{t("alerts.line", { tool: t(`alerts.tool.${line.tool}`) })}</div>
                    {level?.state === "ok" && <div className="mt-1.5 text-sm text-[var(--tv3-text)]">{t("alerts.lineNow", { price: fmtPrice(level.level, locale) })}</div>}
                  </div>
                ) : (
                  <label className="block text-xs text-[var(--tv3-text2)]">
                    {t("alerts.price")}
                    <input
                      className={`${inputCls} mt-1`}
                      inputMode="decimal"
                      value={priceText}
                      placeholder={t("alerts.pricePlaceholder")}
                      onChange={(e) => setPriceText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submit();
                      }}
                      autoFocus
                    />
                  </label>
                )}
              </div>

              <label className="block text-xs text-[var(--tv3-text2)]">
                {t("alerts.message")}
                <input
                  className={`${inputCls} mt-1`}
                  value={message}
                  maxLength={200}
                  placeholder={t("alerts.messagePlaceholder")}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-[var(--tv3-text2)]">
                  {t("alerts.trigger")}
                  <select className={`${inputCls} mt-1`} value={repeat ? "repeat" : "once"} onChange={(e) => setRepeat(e.target.value === "repeat")}>
                    <option value="once">{t("alerts.once")}</option>
                    <option value="repeat">{t("alerts.repeat")}</option>
                  </select>
                </label>
                <label className="block text-xs text-[var(--tv3-text2)]">
                  {t("alerts.expiry")}
                  <select className={`${inputCls} mt-1`} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                    {EXPIRY.map((e) => (
                      <option key={e.id} value={e.id}>
                        {t(`alerts.exp.${e.id}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {error && <p className="text-xs text-[var(--tv3-down)]">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className={smallBtn}
                  onClick={() => {
                    if (draft) onClose();
                    else setCreating(false);
                  }}
                >
                  {t("alerts.cancel")}
                </button>
                <button type="button" className={primaryBtn} disabled={busy || !supported} onClick={submit}>
                  {t("alerts.save")}
                </button>
              </div>
            </div>
          ) : api.loading ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--tv3-muted)]">{t("alerts.loading")}</p>
          ) : api.alerts.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-[var(--tv3-text)]">{t("alerts.empty")}</p>
              <p className="mt-1 text-xs text-[var(--tv3-muted)]">{t("alerts.emptyHint")}</p>
              {!supported && <p className="mt-2 text-xs text-[var(--tv3-down)]">{t("alerts.unsupported")}</p>}
            </div>
          ) : (
            <>
              {here.length > 0 && (
                <>
                  <div className="bg-[var(--tv3-fill3)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">
                    {t("alerts.forSymbol", { ticker: symbol.ticker })}
                  </div>
                  <ul className="divide-y divide-[var(--tv3-hair2)]">{here.map(row)}</ul>
                </>
              )}
              {others.length > 0 && (
                <>
                  <div className="bg-[var(--tv3-fill3)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">
                    {t("alerts.others")}
                  </div>
                  <ul className="divide-y divide-[var(--tv3-hair2)]">{others.map(row)}</ul>
                </>
              )}
            </>
          )}
          {!creating && error && <p className="px-4 py-2 text-xs text-[var(--tv3-down)]">{error}</p>}
        </div>
      </div>
    </div>
  );
}

/** "12,5" and "12.5" both work; anything non-positive or non-numeric is rejected. */
function parsePrice(text: string): number | null {
  const n = Number(text.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatInput(p: number): string {
  if (!Number.isFinite(p)) return "";
  return String(Number(p.toPrecision(8)));
}
