"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import type { Drawing, DrawingPatch } from "@/lib/chart/drawings/types";
import { deleteUserData, listUserData, saveUserData } from "@/lib/chart/userdata";
import { IND_ICONS } from "./icons";

/* Small building blocks shared by the drawing Properties dialog and the floating style bar. */

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const inputCls =
  "h-7 rounded-[9px] border border-[var(--tv3-fill2)] bg-transparent px-1.5 text-[13px] text-[var(--tv3-text)] outline-none focus:border-[var(--tv3-accent)]";
export const btnCls = "flex h-7 items-center justify-center rounded-[9px] border border-[var(--tv3-fill2)] px-2 text-[13px] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill)]";

function fmtNum(v: number): string {
  return String(Math.round(v * 1e8) / 1e8);
}

export function NumInput({ value, min, max, step = 1, onChange, className = "w-[72px]", suffix }: { value: number; min: number; max: number; step?: number; onChange: (n: number) => void; className?: string; suffix?: string }) {
  const [txt, setTxt] = useState(fmtNum(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setTxt(fmtNum(value));
  }, [value]);
  const parse = (s: string) => parseFloat(s.replace(",", "."));
  const bump = (dir: 1 | -1) => {
    const n = Math.max(min, Math.min(max, (Number.isFinite(value) ? value : 0) + dir * step));
    const r = Math.round(n * 1e8) / 1e8;
    setTxt(fmtNum(r));
    onChange(r);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={txt}
        className={`${inputCls} ${className}`}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focused.current = false;
          const n = parse(txt);
          if (!Number.isFinite(n)) setTxt(fmtNum(value));
          else {
            const c = Math.max(min, Math.min(max, n));
            setTxt(fmtNum(c));
            if (c !== value) onChange(c);
          }
        }}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parse(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "ArrowUp") {
            e.preventDefault();
            bump(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            bump(-1);
          }
        }}
      />
      {suffix && <span className="text-[12px] text-[var(--tv3-muted)]">{suffix}</span>}
    </span>
  );
}

