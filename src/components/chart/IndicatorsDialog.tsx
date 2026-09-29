"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { IndicatorsControllerLike, IndicatorInstance, ParamValue } from "@/lib/chart/contracts";
import { CATEGORIES, INDICATOR_DEFS, defaultParams, getIndicatorDef } from "@/lib/chart/indicators/registry";
import type { Category, IndicatorDef, ParamDef } from "@/lib/chart/indicators/registry";

/* ───────────── icons (own, inline) ───────────── */

type IconName = "all" | "trend" | "momentum" | "volatility" | "volume" | "other" | "active" | "eye" | "eyeOff" | "gear" | "trash" | "close" | "search" | "plus" | "check" | "reset";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
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
    case "other":
      body = (
        <>
          <circle cx="5" cy="10" r="1.3" {...p} />
          <circle cx="10" cy="10" r="1.3" {...p} />
          <circle cx="15" cy="10" r="1.3" {...p} />
        </>
      );
      break;
    case "active":
      body = <path d="M3.5 5.5 5 7l2-2.5M3.5 10.5 5 12l2-2.5M3.5 15.5 5 17l2-2.5M10 6h7M10 11h7M10 16h7" {...p} />;
      break;
    case "eye":
      body = (
        <>
          <path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z" {...p} />
          <circle cx="10" cy="10" r="2.4" {...p} />
        </>
      );
      break;
    case "eyeOff":
      body = (
        <>
          <path d="M2 2l16 16" {...p} />
          <path d="M8.2 4.8A8.4 8.4 0 0 1 10 4.5c5 0 8.2 5.5 8.2 5.5a14 14 0 0 1-2.6 3.2M5.3 6.3A14 14 0 0 0 1.8 10S5 15.5 10 15.5c1 0 1.9-.2 2.7-.5M8.5 8.5a2.4 2.4 0 0 0 3 3" {...p} />
        </>
      );
      break;
    case "gear":
      body = (
        <>
          <circle cx="10" cy="10" r="2.4" {...p} />
          <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" {...p} />
        </>
      );
      break;
    case "trash":
      body = <path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.7 11h7.6l.7-11M8.5 8.5v5M11.5 8.5v5" {...p} />;
      break;
    case "close":
      body = <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" {...p} />;
      break;
    case "search":
      body = (
        <>
          <circle cx="8.5" cy="8.5" r="5" {...p} />
          <path d="m12.3 12.3 4.2 4.2" {...p} />
        </>
      );
      break;
    case "plus":
      body = <path d="M10 4v12M4 10h12" {...p} />;
      break;
    case "check":
      body = <path d="m4.5 10.5 3.5 3.5 7.5-8" {...p} />;
      break;
    case "reset":
      body = <path d="M4 10a6 6 0 1 0 2-4.5M4 3.5v3.5h3.5" {...p} />;
      break;
  }
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}

/* ───────────── small form controls ───────────── */

const inputCls =
  "w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-900 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

function NumberField({ def, value, onCommit, id }: { def: Extract<ParamDef, { type: "number" }>; value: number; onCommit: (v: number) => void; id: string }) {
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(String(value));
  }, [value]);
  return (
    <input
      id={id}
      ref={ref}
      type="number"
      min={def.min}
      max={def.max}
      step={def.step}
      value={draft}
      className={inputCls}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (isFinite(n) && n >= def.min && n <= def.max) onCommit(n);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

function ColorField({ value, onCommit, id }: { value: string; onCommit: (v: string) => void; id: string }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div className="flex items-center gap-1.5">
      <input
        id={id}
        type="color"
        value={draft}
        className="h-6 w-9 cursor-pointer rounded border border-gray-200 bg-transparent p-0 dark:border-gray-700"
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onCommit(v), 90);
        }}
      />
      <span className="font-mono text-[10px] uppercase text-gray-500 dark:text-gray-400">{draft}</span>
    </div>
  );
}

/* ───────────── dialog ───────────── */

type Section = "all" | Category | "active";

const CATEGORY_ICON: Record<Category, IconName> = {
  trend: "trend",
  momentum: "momentum",
  volatility: "volatility",
  volume: "volume",
  other: "other",
};

interface Props {
  controller: IndicatorsControllerLike;
  open: boolean;
  onClose: () => void;
}

