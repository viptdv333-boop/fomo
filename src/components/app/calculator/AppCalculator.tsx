"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { localizedPath, stripLocale, type Locale } from "@/lib/i18n/locale-url";
import { FUTURES_LIST, type FuturesSpec } from "@/lib/moex-futures-spec";
import {
  CALC_MANUAL_KEY,
  CALC_SAVE_KEY,
  CALC_SPEC_KEY,
  EMPTY_MANUAL,
  RISK_PRESETS,
  calcPosition,
  fmtRub,
  intlLocale,
  manualParams,
  mergeStart,
  parseCalcQuery,
  parseManual,
  parseNum,
  parseSaved,
  parseSpecCache,
  resultText,
  takeOnWrongSide,
  tradeSide,
  type ManualSpec,
  type SpecParams,
} from "@/lib/futures-calc";
import AppIcon from "../AppIcon";
import AppSheet, { Sections, type SheetRow, type SheetSection } from "../chat/AppSheet";
import "../chat/app-chat.css";
import "../profile/app-profile.css";
import "./app-calc.css";

// ---------------------------------------------------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------------------------------------------------

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / full storage: the screen works without remembering */
  }
}

/** digits and one kind of decimal separator only: the typed value never contains anything parseNum cannot read */
const cleanNum = (v: string) => v.replace(/[^0-9.,]/g, "");

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* the WebView may refuse the async API: the old way below */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Enter in a field goes to the next field, the last one closes the keyboard */
function nextOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const all = Array.from(document.querySelectorAll<HTMLInputElement>("input.acalc-in"));
  const i = all.indexOf(e.currentTarget);
  const next = all[i + 1];
  if (next) next.focus();
  else e.currentTarget.blur();
}

function Field({ label, value, onChange, hint, aside, last }: { label: string; value: string; onChange: (v: string) => void; hint?: string; aside?: ReactNode; last?: boolean }) {
  return (
    <label className="acalc-f">
      <span className="acalc-lbl">
        <span>{label}</span>
        {aside}
      </span>
      <input
        className="acalc-in"
        type="text"
        inputMode="decimal"
        enterKeyHint={last ? "done" : "next"}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        placeholder={hint ?? "0"}
        onChange={(e) => onChange(cleanNum(e.target.value))}
        onKeyDown={nextOnEnter}
      />
    </label>
  );
}

type SpecState = { spec: FuturesSpec | null; stale: boolean; loading: boolean; error: string | null };

// ---------------------------------------------------------------------------------------------------------------------
// the screen
// ---------------------------------------------------------------------------------------------------------------------

/**
 * «Калькулятор» of the app UI: the position-size / risk calculator of the site (/calculator) as a dock tab (after the terminal; pushed over the terminal from its card:
 * ?ticker=Si&entry=94.2&from=terminal). The math is calcPosition() of src/lib/futures-calc.ts, the very function the site page calls; contract data
 * (tick size, tick value, initial margin, price) comes from /api/futures/spec (MOEX ISS). Offline: the last answer per contract is kept in localStorage,
 * and the three contract numbers can be typed by hand. The inputs are remembered between visits.
 */