export function Menu({ trigger, children, title, up = false }: { trigger: ReactNode; children: (close: () => void) => ReactNode; title?: string; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("touchstart", down);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" title={title} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${btnCls} min-w-[56px] gap-1`}>
        {trigger}
        <span className="opacity-60">{IND_ICONS.chevronDown(12)}</span>
      </button>
      {open && (
        <div className={`absolute z-[80] ${up ? "bottom-full mb-1" : "mt-1"} left-0 min-w-[130px] rounded-xl tv3-pop p-1 shadow-[var(--tv3-shadow-pop)]`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function LinePreview({ width, dash, color = "currentColor" }: { width: number; dash: string; color?: string }) {
  const arr = dash === "dashed" ? `${6 + width} ${4 + width}` : dash === "dotted" ? `1.5 ${2.5 + width}` : undefined;
  return (
    <svg width="44" height="14" aria-hidden="true">
      <line x1="2" y1="7" x2="42" y2="7" stroke={color} strokeWidth={Math.max(1, width)} strokeDasharray={arr} strokeLinecap={dash === "dotted" ? "round" : "butt"} />
    </svg>
  );
}

/* ───────────── templates ───────────── */

interface TplData {
  style?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

function stripForTemplate(d: Drawing): TplData {
  const style = clone(d.style) as unknown as Record<string, unknown>;
  delete style.text;
  const extra = d.extra ? (clone(d.extra) as Record<string, unknown>) : {};
  delete extra.vis;
  return { style, extra };
}

export function TemplateMenu({
  d,
  controller,
  apply,
  t,
  factory,
  compact = false,
  down = false,
}: {
  d: Drawing;
  controller: DrawingsControllerLike;
  apply: (p: DrawingPatch) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
  factory: Drawing["style"];
  compact?: boolean;
  down?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ name: string; data: TplData }[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const prefix = `${d.tool}:`;
  const hasDefault = open ? !!controller.getToolDefault(d.tool) : false;

  const reload = useCallback(async () => {
    const list = await listUserData<TplData>("drawing_template");
    setItems(list.filter((i) => i.key.startsWith(prefix)).map((i) => ({ name: i.key.slice(prefix.length), data: i.data })));
  }, [prefix]);

  useEffect(() => {
    if (!open) return;
    void reload();
    const down = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("touchstart", down);
    };
  }, [open, reload]);

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 1800);
  };

  const applyData = (data: TplData) => {
    const style: Record<string, unknown> = { ...(data.style ?? {}) };
    delete style.text;
    apply({ style: style as Partial<Drawing["style"]>, extra: { ...(data.extra ?? {}) } });
  };

  const reset = () => {
    const style: Record<string, unknown> = { ...factory };
    for (const k of Object.keys(d.style)) if (!(k in factory) && k !== "text") style[k] = undefined;
    style.text = d.style.text;
    const extra: Record<string, unknown> = {};
    for (const k of Object.keys(d.extra ?? {})) extra[k] = undefined;
    apply({ style: style as Partial<Drawing["style"]>, extra });
    flash(t("dp.tpl.resetDone"));
  };

  const itemCls = "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[13px] text-[var(--tv3-text)] hover:bg-[var(--tv3-fill)]";

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${btnCls} gap-1`}>
        {compact ? <span className="text-[12px]">{t("dp.template")}</span> : t("dp.template")}
        <span className="opacity-60">{IND_ICONS.chevronDown(12)}</span>
      </button>
      {open && (
        <div className={`absolute left-0 z-[80] w-[240px] ${down ? "top-full mt-1" : "bottom-full mb-1"} rounded-xl tv3-pop p-1 shadow-[var(--tv3-shadow-pop)]`}>
          <div className="flex items-center gap-1 p-1">
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("dp.tpl.name")} className={`${inputCls} min-w-0 flex-1`} onKeyDown={(e) => e.stopPropagation()} />
            <button
              type="button"
              disabled={!name.trim() || busy}
              className={`${btnCls} disabled:opacity-40`}
              onClick={async () => {
                setBusy(true);
                const ok = await saveUserData("drawing_template", `${prefix}${name.trim()}`, stripForTemplate(d));
                setBusy(false);
                if (ok) {
                  setName("");
                  flash(t("dp.tpl.saved"));
                  void reload();
                } else flash(t("dp.tpl.failed"));
              }}
            >
              {t("dp.tpl.saveAs")}
            </button>
          </div>
          {items.length > 0 && <div className="my-1 border-t border-[var(--tv3-hair)]" />}
          <div className="max-h-40 overflow-y-auto">
            {items.map((it) => (
              <div key={it.name} className="flex items-center">
                <button
                  type="button"
                  className={`${itemCls} min-w-0 flex-1 truncate`}
                  title={t("dp.tpl.apply")}
                  onClick={() => {
                    applyData(it.data);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{it.name}</span>
                </button>
                <button
                  type="button"
                  title={t("draw.style.delete")}
                  aria-label={t("draw.style.delete")}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] hover:text-[var(--tv3-down)]"
                  onClick={async () => {
                    await deleteUserData("drawing_template", `${prefix}${it.name}`);
                    void reload();
                  }}
                >
                  {IND_ICONS.trash(13)}
                </button>
              </div>
            ))}
          </div>
          <div className="my-1 border-t border-[var(--tv3-hair)]" />
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              controller.setToolDefault(d.tool, stripForTemplate(d) as { style?: Partial<Drawing["style"]>; extra?: Record<string, unknown> });
              flash(t("dp.tpl.defaultSaved"));
            }}
          >
            {t("dp.tpl.saveDefault")}
          </button>
          {hasDefault && (
            <button
              type="button"
              className={itemCls}
              onClick={() => {
                controller.setToolDefault(d.tool, null);
                flash(t("dp.tpl.defaultCleared"));
              }}
            >
              {t("dp.tpl.clearDefault")}
            </button>
          )}
          <button type="button" className={itemCls} onClick={reset}>
            {t("dp.tpl.reset")}
          </button>
          {note && <div className="px-2 pb-1 pt-0.5 text-[11px] text-[var(--tv3-accent)]">{note}</div>}
        </div>
      )}
    </div>
  );
}