export default function IndicatorsDialog(props: Props) {
  if (!props.open) return null;
  return <DialogBody {...props} />;
}

function DialogBody({ controller, onClose }: Props) {
  const { t } = useT();
  const [, force] = useState(0);
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => controller.subscribe(() => force((n) => n + 1)), [controller]);

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
    return catalog.filter(({ def, name, desc }) => {
      if (section !== "all" && section !== "active" && def.category !== section) return false;
      if (!q) return true;
      return (
        name.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q) ||
        def.id.includes(q) ||
        (def.keywords ?? "").toLowerCase().includes(q)
      );
    });
  }, [catalog, section, q]);

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

  const sectionLabel = (s: Section) => (s === "all" ? t("ind.cat.all") : s === "active" ? t("ind.active") : t(`ind.cat.${s}`));

  const sections: Section[] = ["all", ...CATEGORIES];

  const navBtn = (s: Section, count?: number) => {
    const isOn = section === s;
    return (
      <button
        key={s}
        type="button"
        onClick={() => {
          setSection(s);
          setExpanded(null);
        }}
        aria-current={isOn ? "true" : undefined}
        className={`flex shrink-0 items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${
          isOn
            ? "bg-green-600/10 text-green-700 dark:bg-green-500/15 dark:text-green-400"
            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        }`}
      >
        <Icon name={s === "all" ? "all" : s === "active" ? "active" : CATEGORY_ICON[s]} />
        <span className="flex-1 whitespace-nowrap">{sectionLabel(s)}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-green-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{count}</span>
        )}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
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
        className="flex h-[min(600px,92vh)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        {/* header: title + search */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <h2 className="shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">{t("ind.title")}</h2>
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">
              <Icon name="search" className="h-3.5 w-3.5" />
            </span>
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
              className="w-full rounded border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-2 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-green-600 focus:ring-1 focus:ring-green-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("ind.close")}
            title={t("ind.close")}
            className="shrink-0 rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* left column: categories */}
          <nav
            aria-label={t("ind.categories")}
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 p-1.5 sm:w-44 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r dark:border-gray-700"
          >
            {sections.map((s) => navBtn(s))}
            <div className="mx-1 hidden h-px shrink-0 bg-gray-200 sm:my-1 sm:block dark:bg-gray-700" />
            {navBtn("active", active.length)}
          </nav>

          {/* right column */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" onKeyDown={onListKey}>
            {section === "active" ? (
              <ActiveList
                active={active}
                expanded={expanded}
                setExpanded={setExpanded}
                controller={controller}
                onGoAdd={() => setSection("all")}
              />
            ) : shown.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">{t("ind.noResults")}</div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {shown.map(({ def, name, desc }) => {
                  const n = countById.get(def.id) ?? 0;
                  const swatch = def.params.find((p) => p.type === "color");
                  return (
                    <li key={def.id}>
                      <button
                        type="button"
                        data-nav
                        onClick={() => addIndicator(def.id)}
                        className="group flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600 dark:hover:bg-gray-800/70 dark:focus:bg-gray-800/70"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: swatch && swatch.type === "color" ? swatch.default : "#9ca3af" }} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{name}</span>
                            <span className="shrink-0 rounded border border-gray-200 px-1 text-[9px] uppercase leading-4 tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                              {def.pane === "own" ? t("ind.pane.own") : t("ind.pane.overlay")}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-gray-500 dark:text-gray-400">{desc}</span>
                        </span>
                        {n > 0 && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold leading-4 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            ×{n}
                          </span>
                        )}
                        <span
                          className={`flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium ${
                            justAdded === def.id
                              ? "text-green-600 dark:text-green-400"
                              : "text-gray-400 group-hover:text-green-600 group-focus:text-green-600 dark:group-hover:text-green-400"
                          }`}
                        >
                          <Icon name={justAdded === def.id ? "check" : "plus"} className="h-3.5 w-3.5" />
                          {justAdded === def.id ? t("ind.added") : t("ind.add")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── active list ───────────── */

function ActiveList({
  active,
  expanded,
  setExpanded,
  controller,
  onGoAdd,
}: {
  active: IndicatorInstance[];
  expanded: string | null;
  setExpanded: (uid: string | null) => void;
  controller: IndicatorsControllerLike;
  onGoAdd: () => void;
}) {
  const { t } = useT();
  if (active.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center text-xs text-gray-500 dark:text-gray-400">
        <span>{t("ind.empty")}</span>
        <button
          type="button"
          data-nav
          onClick={onGoAdd}
          className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
        >
          {t("ind.browse")}
        </button>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {active.map((inst) => {
        const def = getIndicatorDef(inst.id);
        if (!def) return null;
        const open = expanded === inst.uid;
        const iconBtn =
          "rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100";
        const swatch = def.params.find((p) => p.type === "color");
        const swatchColor = swatch ? String(inst.params[swatch.key] ?? swatch.default) : "#9ca3af";
        return (
          <li key={inst.uid} className={inst.visible ? "" : "opacity-60"}>
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: swatchColor }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{t(`ind.${def.id}.name`)}</span>
                <span className="block truncate font-mono text-[10px] text-gray-500 dark:text-gray-400">{def.title(inst.params)}</span>
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
                <Icon name={inst.visible ? "eye" : "eyeOff"} />
              </button>
              <button
                type="button"
                data-nav
                className={`${iconBtn} ${open ? "bg-green-600/10 text-green-700 dark:text-green-400" : ""}`}
                aria-expanded={open}
                aria-label={t("ind.settings")}
                title={t("ind.settings")}
                onClick={() => setExpanded(open ? null : inst.uid)}
              >
                <Icon name="gear" />
              </button>
              <button
                type="button"
                data-nav
                className={`${iconBtn} hover:text-red-600 dark:hover:text-red-400`}
                aria-label={t("ind.remove")}
                title={t("ind.remove")}
                onClick={() => {
                  if (expanded === inst.uid) setExpanded(null);
                  controller.remove(inst.uid);
                }}
              >
                <Icon name="trash" />
              </button>
            </div>
            {open && <SettingsForm inst={inst} def={def} controller={controller} />}
          </li>
        );
      })}
    </ul>
  );
}

