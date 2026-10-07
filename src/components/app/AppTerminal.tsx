"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale-url";
import DemoGate from "@/components/shared/DemoGate";
import { isTerminalSite } from "@/lib/site-mode";
import { FOMO_COMMUNITY_URL } from "@/lib/fomo-ideas";
import { localZone } from "@/lib/chart/settings";
import CalendarPanel from "@/components/chart/calendar/CalendarPanel";
import { useFomoIdeas } from "@/components/chart/FomoPanel";
import { useBatchQuotes, useWatchlist, type Quote } from "@/components/chart/RightPanel";
import type { AppChartHandle, AppChartState } from "@/components/chart/app-bridge";
import type { RangeId } from "@/components/chart/BottomBar";
import { formatInterval } from "@/lib/chart/intervals";
import { exchangeLabel, fmtPrice, instName, priceDigits, type TerminalInstrument } from "@/lib/terminal-data";
import {
  APP_TERM_RANGES,
  APP_TERM_TFS,
  NO_VALUE,
  changeTone,
  ideasHref,
  ideasTotal,
  pctLabel,
  pickBoardInstrument,
  showDelayNote,
} from "@/lib/app-terminal";
import { useDemoGate } from "@/lib/useDemoGate";
import { canSetNativeImmersive, isNativeApp, onNativeImmersiveReset, setNativeImmersive } from "@/lib/native-app";
import { collapseOnPop, fsPushState, fullscreenPlan, isFsHistoryState } from "@/lib/app-fullscreen";
import { raisesKeyboard } from "@/lib/app-ui";
import AppIcon from "./AppIcon";
import "./fullscreen.css";

// MultiChart wraps the chart(s); here it is one chart whose toolbar / bottom bar / phone nav are replaced by the page's own (appPage)
const Chart = dynamic(() => import("@/components/chart/MultiChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[var(--tv3-canvas)] animate-pulse" />,
});

const qKey = (i: { source: string; dataTicker: string }) => `${i.source}:${i.dataTicker}`;

// terminal.fomo.spot has no board of its own: no requests to /api/instruments or /api/ideas of this instance. Its «Идеи FOMO по …» card
// reads fomo.spot through /api/fomo-ideas (useFomoIdeas), the calendar is a segment next to the watchlist, and a «сообщество FOMO» card follows.
const TERMINAL_SITE = isTerminalSite();
const TZ_LS = "fomo-calendar-tz";

/** Ideas of the board for a terminal symbol: the board's instrument id and the number of ideas (cached for the session). */
interface IdeasInfo {
  id: string | null;
  n: number | null;
}
const ideasCache = new Map<string, IdeasInfo>();

async function loadIdeasInfo(inst: TerminalInstrument): Promise<IdeasInfo> {
  const key = qKey(inst);
  const hit = ideasCache.get(key);
  if (hit) return hit;
  let id: string | null = null;
  let answered = false; // the board's instrument search gave an answer (a database outage must not read as "0 ideas")
  for (const q of [...new Set([inst.ticker, inst.dataTicker])]) {
    try {
      const r = await fetch(`/api/instruments?search=${encodeURIComponent(q)}`);
      if (!r.ok) continue;
      answered = true;
      const found = pickBoardInstrument<{ id: string; ticker?: string | null }>(await r.json(), q);
      if (found) {
        id = found.id;
        break;
      }
    } catch {
      /* try the next spelling */
    }
  }
  let n: number | null = id ? null : answered ? 0 : null;
  if (id) {
    try {
      const r = await fetch(`/api/ideas?instrumentId=${encodeURIComponent(id)}&limit=1`);
      if (r.ok) n = ideasTotal(await r.json());
    } catch {
      /* the count stays unknown */
    }
  }
  const info = { id, n };
  if (n !== null) ideasCache.set(key, info); // an unknown count is asked again next time
  return info;
}

