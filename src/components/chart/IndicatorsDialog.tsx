"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { IndicatorInstance } from "@/lib/chart/contracts";
import type { IndicatorsController } from "@/lib/chart/indicators/controller";
import { INDICATOR_DEFS, getIndicatorDef } from "@/lib/chart/indicators/registry";
import type { Category } from "@/lib/chart/indicators/registry";
import { isSignedInForUserData, listUserData, saveUserData } from "@/lib/chart/userdata";
import { createDraftScript, deleteScript, ensureScriptsLoaded, isPersisted, listScripts, parseImported, subscribeScripts } from "@/lib/chart/scripts/store";
import { BLANK_SCRIPT, SCRIPT_TEMPLATES } from "@/lib/chart/scripts/templates";
import IndicatorEditor from "./IndicatorEditor";
import IndicatorsPopover from "./IndicatorsPopover";
import { TV3 } from "./tv3-ui";
import IndicatorSettingsDialog from "./IndicatorSettingsDialog";
import { IND_ICONS } from "./icons";

/* Indicator catalog, TradingView style: categories on the left (favorites, recently used, built-ins and the
   groups), search on top, add several indicators without closing, and the list of indicators on the chart. */

const FAV_KIND = "indicator_favorites";
const FAV_KEY = "list";
const RECENT_KEY = "fomo-ind-recent";
const MAX_RECENT = 10;

/* ───────────── category icons ───────────── */

type IconName = "all" | "trend" | "momentum" | "volatility" | "volume" | "sr" | "ma" | "patterns" | "other";

function CatIcon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let body: ReactNode;
  switch (name) {
    case "all":
      body = (
        <>
          <rect x="3" y="3" width="6" height="6" rx="1" {...p} />
          <rect x="11" y="3" width="6" height="6" rx="1" {...p} />
          <rect x="3" y="11" width="6" height="6" rx="1" {...p} />
          <rect x="11" y="11" width="6" height="6" rx="1" {...p} />
        </>
      );
      break;
    case "trend":
      body = <path d="M2.5 14.5 7.5 9l3 3 6.5-7.5M12.5 4.5H17V9" {...p} />;
      break;
    case "momentum":
      body = <path d="M2 10c1.5 0 1.5-6 3-6s1.5 12 3 12 1.5-12 3-12 1.5 6 3 6h3" {...p} />;
      break;
    case "volatility":
      body = <path d="M2.5 5.5c3.5 0 4.5 2 7.5 2s4-2 7.5-2M2.5 14.5c3.5 0 4.5-2 7.5-2s4 2 7.5 2M2.5 10h15" {...p} />;
      break;
    case "volume":
      body = <path d="M4 16V9m4 7V4m4 12v-5m4 5V7" {...p} />;
      break;
    case "sr":
      body = <path d="M2.5 6h15M2.5 14h15M6 6v8M14 6v8" {...p} strokeDasharray="0" />;
      break;
    case "patterns":
      body = <path d="M2 15 4.5 9 7 13l3-9 3 9 2.5-4L18 15" {...p} />;
      break;
    case "ma":
      body = <path d="M2.5 13.5c2.5-7 5-7 7.5-2s5 4.5 7.5-4M2.5 16.5h15" {...p} />;
      break;
    default:
      body = (
        <>
          <circle cx="5" cy="10" r="1.3" {...p} />
          <circle cx="10" cy="10" r="1.3" {...p} />
          <circle cx="15" cy="10" r="1.3" {...p} />
        </>
      );
  }
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}

/* ───────────── dialog ───────────── */

type Section = "fav" | "recent" | "all" | Category | "active" | "scripts";

const NAV_GROUPS: Category[] = ["trend", "momentum", "volatility", "volume", "sr", "ma", "patterns"];

interface Props {
  controller: IndicatorsController;
  open: boolean;
  onClose: () => void;
}