function SettingsForm({ inst, def, controller }: { inst: IndicatorInstance; def: IndicatorDef; controller: IndicatorsControllerLike }) {
  const { t } = useT();
  const set = (key: string, value: ParamValue) => controller.update(inst.uid, { params: { [key]: value } });
  const numbers = def.params.filter((p) => p.type !== "color");
  const colors = def.params.filter((p) => p.type === "color");
  const idOf = (key: string) => `ind-${inst.uid}-${key}`;
  const label = (key: string) => (
    <label htmlFor={idOf(key)} className="text-[11px] text-gray-600 dark:text-gray-400">
      {t(`ind.p.${key}`)}
    </label>
  );
  return (
    <div className="border-t border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/40">
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {numbers.map((p) => {
          const v = inst.params[p.key] ?? p.default;
          if (p.type === "boolean") {
            return (
              <div key={p.key} className="flex items-center gap-2 sm:col-span-2">
                <input
                  id={idOf(p.key)}
                  type="checkbox"
                  checked={Boolean(v)}
                  onChange={(e) => set(p.key, e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-green-600 dark:border-gray-600"
                />
                {label(p.key)}
              </div>
            );
          }
          return (
            <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
              {label(p.key)}
              {p.type === "number" ? (
                <NumberField id={idOf(p.key)} def={p} value={Number(v)} onCommit={(n) => set(p.key, n)} />
              ) : p.type === "select" ? (
                <select id={idOf(p.key)} value={String(v)} onChange={(e) => set(p.key, e.target.value)} className={inputCls}>
                  {p.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label.startsWith("ind.") ? t(o.label) : o.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          );
        })}
      </div>
      {colors.length > 0 && (
        <div className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-2 border-t border-gray-200 pt-2.5 sm:grid-cols-2 dark:border-gray-700">
          {colors.map((p) => (
            <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
              {label(p.key)}
              <ColorField id={idOf(p.key)} value={String(inst.params[p.key] ?? p.default)} onCommit={(c) => set(p.key, c)} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          data-nav
          onClick={() => controller.update(inst.uid, { params: defaultParams(def) })}
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Icon name="reset" className="h-3.5 w-3.5" />
          {t("ind.reset")}
        </button>
      </div>
    </div>
  );
}