function priceText(q: Quote | undefined, inst: { source: string; dataTicker: string }, locale: string): string {
  return q && Number.isFinite(q.price) ? fmtPrice(q.price, locale, priceDigits(inst)) : NO_VALUE;
}

/** Expand / collapse glyphs (four corner brackets pointing out / in), 24-grid line icons like AppIcon. */
function FsGlyph({ on }: { on: boolean }) {
  const d = on
    ? ["M8 3v3a2 2 0 0 1-2 2H3", "M21 8h-3a2 2 0 0 1-2-2V3", "M3 16h3a2 2 0 0 1 2 2v3", "M16 21v-3a2 2 0 0 1 2-2h3"]
    : ["M8 3H5a2 2 0 0 0-2 2v3", "M21 8V5a2 2 0 0 0-2-2h-3", "M3 16v3a2 2 0 0 0 2 2h3", "M16 21h3a2 2 0 0 0 2-2v-3"];
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}

/**
 * The Terminal tab of the app-only UI (html.app-ui): a normal scrolling page like the design: sticky symbol bar, timeframe chips,
 * the chart, range row, tool row, «Идеи FOMO по …», the watchlist and the disclaimer. The icon over the chart takes the chart to
 * full screen (like TradingView): the chart block becomes a fixed layer over everything (dock, header, system bars in the app) in
 * the orientation the device is in, with the chart's own toolbar. It is the SAME chart instance (the block only changes its CSS and
 * `appFull`), so indicators, drawings and the loaded bars survive the toggle. The symbol state lives in the terminal page
 * (`selected`), so the last-opened-symbol persistence and the account sync keep working.
 */