/** ё = е, lower case; every word of the query must appear as a word start/stem ("объемный профиль" finds "Профиль объёма"). */
function normSearch(x: string): string {
  return x.toLowerCase().replace(/ё/g, "е");
}
function matchesQuery(q: string, haystack: string): boolean {
  const h = normSearch(haystack);
  return normSearch(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => h.includes(tok.length > 5 ? tok.slice(0, 5) : tok));
}

export default function IndicatorsDialog(props: Props) {
  // the script editor lives here (not in the dialog body) so that it stays open when the dialog closes
  const [editScript, setEditScript] = useState<string | null>(null);
  // Terminal v3: opening shows the compact popover under the «Индикаторы» button; «All indicators…» (and phones) go to the full catalog
  const [catalog, setCatalog] = useState(false);
  const { controller, onClose } = props;
  useEffect(() => {
    if (props.open) setCatalog(typeof window !== "undefined" && window.innerWidth < 640);
  }, [props.open]);
  return (
    <>
      {props.open && !catalog && <IndicatorsPopover controller={controller} onClose={onClose} onOpenCatalog={() => setCatalog(true)} />}
      {props.open && catalog && (
        <DialogBody
          {...props}
          onEditScript={(id) => {
            setEditScript(id);
            onClose();
          }}
        />
      )}
      <IndicatorEditor controller={controller} scriptId={editScript} onClose={() => setEditScript(null)} />
    </>
  );
}

