"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";
import { useT } from "@/lib/i18n/client";
import type { IndicatorsControllerLike } from "@/lib/chart/contracts";
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
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-200/70 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-700/60 dark:hover:text-gray-200";
const iconBtnOn = "!text-blue-600 dark:!text-blue-400";

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="py-1">
      <h3 className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
        <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">{count}</span>
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function indicatorSummary(params: Record<string, string | number | boolean>): string {
  const nums = Object.values(params).filter((v) => typeof v === "number").slice(0, 3);
  return nums.length ? `(${nums.join(", ")})` : "";
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
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t("cm.tree.empty")}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{t("cm.tree.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {inds.length > 0 && (
        <Section title={t("cm.tree.indicators")} count={inds.length}>
          {inds.map((inst) => (
            <li key={inst.uid} className="group flex items-center gap-1 px-2 hover:bg-gray-50 dark:hover:bg-gray-800/60">
              <span className="flex h-7 w-6 shrink-0 items-center justify-center text-gray-400">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 14.5c2.6-8 5.4-8 8-2.5s5.4 5.5 10-4" />
                </svg>
              </span>
              <span className={`min-w-0 flex-1 truncate py-1.5 text-[13px] ${inst.visible ? "text-gray-800 dark:text-gray-100" : "text-gray-400 line-through dark:text-gray-500"}`}>
                {getIndicatorDef(inst.id)?.label ?? t(`ind.${inst.id}.name`)} <span className="text-gray-400 dark:text-gray-500">{indicatorSummary(inst.params)}</span>
              </span>
              <button
                type="button"
                className={`${iconBtn} ${inst.visible ? "" : iconBtnOn}`}
                title={inst.visible ? t("cm.tree.hide") : t("cm.tree.show")}
                aria-label={inst.visible ? t("cm.tree.hide") : t("cm.tree.show")}
                aria-pressed={!inst.visible}
                onClick={() => indicators.update(inst.uid, { visible: !inst.visible })}
              >
                <DrawIcon id={inst.visible ? "eye" : "eyeOff"} size={16} />
              </button>
              <button type="button" className={`${iconBtn} hover:!text-red-500`} title={t("cm.tree.delete")} aria-label={t("cm.tree.delete")} onClick={() => indicators.remove(inst.uid)}>
                <DrawIcon id="trash" size={16} />
              </button>
            </li>
          ))}
        </Section>
      )}

      {rows.length > 0 && (
        <Section title={t("cm.tree.drawings")} count={rows.length}>
          {rows.map((d) => {
            const on = selected.has(d.id);
            const hidden = !!d.hidden;
            return (
              <li
                key={d.id}
                onClick={(e) => pick(e, d.id, hidden)}
                className={`group flex cursor-pointer items-center gap-1 px-2 ${on ? "bg-blue-50 dark:bg-blue-500/10" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"}`}
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
                    className="my-0.5 h-6 min-w-0 flex-1 rounded border border-blue-500 bg-transparent px-1.5 text-[13px] text-gray-900 outline-none dark:text-gray-100"
                  />
                ) : (
                  <span
                    title={t("cm.tree.rename")}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setDraft(d.name ?? nameOf(d.tool));
                      setRenaming(d.id);
                    }}
                    className={`min-w-0 flex-1 truncate py-1.5 text-[13px] ${hidden ? "text-gray-400 dark:text-gray-500" : "text-gray-800 dark:text-gray-100"}`}
                  >
                    {nameOf(d.tool, d.name)}
                    {hidden && <span className="ml-1.5 text-[10px] uppercase text-gray-400">{t("cm.tree.hiddenBadge")}</span>}
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
                  className={`${iconBtn} hover:!text-red-500`}
                  title={t("cm.tree.delete")}
                  aria-label={t("cm.tree.delete")}
                  onClick={(e) => {
                    e.stopPropagation();
                    drawings.removeById(d.id);
                  }}
                >
                  <DrawIcon id="trash" size={16} />
                </button>
              </li>
            );
          })}
        </Section>
      )}
    </div>
  );
}
