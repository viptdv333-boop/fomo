"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";
import { useT } from "@/lib/i18n/client";
import type { IndicatorInstance, IndicatorsControllerLike } from "@/lib/chart/contracts";
import type { DrawingsController } from "@/lib/chart/drawings/controller";
import { getToolDef } from "@/lib/chart/drawings/tools";
import { getIndicatorDef } from "@/lib/chart/indicators/registry";
import { DrawIcon } from "./icons";

/** Re-renders whenever a controller reports a change. */
function useChanges(subscribe: (cb: () => void) => () => void): number {
  const ver = useRef(0);
  const sub = useCallback(
    (cb: () => void) =>
      subscribe(() => {
        ver.current += 1;
        cb();
      }),
    [subscribe]
  );
  return useSyncExternalStore(
    sub,
    () => ver.current,
    () => 0
  );
}

const iconBtn =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--tv3-muted)] transition-colors hover:bg-[var(--tv3-fill2)] hover:text-[var(--tv3-text)] cursor-pointer";
const iconBtnOn = "!text-[var(--tv3-blue)]";
const rowCls = "group mb-1 flex items-center gap-2 rounded-[10px] bg-[var(--tv3-fill3)] px-2";
/** the red × of the design */
const delCls = "flex h-7 w-6 shrink-0 cursor-pointer items-center justify-center text-[18px] leading-none text-[var(--tv3-red)] hover:opacity-70";

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="pb-2">
      <h3 className="flex items-center gap-2 px-2 pb-1.5 pt-1.5 text-[12px] font-semibold uppercase text-[var(--tv3-muted)]">
        {title}
        <span className="rounded-full bg-[var(--tv3-fill)] px-1.5 text-[10px] font-medium">{count}</span>
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function indicatorSummary(params: Record<string, string | number | boolean>): string {
  const nums = Object.values(params).filter((v) => typeof v === "number").slice(0, 3);
  return nums.length ? `(${nums.join(", ")})` : "";
}

/** The colour dot of an indicator row: the first plot colour of its style, or its colour parameter. */
function dotColor(inst: IndicatorInstance): string {
  const plots = inst.style?.plots ? Object.values(inst.style.plots) : [];
  const fromStyle = plots.find((p) => p?.color)?.color;
  const fromParam = typeof inst.params.color === "string" ? inst.params.color : undefined;
  return fromStyle ?? fromParam ?? "var(--tv3-muted)";
}

