"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import MenuPopover from "./MenuPopover";
import { CS_ICONS } from "./icons-cs";
import { deleteUserData, listUserData, saveUserData, type UserDataItem } from "@/lib/chart/userdata";
import { INDICATOR_PRESETS, LAYOUT_KIND, TEMPLATE_KIND, isLayout, isTemplate, type ChartLayoutData, type ChartTemplateData } from "@/lib/chart/templates";

interface Props {
  btn: string;
  getTemplate: (withDrawings: boolean) => ChartTemplateData;
  applyTemplate: (d: ChartTemplateData) => void;
  getLayout: () => ChartLayoutData;
  applyLayout: (d: ChartLayoutData) => void;
  /** Replace the indicators of the chart (the ready-made sets). */
  applyIndicators?: (json: string) => void;
}

const field = "h-8 flex-1 min-w-0 rounded-[9px] border border-[#e5e5ea] dark:border-[#3a3a3c] bg-transparent px-2 text-[13px] outline-none focus:border-[var(--tv3-accent)]";

function Panel({ close, getTemplate, applyTemplate, getLayout, applyLayout, applyIndicators }: Omit<Props, "btn"> & { close: () => void }) {
  const { t } = useT();
  const [layouts, setLayouts] = useState<UserDataItem<ChartLayoutData>[]>([]);
  const [templates, setTemplates] = useState<UserDataItem<ChartTemplateData>[]>([]);
  const [layoutName, setLayoutName] = useState("");
  const [tplName, setTplName] = useState("");
  const [withDrawings, setWithDrawings] = useState(false);
  const [msg, setMsg] = useState("");

  const reload = useCallback(async () => {
    const [l, tp] = await Promise.all([listUserData<ChartLayoutData>(LAYOUT_KIND), listUserData<ChartTemplateData>(TEMPLATE_KIND)]);
    setLayouts(l.filter((i) => isLayout(i.data)));
    setTemplates(tp.filter((i) => isTemplate(i.data)));
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2200);
  };

  const saveLayout = async () => {
    const name = layoutName.trim().slice(0, 80);
    if (!name) return;
    const ok = await saveUserData(LAYOUT_KIND, name, getLayout());
    flash(ok ? t("cs.tpl.saved") : t("cs.tpl.saveFailed"));
    setLayoutName("");
    void reload();
  };
  const saveTemplate = async () => {
    const name = tplName.trim().slice(0, 80);
    if (!name) return;
    const ok = await saveUserData(TEMPLATE_KIND, name, getTemplate(withDrawings));
    flash(ok ? t("cs.tpl.saved") : t("cs.tpl.saveFailed"));
    setTplName("");
    void reload();
  };

  const row = (key: string, sub: string | undefined, onApply: () => void, onDelete: () => void) => (
    <div key={key} className="group flex items-center h-8 pl-3 pr-1 hover:bg-[var(--tv3-fill)]">
      <button
        onClick={() => {
          onApply();
          close();
        }}
        className="flex-1 min-w-0 text-left h-full cursor-pointer flex items-baseline gap-2"
        title={t("cs.tpl.apply")}
      >
        <span className="truncate text-[13px] text-[var(--tv3-text)]">{key}</span>
        {sub && <span className="text-[11px] text-[var(--tv3-muted)] shrink-0">{sub}</span>}
      </button>
      <button onClick={onDelete} title={t("cs.tpl.delete")} className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--tv3-muted)] hover:text-red-500 cursor-pointer">
        {CS_ICONS.trash}
      </button>
    </div>
  );

  const presetRow = (id: (typeof INDICATOR_PRESETS)[number]["id"], json: string) => (
    <button
      key={id}
      onClick={() => {
        applyIndicators?.(json);
        flash(t("cs.tpl.presetApplied"));
      }}
      className="w-full flex items-baseline gap-2 min-h-9 pl-3 pr-2 py-1 text-left cursor-pointer hover:bg-[var(--tv3-fill)]"
    >
      <span className="text-[13px] text-[var(--tv3-text)]">{t(`cs.tpl.preset.${id}`)}</span>
      <span className="text-[11px] text-[var(--tv3-muted)] truncate">{t(`cs.tpl.preset.${id}.d`)}</span>
    </button>
  );

  const label = "px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)]";

  return (
    <div className="whitespace-normal">
      <div className="px-3 pt-1 pb-0.5 text-[12px] leading-snug text-[var(--tv3-muted)]">{t("cs.tpl.hint")}</div>
      <div className={label}>{t("cs.tpl.layouts")}</div>
      <div className="flex items-center gap-1.5 px-3 pb-1.5">
        <input value={layoutName} onChange={(e) => setLayoutName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveLayout()} placeholder={t("cs.tpl.namePlaceholder")} maxLength={80} className={field} />
        <button onClick={saveLayout} disabled={!layoutName.trim()} className="h-8 px-3 rounded-[9px] bg-[var(--tv3-accent)] text-white text-[13px] cursor-pointer hover:bg-[var(--tv3-accent-hover)] disabled:opacity-40 disabled:cursor-default">
          {t("cs.tpl.save")}
        </button>
      </div>
      {layouts.length === 0 && <div className="px-3 pb-1 text-[12px] text-[var(--tv3-muted)]">{t("cs.tpl.noLayouts")}</div>}
      {layouts.map((i) => row(i.key, `${i.data.ticker} · ${i.data.interval}`, () => applyLayout(i.data), async () => { await deleteUserData(LAYOUT_KIND, i.key); void reload(); }))}

      <div className="my-1 h-px bg-[var(--tv3-hair)]" />
      <div className={label}>{t("cs.tpl.templates")}</div>
      <div className="flex items-center gap-1.5 px-3 pb-1">
        <input value={tplName} onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveTemplate()} placeholder={t("cs.tpl.namePlaceholder")} maxLength={80} className={field} />
        <button onClick={saveTemplate} disabled={!tplName.trim()} className="h-8 px-3 rounded-[9px] bg-[var(--tv3-accent)] text-white text-[13px] cursor-pointer hover:bg-[var(--tv3-accent-hover)] disabled:opacity-40 disabled:cursor-default">
          {t("cs.tpl.save")}
        </button>
      </div>
      <label className="flex items-center gap-2 px-3 pb-1.5 text-[12px] text-[var(--tv3-text2)] cursor-pointer">
        <input type="checkbox" checked={withDrawings} onChange={(e) => setWithDrawings(e.target.checked)} className="accent-[var(--tv3-accent)]" />
        {t("cs.tpl.withDrawings")}
      </label>
      {templates.length === 0 && <div className="px-3 pb-1 text-[12px] text-[var(--tv3-muted)]">{t("cs.tpl.noTemplates")}</div>}
      {templates.map((i) => row(i.key, i.data.drawings ? t("cs.tpl.hasDrawings") : undefined, () => applyTemplate(i.data), async () => { await deleteUserData(TEMPLATE_KIND, i.key); void reload(); }))}
      {applyIndicators && (
        <>
          <div className="my-1 h-px bg-[var(--tv3-hair)]" />
          <div className={label}>{t("cs.tpl.presets")}</div>
          {INDICATOR_PRESETS.map((p) => presetRow(p.id, p.indicators))}
        </>
      )}
      {msg && <div className="px-3 py-1 text-[12px] text-green-600">{msg}</div>}
    </div>
  );
}

/** Save / open chart layouts (symbol + interval + look) and templates (look only). */
export default function TemplatesMenu({ btn, ...rest }: Props) {
  const { t } = useT();
  return (
    <MenuPopover
      title={t("cs.tpl.title")}
      className={btn}
      width={290}
      align="right"
      trigger={
        <>
          {CS_ICONS.layout}
          <span>{t("cs.tpl.short")}</span>
        </>
      }
    >
      {(close) => <Panel close={close} {...rest} />}
    </MenuPopover>
  );
}