export default function AppTerminal({ selected, onSelectSymbol }: { selected: TerminalInstrument | null; onSelectSymbol: (inst: TerminalInstrument) => void }) {
  const { t, locale } = useT();
  const { status } = useSession();
  const guest = status === "unauthenticated";
  const handle = useRef<AppChartHandle | null>(null);
  const [chart, setChart] = useState<AppChartState | null>(null);
  const [range, setRange] = useState<RangeId | null>(null);
  const [expanded, setExpanded] = useState(false);
  const scrollTop = useRef(0);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const pushed = useRef(false); // our history entry is on the stack (the system Back closes the full screen)
  const apiFs = useRef(false); // the browser's Fullscreen API is on for the layer
  const expandedRef = useRef(false);
  expandedRef.current = expanded;
  const { locked } = useDemoGate();
  const watchlist = useWatchlist();

  // the page owns the edge-to-edge layout of <main> while it is shown
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("app-term-on");
    return () => root.classList.remove("app-term-on");
  }, []);

  const inList = !!selected && watchlist.items.some((i) => qKey(i) === qKey(selected));
  const instruments = useMemo(() => (selected && !inList ? [...watchlist.items, selected] : watchlist.items), [watchlist.items, selected, inList]);
  const quotes = useBatchQuotes(instruments, instruments.length > 0 && !expanded);
  const quote = selected ? quotes[qKey(selected)] : undefined;

  // terminal site: «Список наблюдения | Календарь» (the calendar was a page of its own; ?panel=calendar opens it, see closedRouteRedirect)
  const [seg, setSeg] = useState<"watch" | "cal">("watch");
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    if (!TERMINAL_SITE) return;
    try {
      if (new URLSearchParams(window.location.search).get("panel") === "calendar") setSeg("cal");
    } catch {}
    let saved = "";
    try {
      saved = localStorage.getItem(TZ_LS) || "";
    } catch {}
    setZone(saved || localZone());
  }, []);
  const fomoIdeas = useFomoIdeas(TERMINAL_SITE ? selected : null, TERMINAL_SITE);

  const [ideas, setIdeas] = useState<IdeasInfo | null>(null);
  const selKey = selected ? qKey(selected) : "";
  useEffect(() => {
    if (!selected || TERMINAL_SITE) return;
    let cancelled = false;
    setIdeas(null);
    void loadIdeasInfo(selected).then((r) => {
      if (!cancelled) setIdeas(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  const openFs = useCallback(() => {
    scrollTop.current = document.querySelector("main")?.scrollTop ?? 0;
    try {
      window.history.pushState(fsPushState(window.history.state), "");
      pushed.current = true;
    } catch {
      pushed.current = false;
    }
    setExpanded(true);
  }, []);
  const closeFs = useCallback(() => {
    if (!expandedRef.current) return;
    if (pushed.current && isFsHistoryState(window.history.state)) {
      pushed.current = false;
      window.history.back(); // the popstate handler below collapses (the same path as the system Back button)
      return;
    }
    pushed.current = false;
    setExpanded(false);
  }, []);

  // Back button (Android system / browser) pops our entry: collapse
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (collapseOnPop(expandedRef.current, e.state)) {
        pushed.current = false;
        setExpanded(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // the app left immersive mode on its own (it was stopped): the chart goes back to the page
  useEffect(() => onNativeImmersiveReset(closeFs), [closeFs]);

  // a guest whose demo time ran out gets the lock card over the page: do not leave the chart full screen over it
  useEffect(() => {
    if (locked) closeFs();
  }, [locked, closeFs]);

  // while full screen: hide the dock / header, immersive mode in the app, the Fullscreen API in a browser; undone on every exit (also on unmount)
  useLayoutEffect(() => {
    if (!expanded) return;
    const root = document.documentElement;
    root.classList.add("app-term-fs");
    const plan = fullscreenPlan({ native: isNativeApp(), nativeImmersive: canSetNativeImmersive(), apiAvailable: typeof root.requestFullscreen === "function" });
    if (plan.immersive) setNativeImmersive(true);
    if (plan.api) {
      try {
        void layerRef.current?.requestFullscreen().then(
          () => {
            apiFs.current = true;
          },
          () => {
            /* refused (no user gesture, policy): the CSS layer is all there is */
          },
        );
      } catch {
        /* old browser */
      }
    }
    const onFsChange = () => {
      if (!document.fullscreenElement && apiFs.current) {
        apiFs.current = false;
        closeFs(); // the user left the browser's full screen (Esc / gesture)
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    // the desktop window: Esc closes the full-screen layer when the browser's own full screen is not on (it handles Esc itself when it is);
    // not while a dialog is open or a field is focused, they use Esc for themselves
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.fullscreenElement || !root.classList.contains("app-desktop")) return;
      const el = document.activeElement as HTMLElement | null;
      if (raisesKeyboard(el) || el?.tagName === "SELECT" || document.querySelector("[role=dialog]")) return;
      closeFs();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onKey);
      root.classList.remove("app-term-fs");
      if (plan.immersive) setNativeImmersive(false);
      apiFs.current = false;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [expanded, closeFs]);
  useLayoutEffect(() => {
    if (!expanded) document.querySelector("main")?.scrollTo({ top: scrollTop.current });
  }, [expanded]);

  const onAppState = useCallback((s: AppChartState) => setChart(s), []);

  const toggleFav = () => {
    if (!selected) return;
    if (inList) watchlist.remove(selected);
    else watchlist.add(selected);
  };

  // ONE chart element for both modes (same position in the tree): only appPage / appFull and the block's CSS change, so nothing remounts
  const closeBtn = (
    <button type="button" className="app-term-fsclose" onClick={closeFs} aria-label={t("appui.term.collapse")} title={t("appui.term.collapse")}>
      <FsGlyph on />
    </button>
  );
  const body = selected ? (
    <Chart
      ticker={selected.dataTicker}
      source={selected.source}
      name={instName(selected, t)}
      onSelectSymbol={onSelectSymbol}
      appPage={!expanded}
      appFull={expanded}
      appFullLead={closeBtn}
      appHandle={handle}
      onAppState={onAppState}
    />
  ) : null;

  const tone = changeTone(quote?.changePercent);
  const delayed = !!selected && showDelayNote(selected.source, !!chart?.delayed, guest);
  const tfLabel = chart ? formatInterval(chart.interval, t) : "";
  const tool = (key: string, icon: "list" | "pulse" | "pen" | "bell" | "sliders", label: string, run: () => void) => (
    <button key={key} type="button" className="app-term-tool" onClick={run}>
      <AppIcon name={icon} size={22} stroke={1.8} />
      <span>{label}</span>
    </button>
  );
  const h = handle;

  return (
    <DemoGate kind="terminal" path="/terminal" layout="flow">
      <div className="app-term">
        <h1 className="sr-only">{t("term2.heading")}</h1>

        <div className="app-term-bar">
          <button type="button" className="app-term-tick" onClick={() => h.current?.openSearch()} aria-label={t("appui.term.pickTicker")}>
            {selected?.ticker ?? NO_VALUE}
            <AppIcon name="chevD" size={14} stroke={2} />
          </button>
          <div className="app-term-px">
            <div className="app-term-price">{selected ? priceText(quote, selected, locale) : NO_VALUE}</div>
            <div className="app-term-chg" data-tone={tone ?? undefined}>
              {pctLabel(quote?.changePercent, locale)} · {selected ? instName(selected, t) : ""}
            </div>
          </div>
          <button type="button" className="app-term-ico app-term-star" data-on={inList ? "1" : undefined} onClick={toggleFav} aria-pressed={inList} aria-label={t(inList ? "appui.term.unfav" : "appui.term.fav")}>
            {inList ? "★" : "☆"}
          </button>
          <button type="button" className="app-term-ico" onClick={() => h.current?.openAlerts()} aria-label={t("appui.term.alert")}>
            <AppIcon name="bell" size={22} stroke={1.8} />
          </button>
        </div>

        {/* the first screen: sticky symbol bar above; timeframes, chart, range row and tool row fill the whole screen above the dock; the rest is below the fold */}
        <div className="app-term-first">
        <div className="app-term-tfs" role="group" aria-label={t("appui.term.timeframe")}>
          {APP_TERM_TFS.map((id) => (
            <button key={id} type="button" className="app-term-chip" data-on={chart?.interval === id ? "1" : undefined} onClick={() => h.current?.setInterval(id)}>
              {formatInterval(id, t)}
            </button>
          ))}
        </div>

        {/* the slot keeps the page's height while the chart block is a fixed full-screen layer */}
        <div className="app-term-slot">
          <div ref={layerRef} className={`app-term-chart tv3${expanded ? " app-term-fs" : ""}`}>
            {!expanded && (
              <div className="app-term-cap">
                {selected && (
                  <span className="app-term-cap-t">
                    {[selected.ticker, tfLabel, exchangeLabel(selected.source)].filter(Boolean).join(" · ")}
                  </span>
                )}
                {chart?.delayed && <span className="app-term-cap-d">{t("appui.term.delayed")}</span>}
              </div>
            )}
            <div className="app-term-chartbody">{body}</div>
            {!expanded && (
              <button type="button" className="app-term-expand" onClick={openFs} aria-label={t("appui.term.expand")} title={t("appui.term.expand")}>
                <FsGlyph on={false} />
              </button>
            )}
          </div>
        </div>

        <div className="app-term-ranges" role="group" aria-label={t("appui.term.range")}>
          {APP_TERM_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className="app-term-range"
              data-on={range === r ? "1" : undefined}
              onClick={() => {
                setRange(r);
                h.current?.applyRange(r);
              }}
            >
              {t(`shell.range.${r}`)}
            </button>
          ))}
        </div>

        <div className="app-term-tools">
          {tool("watch", "list", t("appui.term.toolWatch"), () => h.current?.openWatchlist())}
          {tool("ind", "pulse", t("appui.term.toolInd"), () => h.current?.openIndicators())}
          {tool("draw", "pen", t("appui.term.toolDraw"), () => h.current?.toggleDrawTools())}
          {tool("alert", "bell", t("appui.term.toolAlert"), () => h.current?.openAlerts())}
          {tool("set", "sliders", t("appui.term.toolSet"), () => h.current?.openSettings())}
        </div>
        </div>

        {!TERMINAL_SITE && selected && (
          <Link href={ideasHref(locale as Locale, ideas?.id ?? null)} prefetch={false} className="app-term-ideas">
            <AppIcon name="bulb" size={18} stroke={1.8} />
            <span className="app-term-ideas-t">{t("appui.term.ideas", { t: selected.ticker })}</span>
            {ideas?.n != null && <span className="app-term-ideas-n">{ideas.n}</span>}
            <AppIcon name="chevR" size={18} stroke={1.8} />
          </Link>
        )}

        {TERMINAL_SITE && selected && fomoIdeas?.ok && (
          <a href={fomoIdeas.boardUrl} target="_blank" rel="noopener" className="app-term-ideas" data-fomo-ideas>
            <AppIcon name="bulb" size={18} stroke={1.8} />
            <span className="app-term-ideas-t">{t("appui.term.ideas", { t: selected.ticker })}</span>
            {fomoIdeas.count > 0 && <span className="app-term-ideas-n">{fomoIdeas.count}</span>}
            <AppIcon name="chevR" size={18} stroke={1.8} />
          </a>
        )}

        {TERMINAL_SITE ? (
          <div className="app-term-seg" role="tablist">
            <button type="button" role="tab" aria-selected={seg === "watch"} data-on={seg === "watch" ? "1" : undefined} onClick={() => setSeg("watch")}>
              {t("appui.term.watch")}
            </button>
            <button type="button" role="tab" aria-selected={seg === "cal"} data-on={seg === "cal" ? "1" : undefined} onClick={() => setSeg("cal")}>
              {t("nav.calendar")}
            </button>
          </div>
        ) : (
          <div className="app-term-wtitle">{t("appui.term.watch")}</div>
        )}
        {TERMINAL_SITE && seg === "cal" && (
          <div className="tv3 app-term-cal" data-app-calendar>
            <CalendarPanel zone={zone} visible />
          </div>
        )}
        <div className="app-term-watch" hidden={TERMINAL_SITE && seg === "cal"}>
          {watchlist.items.length === 0 ? (
            <div className="app-term-wempty">{t("appui.term.watchEmpty")}</div>
          ) : (
            watchlist.items.map((i) => {
              const q = quotes[qKey(i)];
              const tn = changeTone(q?.changePercent);
              return (
                <button key={qKey(i)} type="button" className="app-term-wrow" data-sel={selected && qKey(i) === qKey(selected) ? "1" : undefined} onClick={() => {
                    onSelectSymbol(i);
                    // the chart is above the list: bring it into view (the design leaves the scroll as is, but then the tap shows nothing)
                    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
                  }}>
                  <span className="app-term-wl">
                    <span className="app-term-wt">{i.ticker}</span>
                    <span className="app-term-wn">{instName(i, t)}</span>
                  </span>
                  <span className="app-term-wr">
                    <span className="app-term-wp">{priceText(q, i, locale)}</span>
                    <span className="app-term-wc" data-tone={tn ?? undefined}>
                      {pctLabel(q?.changePercent, locale)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        {TERMINAL_SITE && (
          <a href={FOMO_COMMUNITY_URL} target="_blank" rel="noopener" className="app-term-ideas app-term-comm" data-fomo-community>
            <AppIcon name="users" size={18} stroke={1.8} />
            <span className="app-term-ideas-t">
              {t("termsite.community")}
              <span className="app-term-ideas-s">{t("termsite.community.sub")}</span>
            </span>
            <AppIcon name="chevR" size={18} stroke={1.8} />
          </a>
        )}

        <div className="app-term-disc">
          {t("appui.term.disc")}
          {delayed ? ` ${t("appui.term.disc15")}` : ""}
        </div>
      </div>
    </DemoGate>
  );
}