export default function AppCalculator() {
  const { t, locale } = useT();
  const router = useRouter();
  const loc = locale as Locale;

  // ----- inputs: the remembered ones, overridden by a visit from the terminal -----
  const [start] = useState(() => {
    const q = parseCalcQuery(typeof window === "undefined" ? "" : window.location.search);
    return { q, saved: mergeStart(parseSaved(lsGet(CALC_SAVE_KEY)), q) };
  });
  const from = start.q.from;
  const [ticker, setTicker] = useState<string | null>(start.saved.ticker);
  const [deposit, setDeposit] = useState(start.saved.deposit);
  const [entry, setEntry] = useState(start.saved.entry);
  const [stop, setStop] = useState(start.saved.stop);
  const [take, setTake] = useState(start.saved.take);
  const [riskPercent, setRiskPercent] = useState(start.saved.riskPercent);
  const [customRisk, setCustomRisk] = useState(() => (RISK_PRESETS.includes(start.saved.riskPercent) ? "" : String(start.saved.riskPercent)));
  const [manual, setManual] = useState<ManualSpec>(() => parseManual(lsGet(CALC_MANUAL_KEY)));
  const [picker, setPicker] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  }, []);
  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  // page chrome: edge to edge; the visit's ?ticker / ?entry are consumed (a reload then shows the remembered inputs), ?from stays for Back
  useEffect(() => {
    document.documentElement.classList.add("app-calc-on");
    document.querySelector("main")?.scrollTo({ top: 0 });
    if (start.q.ticker || start.q.entry) {
      try {
        window.history.replaceState(window.history.state, "", window.location.pathname + (from ? `?from=${from}` : ""));
      } catch {
        /* the address stays as it is */
      }
    }
    return () => document.documentElement.classList.remove("app-calc-on");
  }, [start.q.ticker, start.q.entry, from]);

  useEffect(() => {
    lsSet(CALC_SAVE_KEY, JSON.stringify({ ticker, deposit, entry, stop, take, riskPercent }));
  }, [ticker, deposit, entry, stop, take, riskPercent]);
  useEffect(() => {
    lsSet(CALC_MANUAL_KEY, JSON.stringify(manual));
  }, [manual]);

  // ----- the contract: MOEX when reachable, the last stored answer otherwise -----
  const [sp, setSp] = useState<SpecState>({ spec: null, stale: false, loading: false, error: null });
  const reqId = useRef(0);
  const loadSpec = useCallback(async (tk: string, fillEntry: boolean) => {
    const id = ++reqId.current;
    setSp((s) => ({ ...s, loading: true, error: null }));
    let live: FuturesSpec | null = null;
    let error = "calc.specError";
    try {
      const res = await fetch(`/api/futures/spec?ticker=${encodeURIComponent(tk)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data && typeof data.minStep === "number") live = data as FuturesSpec;
      else if (typeof data?.error === "string") error = data.error;
    } catch {
      /* no network: the stored answer below */
    }
    if (id !== reqId.current) return;
    if (live) {
      const cache = parseSpecCache(lsGet(CALC_SPEC_KEY));
      cache[tk] = live;
      lsSet(CALC_SPEC_KEY, JSON.stringify(cache));
      setSp({ spec: live, stale: false, loading: false, error: null });
      if (fillEntry) setEntry((prev) => (prev.trim() ? prev : String(live!.last ?? live!.offer ?? live!.bid ?? "")));
      return;
    }
    const stored = parseSpecCache(lsGet(CALC_SPEC_KEY))[tk];
    if (stored) setSp({ spec: stored, stale: true, loading: false, error: null });
    else setSp({ spec: null, stale: false, loading: false, error });
  }, []);
  useEffect(() => {
    if (!ticker) {
      reqId.current++;
      setSp({ spec: null, stale: false, loading: false, error: null });
      return;
    }
    void loadSpec(ticker, true);
  }, [ticker, loadSpec]);

  const items = useMemo(
    () =>
      FUTURES_LIST.map((i) => {
        const k = `api.futures.${i.ticker}`;
        const n = t(k);
        return { ...i, name: n === k ? i.name : n };
      }),
    [t],
  );
  const selected = items.find((i) => i.ticker === ticker) ?? null;
  const spec = sp.spec && sp.spec.ticker === ticker ? sp.spec : null;

  // manual numbers: switched on by the user, or forced when MOEX gave nothing for the chosen contract
  const needManual = !!ticker && !spec && !sp.loading && !!sp.error;
  const useManual = manual.on || needManual;
  const params: SpecParams | null = useManual ? manualParams(manual) : spec;

  const inputs = useMemo(() => ({ deposit, entry, stop, take, riskPercent }), [deposit, entry, stop, take, riskPercent]);
  const calc = useMemo(() => (params ? calcPosition(params, inputs) : null), [params, inputs]);
  const side = tradeSide(entry, stop);
  const sideLabel = side ? t(side === "long" ? "appcalc.long" : "appcalc.short") : "";
  const wrongTake = takeOnWrongSide(side, entry, take);
  const manualMissing = useManual && params && (!params.minStep || !params.stepPrice);

  // ----- actions -----
  const reset = () => {
    setDeposit("");
    setEntry("");
    setStop("");
    setTake("");
    setRiskPercent(1);
    setCustomRisk("");
    setTicker(null);
    setManual({ ...manual, on: false });
  };
  const pickRisk = (p: number) => {
    setRiskPercent(p);
    setCustomRisk("");
  };
  const typeRisk = (v: string) => {
    const c = cleanNum(v);
    setCustomRisk(c);
    const n = parseNum(c);
    if (Number.isFinite(n) && n > 0 && n <= 100) setRiskPercent(n);
  };
  const doCopy = async () => {
    if (!calc || calc.error) return;
    const text = resultText({
      t,
      locale,
      name: selected?.name ?? "",
      contract: useManual ? "" : spec?.secid ?? "",
      inputs,
      calc,
      side,
      sideLabel,
    });
    flash((await copyText(text)) ? t("appcalc.copied") : t("appcalc.copyFailed"));
  };
  const back = () => {
    const fb = (window as unknown as { FomoBack?: () => boolean }).FomoBack;
    if (fb && fb()) return;
    const cur = (stripLocale(window.location.pathname).locale ?? loc) as Locale;
    router.replace(localizedPath(cur, from === "terminal" ? "/terminal" : "/feed"));
  };

  // ----- rows -----
  const dateFmt = (ms: number) => new Date(ms).toLocaleString(intlLocale(locale), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const timeFmt = (ms: number) => new Date(ms).toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });

  const assetSub = spec ? (
    <>
      <span className="acalc-mono">{spec.secid}</span>
      {" · "}
      {t("calc.expiry", { date: new Date(spec.expiry).toLocaleDateString(intlLocale(locale)) })}
      {spec.last != null ? ` · ${t("calc.lastPrice", { price: spec.last })}` : ""}
      {sp.stale ? "" : ` · ${t("appcalc.updated", { time: timeFmt(spec.fetchedAt) })}`}
    </>
  ) : sp.loading ? (
    t("calc.loadingSpec")
  ) : undefined;

  const assetRow: SheetRow = {
    key: "asset",
    label: selected ? selected.name : t("calc.selectFutures"),
    sub: assetSub,
    icon: selected ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={selected.icon} alt="" width={22} height={22} />
    ) : (
      <AppIcon name="calc" size={18} stroke={1.8} />
    ),
    value: selected?.ticker,
    chev: true,
    onClick: () => setPicker(true),
    actions: ticker && !manual.on ? [{ label: t("calc.refresh"), onClick: () => void loadSpec(ticker, false) }] : undefined,
  };
  const manualToggle: SheetRow = {
    key: "manual",
    label: manual.on ? t("appcalc.manualOff") : t("appcalc.manualOn"),
    icon: <AppIcon name="sliders" size={18} stroke={1.8} />,
    toggle: manual.on,
    onClick: () => setManual({ ...manual, on: !manual.on }),
  };
  const manualField = (key: keyof Omit<ManualSpec, "on">, label: string): SheetRow => ({
    key,
    label,
    field: { value: manual[key], ph: "0", inputMode: "decimal", onChange: (v) => setManual({ ...manual, [key]: cleanNum(v) }) },
  });

  const contractSections: SheetSection[] = [
    { key: "asset", title: t("appcalc.contract"), rows: [assetRow, manualToggle] },
  ];
  if (useManual) {
    contractSections.push({
      key: "manual",
      title: t("appcalc.manualTitle"),
      rows: [manualField("minStep", t("appcalc.minStep")), manualField("stepPrice", t("appcalc.stepPrice")), manualField("margin", t("appcalc.margin"))],
    });
  }

  const detail: SheetRow[] = [];
  if (calc && !calc.error) {
    if (calc.contracts > 0) {
      detail.push({ key: "act", label: t("calc.actualRisk"), value: fmtRub(calc.actualRisk, locale) });
      detail.push({ key: "lim", label: t("calc.riskLimit", { pct: riskPercent }), value: fmtRub(calc.riskBudget, locale) });
      detail.push({ key: "per", label: t("appcalc.perContract"), value: fmtRub(calc.riskPerContract, locale) });
      detail.push({ key: "mar", label: t("calc.requiredMargin"), value: fmtRub(calc.requiredMargin, locale), valueColor: calc.marginShort ? "var(--app-red)" : undefined, valueWeight: calc.marginShort ? 600 : undefined });
      if (calc.potentialProfit != null && calc.rr != null) {
        detail.push({ key: "pro", label: t("calc.potentialProfit"), value: fmtRub(calc.potentialProfit, locale), valueColor: "var(--app-green-tx)" });
        detail.push({ key: "rr", label: t("calc.rr"), value: `1 : ${calc.rr.toFixed(2)}` });
      }
    } else {
      detail.push({ key: "per", label: t("appcalc.perContract"), value: fmtRub(calc.riskPerContract, locale) });
      detail.push({ key: "lim", label: t("calc.riskLimit", { pct: riskPercent }), value: fmtRub(calc.riskBudget, locale) });
    }
  }

  // ----- the summary under the bar (pins below it while the form scrolls) -----
  const hint = !params ? t(ticker && sp.loading ? "calc.loadingSpec" : "calc.selectAssetHint") : manualMissing ? t("appcalc.manualHint") : calc?.error ? t(calc.error) : null;
  const ready = !!calc && !calc.error && !manualMissing;
  const statusNote = sp.stale && spec && !useManual ? t("appcalc.savedFrom", { time: dateFmt(spec.fetchedAt) }) : sp.error && !useManual ? t(sp.error) : "";

  return (
    <div className="ac ap acalc">
      <div className="ac-nav">
        {from === "terminal" ? (
          <button type="button" className="ac-back" onClick={back} aria-label={t("common.back")}>
            <AppIcon name="chevL" size={22} stroke={1.8} />
            <span>{t("nav.terminal")}</span>
          </button>
        ) : (
          <span /> /* a dock tab of its own: no Back chevron (only the terminal's card pushes it over the terminal) */
        )}
        <div className="ac-navtitle" />
        <div className="ap-navright">
          <button type="button" className="ap-navbtn" onClick={reset}>
            {t("appcalc.reset")}
          </button>
        </div>
      </div>

      <div className="ac-page acalc-page">
        <h1 className="ac-large">{t("nav.calculator")}</h1>
        <div className="ac-intro">{t("appcalc.intro")}</div>

        <div className="acalc-stick">
          <div className="acalc-sum" data-state={ready ? (calc!.contracts > 0 ? "ok" : "zero") : "idle"} aria-live="polite">
            <div className="acalc-sum-l">
              <div className="acalc-sum-k">{t("appcalc.contractsShort")}</div>
              <div className="acalc-sum-n">{ready ? calc!.contracts : "—"}</div>
            </div>
            <div className="acalc-sum-r">
              {ready && calc!.contracts > 0 ? (
                <>
                  <div>
                    <span>{t("calc.actualRisk")}</span>
                    <b>{fmtRub(calc!.actualRisk, locale)}</b>
                  </div>
                  <div>
                    <span>{t("calc.requiredMargin")}</span>
                    <b data-bad={calc!.marginShort ? "1" : undefined}>{fmtRub(calc!.requiredMargin, locale)}</b>
                  </div>
                  {calc!.rr != null && (
                    <div>
                      <span>R:R</span>
                      <b>1 : {calc!.rr.toFixed(2)}</b>
                    </div>
                  )}
                </>
              ) : ready ? (
                <div className="acalc-sum-msg">{t("calc.tooRisky", { perContract: fmtRub(calc!.riskPerContract, locale), budget: fmtRub(calc!.riskBudget, locale) })}</div>
              ) : (
                <div className="acalc-sum-msg" data-idle="1">
                  {hint}
                </div>
              )}
            </div>
          </div>
        </div>

        <Sections sections={contractSections} />
        {statusNote ? (
          <div className="acalc-note" data-err={sp.error && !sp.stale ? "1" : undefined}>
            {statusNote}
          </div>
        ) : null}

        <div className="ac-sec">
          <div className="acalc-title">
            <div className="ac-sectitle">{t("appcalc.trade")}</div>
            {side && (
              <span className="acalc-pill" data-side={side}>
                {side === "long" ? "▲ " : "▼ "}
                {sideLabel}
              </span>
            )}
          </div>
          <div className="acalc-card">
            <Field label={t("calc.deposit")} value={deposit} onChange={setDeposit} hint={t("calc.depositPlaceholder")} />
            <div className="acalc-two">
              <Field
                label={t("calc.entry")}
                value={entry}
                onChange={setEntry}
                aside={
                  spec && spec.last != null && !sp.stale ? (
                    <button type="button" className="acalc-mkt" onClick={() => setEntry(String(spec.last))}>
                      {spec.last}
                    </button>
                  ) : null
                }
              />
              <Field label={t("calc.stop")} value={stop} onChange={setStop} />
            </div>
            <Field label={t("calc.take")} value={take} onChange={setTake} last />
            {wrongTake && <div className="acalc-warn">{t("appcalc.takeSide", { side: sideLabel.toLowerCase() })}</div>}
          </div>
        </div>

        <div className="ac-sec">
          <div className="ac-sectitle">{t("calc.riskPerTrade")}</div>
          <div className="acalc-card">
            <div className="acalc-chips" role="group" aria-label={t("calc.riskPerTrade")}>
              {RISK_PRESETS.map((p) => (
                <button key={p} type="button" className="ap-chip acalc-chip" data-on={riskPercent === p && !customRisk ? "1" : undefined} aria-pressed={riskPercent === p && !customRisk} onClick={() => pickRisk(p)}>
                  {p}%
                </button>
              ))}
              <input
                className="acalc-risk"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={customRisk}
                placeholder={t("appcalc.customRisk")}
                aria-label={t("appcalc.customRisk")}
                data-on={customRisk ? "1" : undefined}
                onChange={(e) => typeRisk(e.target.value)}
              />
            </div>
          </div>
        </div>

        {detail.length > 0 && (
          <div className="ac-sec">
            <div className="ac-sectitle">{t("appcalc.result")}</div>
            <div className="ac-secbox">
              {detail.map((r) => (
                <div key={r.key} className="ac-sr">
                  <div className="ac-sr-body">
                    <div className="ac-sr-txt">
                      <div className="ac-sr-label">{r.label}</div>
                    </div>
                    <div className="ac-sr-val" style={{ color: r.valueColor, fontWeight: r.valueWeight }}>
                      {r.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {calc?.marginShort && <div className="ac-secfoot" style={{ color: "var(--app-red)" }}>{t("calc.marginShort")}</div>}
          </div>
        )}

        <button type="button" className="ap-primary" disabled={!ready} onClick={() => void doCopy()}>
          {t("appcalc.copy")}
        </button>
        <div className="ap-note acalc-disc">{t("calc.disclaimer")}</div>
      </div>

      {picker && (
        <PickerSheet
          title={t("appcalc.pick")}
          items={items}
          value={ticker}
          searchPh={t("calc.searchPlaceholder")}
          emptyLabel={t("calc.nothingFound")}
          doneLabel={t("appui.chat.done")}
          onPick={(tk) => {
            if (tk !== ticker) {
              // a new contract: the entry / stop / take of the old one do not apply to its price
              setEntry("");
              setStop("");
              setTake("");
              setTicker(tk);
            }
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}

      {toast && (
        <div className="ac ac-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

/** The instrument list with a search field (the site's AssetPicker as the design's bottom sheet). */
function PickerSheet({
  title,
  items,
  value,
  searchPh,
  emptyLabel,
  doneLabel,
  onPick,
  onClose,
}: {
  title: string;
  items: { ticker: string; name: string; icon: string }[];
  value: string | null;
  searchPh: string;
  emptyLabel: string;
  doneLabel: string;
  onPick: (ticker: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const rows: SheetRow[] = items
    .filter((i) => !query || i.name.toLowerCase().includes(query) || i.ticker.toLowerCase().includes(query))
    .map((i) => ({
      key: i.ticker,
      label: i.name,
      icon: (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={i.icon} alt="" width={22} height={22} />
      ),
      value: i.ticker,
      check: i.ticker === value,
      onClick: () => onPick(i.ticker),
    }));
  return (
    <AppSheet
      title={title}
      onClose={onClose}
      doneLabel={doneLabel}
      height="full"
      search={{ value: q, ph: searchPh, onChange: setQ }}
      sections={[{ key: "list", rows }]}
    >
      {rows.length === 0 && <div className="ap-loading">{emptyLabel}</div>}
    </AppSheet>
  );
}