function readRecent(): string[] {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(r) ? r.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function DialogBody({ controller, onClose, onEditScript }: Props & { onEditScript: (scriptId: string) => void }) {
  const { t } = useT();
  const [, force] = useState(0);
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [settingsUid, setSettingsUid] = useState<string | null>(null);
  const [scriptTick, setScriptTick] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => controller.subscribe(() => force((n) => n + 1)), [controller]);

  // the user's scripts (loaded once, then kept live)
  useEffect(() => {
    void ensureScriptsLoaded();
    return subscribeScripts(() => setScriptTick((n) => n + 1));
  }, []);

  // favorites (per user, or this browser for guests) and recently used
  useEffect(() => {
    setRecent(readRecent());
    let dead = false;
    void listUserData<{ ids?: string[] }>(FAV_KIND, FAV_KEY).then((items) => {
      if (dead) return;
      const ids = items[0]?.data?.ids;
      if (Array.isArray(ids)) setFavs(ids.filter((x): x is string => typeof x === "string"));
    });
    return () => {
      dead = true;
    };
  }, []);

  // focus the search box on open, give focus back on close
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      prev?.focus?.();
    };
  }, []);

  const active = controller.list();

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        ).filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const cur = document.activeElement;
        if (e.shiftKey && (cur === first || !panelRef.current.contains(cur))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && cur === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  const q = query.trim().toLowerCase();

  // only stored scripts are listed (a draft that was never saved lives in the editor only)
  const scriptList = useMemo(
    () => listScripts().filter((s) => isPersisted(s.id)).map((s) => ({ id: s.id, name: s.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scriptTick],
  );

  const catalog = useMemo(
    () =>
      INDICATOR_DEFS.map((d) => ({
        def: d,
        name: t(`ind.${d.id}.name`),
        desc: t(`ind.${d.id}.desc`),
      })),
    [t],
  );

  const shown = useMemo(() => {
    const inSection = (id: string, cat: Category): boolean => {
      if (section === "all" || section === "active") return true;
      if (section === "fav") return favs.includes(id);
      if (section === "recent") return recent.includes(id);
      return cat === section;
    };
    let list = catalog.filter(({ def, name, desc }) => {
      if (!inSection(def.id, def.category)) return false;
      if (!q) return true;
      return matchesQuery(q, `${name} ${desc} ${def.id} ${def.keywords ?? ""}`);
    });
    if (section === "recent") list = [...list].sort((a, b) => recent.indexOf(a.def.id) - recent.indexOf(b.def.id));
    return list;
  }, [catalog, section, q, favs, recent]);

  const countById = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of active) m.set(i.id, (m.get(i.id) ?? 0) + 1);
    return m;
  }, [active]);

  const addIndicator = (id: string) => {
    const uid = controller.add(id);
    if (!uid) return;
    setJustAdded(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustAdded(null), 1200);
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, MAX_RECENT);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    void saveUserData(FAV_KIND, FAV_KEY, { ids: next });
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const root = e.currentTarget;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-nav]"));
    if (!nodes.length) return;
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    const next = e.key === "ArrowDown" ? nodes[Math.min(nodes.length - 1, i + 1)] : nodes[Math.max(0, i - 1)];
    next?.focus();
  };

  const navBtn = (s: Section, label: string, icon: ReactNode, count?: number) => {
    const isOn = section === s;
    return (
      <button
        key={s}
        type="button"
        onClick={() => setSection(s)}
        aria-current={isOn ? "true" : undefined}
        className={`flex shrink-0 items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)] ${
          isOn ? "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]" : "text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill)]"
        }`}
      >
        {icon}
        <span className="flex-1 whitespace-nowrap">{label}</span>
        {count !== undefined && count > 0 && <span className="rounded-full bg-[var(--tv3-accent)] px-1.5 text-[10px] font-semibold leading-4 text-white">{count}</span>}
      </button>
    );
  };

  const emptyText = section === "fav" ? t("ind2.fav.empty") : section === "recent" ? t("ind2.recent.empty") : t("ind.noResults");

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 ${TV3.backdrop}`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onKeyDown={onKeyDown}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("ind.title")}
          className="flex h-[min(620px,92vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]"
        >
          {/* header: title + search */}
          <div className="flex items-center gap-3 border-b border-[var(--tv3-hair)] px-3 py-2">
            <h2 className="shrink-0 text-sm font-semibold text-[var(--tv3-text)]">{t("ind.title")}</h2>
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tv3-muted)]">{IND_ICONS.search(14)}</span>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (section === "active" && e.target.value) setSection("all");
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    panelRef.current?.querySelector<HTMLElement>("[data-nav]")?.focus();
                  } else if (e.key === "Enter" && shown.length > 0 && q) {
                    e.preventDefault();
                    addIndicator(shown[0].def.id);
                  }
                }}
                placeholder={t("ind.search")}
                aria-label={t("ind.search")}
                className="w-full rounded-[10px] border border-transparent bg-[var(--tv3-fill)] py-2 pl-8 pr-2.5 text-[13px] text-[var(--tv3-text)] outline-none placeholder:text-[var(--tv3-muted)] focus:border-[var(--tv3-accent)] focus:ring-1 focus:ring-[var(--tv3-accent)]"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("ind.close")}
              title={t("ind.close")}
              className="shrink-0 rounded-lg bg-[var(--tv3-fill)] p-1.5 text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]"
            >
              {IND_ICONS.close(16)}
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            {/* left column: categories */}
            <nav
              aria-label={t("ind.categories")}
              className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--tv3-hair)] p-1.5 sm:w-52 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r"
            >
              {navBtn("fav", t("ind2.cat.fav"), IND_ICONS.star(16), favs.length)}
              {navBtn("recent", t("ind2.cat.recent"), IND_ICONS.recent(16))}
              {navBtn("all", t("ind2.cat.builtin"), <CatIcon name="all" />)}
              {navBtn("scripts", t("isc.cat"), IND_ICONS.template(16), scriptList.length)}
              <div className="mx-1 hidden h-px shrink-0 bg-[var(--tv3-fill2)] sm:my-1 sm:block" />
              {NAV_GROUPS.map((c) => navBtn(c, t(`ind.cat.${c}`), <CatIcon name={c as IconName} />))}
              <div className="mx-1 hidden h-px shrink-0 bg-[var(--tv3-fill2)] sm:my-1 sm:block" />
              {navBtn("active", t("ind.active"), IND_ICONS.layers(16), active.length)}
            </nav>

            {/* right column */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto" onKeyDown={onListKey}>
                {section === "active" ? (
                  <ActiveList active={active} controller={controller} onGoAdd={() => setSection("all")} onSettings={setSettingsUid} />
                ) : section === "scripts" ? (
                  <ScriptsList controller={controller} query={q} scripts={scriptList} onEdit={onEditScript} />
                ) : shown.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--tv3-muted)]">{emptyText}</div>
                ) : (
                  <ul className="divide-y divide-[var(--tv3-hair2)]">
                    {shown.map(({ def, name, desc }) => {
                      const n = countById.get(def.id) ?? 0;
                      const swatch = def.params.find((p) => p.type === "color");
                      const fav = favs.includes(def.id);
                      const just = justAdded === def.id;
                      return (
                        <li key={def.id} className="group flex items-stretch hover:bg-[var(--tv3-fill3)]">
                          <button
                            type="button"
                            data-nav
                            onClick={() => {
                              // one instance of an indicator: already on the chart -> nothing to add
                              if (n === 0) addIndicator(def.id);
                            }}
                            aria-disabled={n > 0}
                            title={n > 0 ? t("ind.added") : undefined}
                            className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left focus:bg-[var(--tv3-fill3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--tv3-accent)] ${n > 0 ? "cursor-default" : ""}`}
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: swatch && swatch.type === "color" ? swatch.default : "#9ca3af" }} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-xs font-semibold text-[var(--tv3-text)]">{name}</span>
                                <span className="shrink-0 rounded border border-[var(--tv3-hair)] px-1 text-[9px] uppercase leading-4 tracking-wide text-[var(--tv3-muted)]">
                                  {def.pane === "own" ? t("ind.pane.own") : t("ind.pane.overlay")}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-[var(--tv3-muted)]">{desc}</span>
                            </span>
                            {n > 0 && (
                              <span className="shrink-0 rounded-full bg-[var(--tv3-fill)] px-1.5 text-[10px] font-semibold leading-4 text-[var(--tv3-text2)]">×{n}</span>
                            )}
                            <span
                              className={`flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium ${
                                just || n > 0 ? "text-[#26a69a]" : "text-[var(--tv3-muted)] group-hover:text-[var(--tv3-accent)]"
                              }`}
                            >
                              {just || n > 0 ? IND_ICONS.check(14) : IND_ICONS.plus(14)}
                              <span className="hidden sm:inline">{just || n > 0 ? t("ind.added") : t("ind.add")}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            data-nav
                            onClick={() => toggleFav(def.id)}
                            aria-pressed={fav}
                            title={fav ? t("ind2.fav.remove") : t("ind2.fav.add")}
                            aria-label={fav ? t("ind2.fav.remove") : t("ind2.fav.add")}
                            className={`flex w-9 shrink-0 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--tv3-accent)] ${
                              fav ? "text-[#f5a623]" : "text-[#c7c7cc] hover:text-[#f5a623] dark:text-[#48484a]"
                            }`}
                          >
                            {fav ? IND_ICONS.starFilled(16) : IND_ICONS.star(16)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[var(--tv3-hair)] px-3 py-1.5 text-[11px] text-[var(--tv3-muted)]">
                <span className="shrink-0">{t("ind2.onChart", { n: active.length })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <IndicatorSettingsDialog controller={controller} uid={settingsUid} onClose={() => setSettingsUid(null)} onEditSource={onEditScript} />
    </>
  );
}