export default function ObjectTree({ drawings, indicators }: { drawings: DrawingsController; indicators: IndicatorsControllerLike }) {
  const { t } = useT();
  useChanges(useCallback((cb: () => void) => drawings.subscribe(cb), [drawings]));
  useChanges(useCallback((cb: () => void) => indicators.subscribe(cb), [indicators]));

  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const list = drawings.listAll();
  const inds = indicators.list();
  const selected = new Set(drawings.getSelectedIds());
  const rows = [...list].reverse();

  const nameOf = (tool: string, custom?: string) => custom || t(getToolDef(tool)?.labelKey ?? `draw.tool.${tool}`);

  const commitRename = () => {
    if (renaming) drawings.renameById(renaming, draft);
    setRenaming(null);
  };
  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") commitRename();
    else if (e.key === "Escape") setRenaming(null);
  };

  const pick = (e: MouseEvent, id: string, hidden: boolean) => {
    if (hidden) return;
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    drawings.selectById(id, additive);
    if (!additive) drawings.focusOn(id);
  };

  if (list.length === 0 && inds.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
        <p className="text-[14px] font-semibold text-[var(--tv3-text2)]">{t("cm.tree.empty")}</p>
        <p className="text-[12px] text-[var(--tv3-muted)]">{t("cm.tree.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5">
      {rows.length > 0 && (
        <Section title={t("cm.tree.drawings")} count={rows.length}>
          {rows.map((d) => {
            const on = selected.has(d.id);
            const hidden = !!d.hidden;
            return (
              <li
                key={d.id}
                onClick={(e) => pick(e, d.id, hidden)}
                className={`${rowCls} cursor-pointer ${on ? "outline outline-1 -outline-offset-1 outline-[var(--tv3-blue)]" : ""}`}
              >
                <span className={`flex h-7 w-6 shrink-0 items-center justify-center ${hidden ? "opacity-40" : ""}`} style={{ color: d.style.color }}>
                  <DrawIcon id={d.tool} size={16} />
                </span>
                {renaming === d.id ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    maxLength={80}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={onRenameKey}
                    onClick={(e) => e.stopPropagation()}
                    className="my-0.5 h-6 min-w-0 flex-1 rounded-md border border-[var(--tv3-blue)] bg-transparent px-1.5 text-[14px] text-[var(--tv3-text)] outline-none"
                  />
                ) : (
                  <span
                    title={t("cm.tree.rename")}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setDraft(d.name ?? nameOf(d.tool));
                      setRenaming(d.id);
                    }}
                    className={`min-w-0 flex-1 truncate py-2 text-[14px] ${hidden ? "text-[var(--tv3-muted)]" : "text-[var(--tv3-text)]"}`}
                  >
                    {nameOf(d.tool, d.name)}
                    {hidden && <span className="ml-1.5 text-[10px] uppercase text-[var(--tv3-muted)]">{t("cm.tree.hiddenBadge")}</span>}
                  </span>
                )}
                <button
                  type="button"
                  className={`${iconBtn} ${hidden ? iconBtnOn : ""}`}
                  title={hidden ? t("cm.tree.show") : t("cm.tree.hide")}
                  aria-label={hidden ? t("cm.tree.show") : t("cm.tree.hide")}
                  aria-pressed={hidden}
                  onClick={(e) => {
                    e.stopPropagation();
                    drawings.setHiddenById(d.id, !hidden);
                  }}
                >
                  <DrawIcon id={hidden ? "eyeOff" : "eye"} size={16} />
                </button>
                <button
                  type="button"
                  className={`${iconBtn} ${d.locked ? iconBtnOn : ""}`}
                  title={d.locked ? t("cm.tree.unlock") : t("cm.tree.lock")}
                  aria-label={d.locked ? t("cm.tree.unlock") : t("cm.tree.lock")}
                  aria-pressed={d.locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    drawings.setLockedById(d.id, !d.locked);
                  }}
                >
                  <DrawIcon id={d.locked ? "lock" : "unlock"} size={16} />
                </button>
                <button
                  type="button"
                  className={delCls}
                  title={t("cm.tree.delete")}
                  aria-label={t("cm.tree.delete")}
                  onClick={(e) => {
                    e.stopPropagation();
                    drawings.removeById(d.id);
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </Section>
      )}

      {inds.length > 0 && (
        <Section title={t("cm.tree.indicators")} count={inds.length}>
          {inds.map((inst) => (
            <li key={inst.uid} className={rowCls}>
              <span className="flex h-7 w-4 shrink-0 items-center justify-center">
                <span className="h-2 w-2 rounded-full" style={{ background: dotColor(inst) }} />
              </span>
              <span className={`min-w-0 flex-1 truncate py-2 text-[14px] ${inst.visible ? "text-[var(--tv3-text)]" : "text-[var(--tv3-muted)]"}`}>
                {getIndicatorDef(inst.id)?.label ?? t(`ind.${inst.id}.name`)} <span className="text-[var(--tv3-muted)]">{indicatorSummary(inst.params)}</span>
              </span>
              <button
                type="button"
                className="shrink-0 cursor-pointer px-1 text-[12px] text-[var(--tv3-text2)] hover:text-[var(--tv3-text)]"
                title={inst.visible ? t("cm.tree.hide") : t("cm.tree.show")}
                aria-label={inst.visible ? t("cm.tree.hide") : t("cm.tree.show")}
                aria-pressed={!inst.visible}
                onClick={() => indicators.update(inst.uid, { visible: !inst.visible })}
              >
                {inst.visible ? t("p3.obj.hide") : t("p3.obj.show")}
              </button>
              <button type="button" className={delCls} title={t("cm.tree.delete")} aria-label={t("cm.tree.delete")} onClick={() => indicators.remove(inst.uid)}>
                ×
              </button>
            </li>
          ))}
        </Section>
      )}
    </div>
  );
}