/* ───────────── my scripts ───────────── */

function ScriptsList({
  controller,
  query,
  scripts,
  onEdit,
}: {
  controller: IndicatorsController;
  query: string;
  scripts: { id: string; name: string }[];
  onEdit: (id: string) => void;
}) {
  const { t } = useT();
  const [delId, setDelId] = useState<string | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = query ? scripts.filter((s) => s.name.toLowerCase().includes(query)) : scripts;
  const counts = new Map<string, number>();
  for (const i of controller.list()) counts.set(i.id, (counts.get(i.id) ?? 0) + 1);

  const create = (name: string, code: string) => {
    const rec = createDraftScript(name, code);
    onEdit(rec.id);
  };
  const iconBtn =
    "rounded p-1.5 text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] hover:text-[var(--tv3-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]";
  const tb =
    "flex h-7 items-center gap-1.5 rounded-lg border border-[#e5e5ea] dark:border-[#3a3a3c] px-2 text-xs font-medium text-[var(--tv3-text)] hover:bg-[var(--tv3-fill)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--tv3-hair)] px-3 py-2">
        <button type="button" data-nav onClick={() => create(t("isc.tpl.blank"), BLANK_SCRIPT)} className="flex h-7 items-center gap-1.5 rounded-lg bg-[var(--tv3-accent)] px-3 text-xs font-semibold text-white hover:bg-[var(--tv3-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)] focus-visible:ring-offset-1">
          {IND_ICONS.plus(14)}
          {t("isc.newScript")}
        </button>
        <div className="relative">
          <button type="button" data-nav className={tb} aria-expanded={tplOpen} onClick={() => setTplOpen((o) => !o)}>
            {t("isc.fromTemplate")}
            {IND_ICONS.chevronDown(12)}
          </button>
          {tplOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-xl tv3-pop py-1 shadow-[var(--tv3-shadow-pop)]">
              {SCRIPT_TEMPLATES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left hover:bg-[var(--tv3-fill)]"
                  onClick={() => {
                    setTplOpen(false);
                    create(t(`isc.tpl.${x.id}`), x.code);
                  }}
                >
                  <span className="block text-xs font-medium text-[var(--tv3-text)]">{t(`isc.tpl.${x.id}`)}</span>
                  <span className="block truncate text-[10px] text-[var(--tv3-muted)]">{t(`isc.tpl.${x.id}.d`)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" data-nav className={tb} onClick={() => fileRef.current?.click()}>
          {t("isc.import")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.js,.txt,application/json,text/javascript,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const p = parseImported(await f.text(), f.name);
              if (p) create(p.name, p.code);
            } catch {
              /* unreadable file */
            }
          }}
        />
      </div>
      {list.length === 0 ? (
        <div className="p-6 text-center text-xs text-[var(--tv3-muted)]">{query ? t("ind.noResults") : t("isc.noScripts")}</div>
      ) : (
        <ul className="divide-y divide-[var(--tv3-hair2)]">
          {list.map((s) => {
            const n = counts.get(s.id) ?? 0;
            return (
              <li key={s.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--tv3-fill3)]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--tv3-accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-[var(--tv3-text)]">{s.name}</span>
                    <span className="shrink-0 rounded border border-[var(--tv3-hair)] px-1 text-[9px] uppercase leading-4 tracking-wide text-[var(--tv3-muted)]">{t("isc.tag")}</span>
                    {n > 0 && <span className="shrink-0 rounded-full bg-[var(--tv3-fill)] px-1.5 text-[10px] font-semibold leading-4 text-[var(--tv3-text2)]">×{n}</span>}
                  </span>
                </span>
                {delId === s.id ? (
                  <span className="flex items-center gap-1 text-xs">
                    <span className="text-[var(--tv3-down)]">{t("isc.delete")}?</span>
                    <button
                      type="button"
                      data-nav
                      className="rounded-md bg-[var(--tv3-down)] px-2 py-0.5 text-white hover:opacity-90"
                      onClick={async () => {
                        for (const i of controller.list()) if (i.id === s.id) controller.remove(i.uid);
                        setDelId(null);
                        await deleteScript(s.id);
                      }}
                    >
                      {t("isc.yes")}
                    </button>
                    <button type="button" data-nav className="rounded-md border border-[#e5e5ea] dark:border-[#3a3a3c] px-2 py-0.5" onClick={() => setDelId(null)}>
                      {t("isc.no")}
                    </button>
                  </span>
                ) : (
                  <>
                    <button type="button" data-nav className={iconBtn} title={t("isc.list.add")} aria-label={t("isc.list.add")} onClick={() => controller.add(s.id)}>
                      {IND_ICONS.plus(16)}
                    </button>
                    <button type="button" data-nav className={iconBtn} title={t("isc.list.edit")} aria-label={t("isc.list.edit")} onClick={() => onEdit(s.id)}>
                      {IND_ICONS.template(16)}
                    </button>
                    <button type="button" data-nav className={`${iconBtn} hover:!text-[var(--tv3-down)]`} title={t("isc.list.delete")} aria-label={t("isc.list.delete")} onClick={() => setDelId(s.id)}>
                      {IND_ICONS.trash(16)}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {isSignedInForUserData() === false && <p className="px-3 py-2 text-[10px] text-[var(--tv3-muted)]">{t("isc.local")}</p>}
    </div>
  );
}

/* ───────────── active list ───────────── */

function ActiveList({
  active,
  controller,
  onGoAdd,
  onSettings,
}: {
  active: IndicatorInstance[];
  controller: IndicatorsController;
  onGoAdd: () => void;
  onSettings: (uid: string) => void;
}) {
  const { t } = useT();
  if (active.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center text-xs text-[var(--tv3-muted)]">
        <span>{t("ind.empty")}</span>
        <button
          type="button"
          data-nav
          onClick={onGoAdd}
          className="rounded-lg bg-[var(--tv3-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--tv3-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)] focus-visible:ring-offset-2"
        >
          {t("ind.browse")}
        </button>
      </div>
    );
  }
  const iconBtn =
    "rounded p-1.5 text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] hover:text-[var(--tv3-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]";
  return (
    <ul className="divide-y divide-[var(--tv3-hair2)]">
      {active.map((inst) => {
        const def = getIndicatorDef(inst.id);
        if (!def) return null;
        const swatch = def.params.find((p) => p.type === "color");
        const swatchColor = swatch ? String(inst.params[swatch.key] ?? swatch.default) : "#9ca3af";
        return (
          <li key={inst.uid} className={inst.visible ? "" : "opacity-60"}>
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: swatchColor }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-[var(--tv3-text)]">{def.label ?? t(`ind.${def.id}.name`)}</span>
                <span className="block truncate font-mono text-[10px] text-[var(--tv3-muted)]">{def.title(inst.params)}</span>
              </span>
              <button
                type="button"
                data-nav
                className={iconBtn}
                aria-pressed={inst.visible}
                aria-label={inst.visible ? t("ind.hide") : t("ind.show")}
                title={inst.visible ? t("ind.hide") : t("ind.show")}
                onClick={() => controller.update(inst.uid, { visible: !inst.visible })}
              >
                {inst.visible ? IND_ICONS.eye(16) : IND_ICONS.eyeOff(16)}
              </button>
              <button type="button" data-nav className={iconBtn} aria-label={t("ind.settings")} title={t("ind.settings")} onClick={() => onSettings(inst.uid)}>
                {IND_ICONS.gear(16)}
              </button>
              <button
                type="button"
                data-nav
                className={iconBtn}
                aria-label={t("ind2.lg.clone")}
                title={t("ind2.lg.clone")}
                onClick={() => controller.clone(inst.uid)}
              >
                {IND_ICONS.copy(16)}
              </button>
              <button
                type="button"
                data-nav
                className={`${iconBtn} hover:!text-[var(--tv3-down)]`}
                aria-label={t("ind.remove")}
                title={t("ind.remove")}
                onClick={() => controller.remove(inst.uid)}
              >
                {IND_ICONS.trash(16)}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
