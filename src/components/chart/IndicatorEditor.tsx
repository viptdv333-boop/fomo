"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { IndicatorsController } from "@/lib/chart/indicators/controller";
import { getScriptStatus, onScriptStatus } from "@/lib/chart/scripts/compute";
import { DOC_SECTIONS } from "@/lib/chart/scripts/docs";
import type { L } from "@/lib/chart/scripts/docs";
import { scriptsSupported } from "@/lib/chart/scripts/runtime";
import {
  deleteScript,
  exportScriptJs,
  exportScriptJson,
  getSavedScript,
  getScript,
  isPersisted,
  parseImported,
  revertScript,
  saveScript,
  saveScriptAs,
  setScriptCode,
  setScriptName,
  subscribeScripts,
} from "@/lib/chart/scripts/store";
import { BLANK_SCRIPT, SCRIPT_TEMPLATES } from "@/lib/chart/scripts/templates";
import { SCRIPT_LIMITS } from "@/lib/chart/scripts/types";
import type { ScriptStatus } from "@/lib/chart/scripts/types";
import { isSignedInForUserData } from "@/lib/chart/userdata";
import ModalPortal from "./ModalPortal";
import ScriptCodeEditor from "./ScriptCodeEditor";
import { IND_ICONS } from "./icons";
import { saveBlobAsFile } from "@/lib/save-file";

/* Editor for user-written indicators (opens as a panel on the right so that the live preview stays visible on the
   chart): code editor, toolbar (save / save as / add to chart / templates / docs / import / export / delete),
   status, problems + console + alert conditions. The script is re-run on the chart 350 ms after the last keystroke. */

const btn =
  "flex h-7 shrink-0 items-center gap-1.5 rounded-[9px] border border-[var(--tv3-fill2)] px-2 text-xs font-medium text-[var(--tv3-text)] hover:bg-[var(--tv3-fill)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)] disabled:cursor-not-allowed disabled:opacity-40";
const btnPrimary =
  "flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--tv3-accent)] px-3 text-xs font-semibold text-white hover:bg-[var(--tv3-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40";
const field =
  "h-7 rounded-[9px] border border-[var(--tv3-fill2)] bg-[var(--tv3-card)] px-2 text-xs text-[var(--tv3-text)] outline-none focus:border-[var(--tv3-accent)] focus:ring-1 focus:ring-[var(--tv3-accent)]";

interface Props {
  controller: IndicatorsController;
  /** Script to edit; null = closed. */
  scriptId: string | null;
  onClose: () => void;
}

export default function IndicatorEditor({ controller, scriptId, onClose }: Props) {
  if (!scriptId || !getScript(scriptId)) return null;
  return (
    <ModalPortal>
      <Body key={scriptId} controller={controller} scriptId={scriptId} onClose={onClose} />
    </ModalPortal>
  );
}

type Confirm = { message: string; onYes: () => void };
type Side = null | "docs" | "tpl";
type Panel = "problems" | "console" | "alerts";

function download(filename: string, text: string, type: string) {
  void saveBlobAsFile(new Blob([text], { type }), filename);
}

function Body({ controller, scriptId, onClose }: { controller: IndicatorsController; scriptId: string; onClose: () => void }) {
  const { t, locale } = useT();
  const [, force] = useReducer((n: number) => n + 1, 0);
  const initial = useRef({ name: getScript(scriptId)!.name, code: getScript(scriptId)!.code });
  const initialCode = useRef(initial.current.code);
  const [code, setCode] = useState(initial.current.code);
  const [name, setName] = useState(initial.current.name);
  const codeRef = useRef(code);
  codeRef.current = code;
  const [status, setStatus] = useState<ScriptStatus | null>(() => getScriptStatus(scriptId));
  const [panel, setPanel] = useState<Panel>("problems");
  const [side, setSide] = useState<Side>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [goto, setGoto] = useState<{ line: number; col?: number; nonce: number } | null>(null);
  const tempUid = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closing = useRef(false);

  /* live data: script registry, worker status, chart instances */
  useEffect(() => subscribeScripts(() => force()), []);
  useEffect(() => controller.subscribe(() => force()), [controller]);
  useEffect(
    () =>
      onScriptStatus((id) => {
        if (id === scriptId) setStatus(getScriptStatus(scriptId));
      }),
    [scriptId],
  );

  /* preview instance on the chart while the editor is open */
  useEffect(() => {
    if (!controller.list().some((i) => i.id === scriptId)) {
      const uid = controller.add(scriptId);
      tempUid.current = uid || null;
    }
    return () => {
      if (tempUid.current) {
        controller.remove(tempUid.current);
        tempUid.current = null;
      }
      if (timer.current) clearTimeout(timer.current);
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, [controller, scriptId]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const flash = (text: string, ok = true) => {
    setNote({ text, ok });
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  };

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setScriptCode(scriptId, codeRef.current);
  }, [scriptId]);

  const onCode = (v: string) => {
    setCode(v);
    codeRef.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setScriptCode(scriptId, v);
    }, 350);
  };

  /** Replaces the code (template, import): applied to the chart at once. */
  const applyCode = (v: string, newName?: string) => {
    setCode(v);
    codeRef.current = v;
    if (timer.current) clearTimeout(timer.current);
    setScriptCode(scriptId, v);
    if (newName) {
      setName(newName);
      setScriptName(scriptId, newName);
    }
    setGoto({ line: 1, nonce: Date.now() });
  };

  const tooBig = code.length > SCRIPT_LIMITS.codeChars;
  const persisted = isPersisted(scriptId);
  const savedRec = getSavedScript(scriptId);
  const dirty = savedRec ? code !== savedRec.code || name !== savedRec.name : code !== initialCode.current || name !== initial.current.name;
  const keptOnChart = controller.list().some((i) => i.id === scriptId && i.uid !== tempUid.current);

  const finish = () => {
    closing.current = true;
    if (tempUid.current) {
      controller.remove(tempUid.current);
      tempUid.current = null;
    }
    onClose();
  };

  const requestClose = () => {
    if (closing.current) return;
    flush();
    if (dirty) {
      setConfirm({
        message: t("isc.discardConfirm"),
        onYes: () => {
          revertScript(scriptId);
          finish();
        },
      });
      return;
    }
    if (!persisted) revertScript(scriptId);
    finish();
  };

  const doSave = async (): Promise<boolean> => {
    flush();
    if (tooBig) {
      flash(t("isc.tooBig", { n: SCRIPT_LIMITS.codeChars }), false);
      return false;
    }
    const ok = await saveScript(scriptId);
    flash(ok ? t("isc.saved") : t("isc.saveFailed"), ok);
    return ok;
  };

  const doApply = async () => {
    if (!(await doSave())) return;
    if (tempUid.current) tempUid.current = null;
    else if (!controller.list().some((i) => i.id === scriptId)) controller.add(scriptId);
    force();
  };

  const doSaveAs = async () => {
    const n = (saveAs ?? "").trim();
    if (!n) return;
    flush();
    const rec = await saveScriptAs(scriptId, n);
    setSaveAs(null);
    if (!rec) {
      flash(t("isc.saveFailed"), false);
      return;
    }
    // the copy becomes the script on the chart; this editor keeps the original
    controller.add(rec.id);
    flash(t("isc.saved"));
  };

  const doDelete = async () => {
    closing.current = true;
    if (tempUid.current) tempUid.current = null;
    for (const i of controller.list()) if (i.id === scriptId) controller.remove(i.uid);
    await deleteScript(scriptId);
    onClose();
  };

  const askOverwrite = (then: () => void) => {
    if (code.trim() === "" || !dirty) then();
    else setConfirm({ message: t("isc.discardConfirm"), onYes: then });
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImported(text, file.name);
      if (!parsed) throw new Error("empty");
      applyCode(parsed.code, parsed.name);
    } catch {
      flash(t("isc.importFailed"), false);
    }
  };

  const doExport = (kind: "json" | "js") => {
    flush();
    const f = kind === "json" ? exportScriptJson(scriptId) : exportScriptJs(scriptId);
    if (f) download(f.filename, f.text, kind === "json" ? "application/json" : "text/javascript");
    setExportOpen(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation(); // the terminal's hotkeys must not react to typing here
    if (e.key === "Escape") {
      e.preventDefault();
      if (confirm) setConfirm(null);
      else if (saveAs !== null) setSaveAs(null);
      else if (exportOpen) setExportOpen(false);
      else requestClose();
    }
  };

  /* status line */
  const err = status?.error ?? null;
  const running = !!status?.pending;
  const statusView = (() => {
    if (!status) return { dot: "bg-gray-400", text: t("isc.st.idle") };
    if (err) return { dot: "bg-red-500", text: t("isc.st.error") };
    if (running) return { dot: "bg-amber-400", text: t("isc.st.running") };
    return { dot: "bg-emerald-500", text: t("isc.st.ok", { ms: status.ms, bars: status.bars }) };
  })();
  const logs = status?.logs ?? [];
  const alerts = status?.alerts ?? [];
  const problemsCount = (err ? 1 : 0) + (status?.shapesCut ? 1 : 0);

  const tab = (id: Panel, label: string, count: number) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={panel === id}
      onClick={() => setPanel(id)}
      className={`flex items-center gap-1 border-b-2 px-2.5 py-1 text-[11px] font-medium ${panel === id ? "border-[var(--tv3-accent)] text-[var(--tv3-text)]" : "border-transparent text-[var(--tv3-muted)] hover:text-[var(--tv3-text)]"}`}
    >
      {label}
      {count > 0 && <span className={`rounded-full px-1.5 text-[10px] leading-4 ${id === "problems" ? "bg-red-500 text-white" : "bg-[var(--tv3-fill2)] text-[var(--tv3-text2)]"}`}>{count}</span>}
    </button>
  );

  const wide = side !== null;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={t("isc.title")}
      onKeyDown={onKeyDown}
      className={`fixed inset-y-0 right-0 z-[75] flex w-full flex-col border-l border-[var(--tv3-hair)] bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)] outline-none ${
        wide ? "lg:w-[min(1080px,94vw)]" : "lg:w-[min(680px,56vw)]"
      }`}
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-[var(--tv3-hair)] px-3 py-2">
        <h2 className="hidden shrink-0 text-sm font-semibold sm:block">{t("isc.title")}</h2>
        <input
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setScriptName(scriptId, e.target.value);
          }}
          aria-label={t("isc.name")}
          placeholder={t("isc.name")}
          className={`${field} min-w-0 flex-1`}
        />
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--tv3-text2)]" role="status" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${statusView.dot}`} />
          <span className="hidden max-w-[180px] truncate sm:inline">{statusView.text}</span>
        </span>
        <button type="button" onClick={requestClose} aria-label={t("isc.close")} title={t("isc.close")} className="shrink-0 rounded-lg p-1.5 text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] hover:text-[var(--tv3-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]">
          {IND_ICONS.close(16)}
        </button>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--tv3-hair)] px-3 py-1.5">
        <button type="button" className={btn} onClick={() => void doSave()} disabled={tooBig}>
          {IND_ICONS.check(14)}
          {t("isc.save")}
          {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title={t("isc.unsaved")} />}
        </button>
        <button type="button" className={btn} onClick={() => setSaveAs(name || "")}>
          {IND_ICONS.copy(14)}
          {t("isc.saveAs")}
        </button>
        <button type="button" className={btnPrimary} onClick={() => void doApply()} disabled={tooBig}>
          {IND_ICONS.plus(14)}
          {keptOnChart ? t("isc.updateOnChart") : t("isc.addToChart")}
        </button>
        <span className="flex-1" />
        <button type="button" className={`${btn} ${side === "tpl" ? "bg-[var(--tv3-fill)]" : ""}`} aria-pressed={side === "tpl"} onClick={() => setSide((s) => (s === "tpl" ? null : "tpl"))}>
          {IND_ICONS.template(14)}
          <span className="hidden sm:inline">{t("isc.templates")}</span>
        </button>
        <button type="button" className={`${btn} ${side === "docs" ? "bg-[var(--tv3-fill)]" : ""}`} aria-pressed={side === "docs"} onClick={() => setSide((s) => (s === "docs" ? null : "docs"))}>
          <span className="font-mono text-[11px] font-bold">?</span>
          <span className="hidden sm:inline">{t("isc.docs")}</span>
        </button>
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
          {t("isc.import")}
        </button>
        <input ref={fileRef} type="file" accept=".json,.js,.txt,application/json,text/javascript,text/plain" className="hidden" onChange={(e) => { void onImportFile(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="relative">
          <button type="button" className={btn} aria-expanded={exportOpen} onClick={() => setExportOpen((o) => !o)}>
            {t("isc.export")}
            {IND_ICONS.chevronDown(12)}
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl bg-[var(--tv3-card)] py-1 text-xs shadow-[var(--tv3-shadow-pop)]">
              <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-[var(--tv3-fill)]" onClick={() => doExport("json")}>{t("isc.exportJson")}</button>
              <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-[var(--tv3-fill)]" onClick={() => doExport("js")}>{t("isc.exportJs")}</button>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`${btn} hover:!border-red-400 hover:!text-[var(--tv3-down)] dark:hover:!text-red-400`}
          onClick={() => setConfirm({ message: t("isc.deleteConfirm", { name: name || "?" }), onYes: () => void doDelete() })}
          title={t("isc.delete")}
          aria-label={t("isc.delete")}
        >
          {IND_ICONS.trash(14)}
        </button>
      </div>

      {/* inline bars: confirm / save as / notes / warnings */}
      {confirm && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-300/50 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="alert">
          <span className="min-w-0 flex-1">{confirm.message}</span>
          <button type="button" className={btnPrimary} onClick={() => { const c = confirm; setConfirm(null); c.onYes(); }}>{t("isc.yes")}</button>
          <button type="button" className={btn} onClick={() => setConfirm(null)}>{t("isc.no")}</button>
        </div>
      )}
      {saveAs !== null && (
        <form
          className="flex items-center gap-2 border-b border-[var(--tv3-hair)] px-3 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void doSaveAs();
          }}
        >
          <input autoFocus value={saveAs} maxLength={80} onChange={(e) => setSaveAs(e.target.value)} placeholder={t("isc.saveAsName")} aria-label={t("isc.saveAsName")} className={`${field} min-w-0 flex-1`} />
          <button type="submit" className={btnPrimary} disabled={!saveAs.trim()}>{t("isc.save")}</button>
          <button type="button" className={btn} onClick={() => setSaveAs(null)}>{t("isc.no")}</button>
        </form>
      )}
      {(note || !scriptsSupported() || tooBig) && (
        <div className={`px-3 py-1 text-[11px] ${note?.ok === false || tooBig || !scriptsSupported() ? "bg-red-500/10 text-[var(--tv3-down)]" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {note?.text ?? (tooBig ? t("isc.tooBig", { n: SCRIPT_LIMITS.codeChars }) : t("isc.unsupported"))}
        </div>
      )}

      {/* body: editor + optional side panel */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={`min-h-0 min-w-0 flex-1 flex-col ${side ? "hidden lg:flex" : "flex"}`}>
          <ScriptCodeEditor value={code} onChange={onCode} onSave={() => void doSave()} errorLine={err?.line ?? null} goto={goto} ariaLabel={t("isc.editSource")} />

          {/* output */}
          <div className="flex h-[132px] shrink-0 flex-col border-t border-[var(--tv3-hair)]">
            <div role="tablist" className="flex items-center border-b border-[var(--tv3-hair)]">
              {tab("problems", t("isc.out.problems"), problemsCount)}
              {tab("console", t("isc.out.console"), logs.length)}
              {tab("alerts", t("isc.out.alertsTab"), alerts.length)}
              <span className="flex-1" />
              <span className="hidden pr-3 text-[10px] text-[var(--tv3-muted)] sm:inline">{t("isc.keys")}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[12px]" role="tabpanel">
              {panel === "problems" && (
                <>
                  {err ? (
                    <div className="flex items-start gap-2 text-[var(--tv3-down)]">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{err.message}</span>
                      {err.line ? (
                        <button type="button" className="shrink-0 rounded-lg px-1.5 text-[11px] underline hover:bg-red-500/10" onClick={() => setGoto({ line: err.line!, col: err.col ?? 1, nonce: Date.now() })}>
                          {t("isc.out.line", { line: err.line })}
                          {err.col ? `:${err.col}` : ""}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    !status?.shapesCut && <span className="text-[var(--tv3-muted)]">{t("isc.out.none")}</span>
                  )}
                  {status?.shapesCut && <div className="text-amber-600 dark:text-amber-400">{t("isc.out.shapesCut")}</div>}
                </>
              )}
              {panel === "console" &&
                (logs.length ? logs.map((x, i) => <div key={i} className="whitespace-pre-wrap break-words text-[var(--tv3-text)]">{x}</div>) : <span className="text-[var(--tv3-muted)]">{t("isc.out.consoleEmpty")}</span>)}
              {panel === "alerts" &&
                (alerts.length ? (
                  alerts.map((a, i) => (
                    <div key={i} className="text-[var(--tv3-text)]">
                      {t("isc.out.alertRow", { message: a.message || "—", n: a.count })}
                      {a.last && <span className="ml-2 rounded bg-emerald-500/15 px-1 text-emerald-600 dark:text-emerald-400">{t("isc.out.alertLast")}</span>}
                    </div>
                  ))
                ) : (
                  <span className="text-[var(--tv3-muted)]">{t("isc.out.none")}</span>
                ))}
            </div>
          </div>
        </div>

        {side && (
          <aside className="flex min-h-0 min-w-0 flex-1 flex-col border-[var(--tv3-hair)] lg:w-[400px] lg:flex-none lg:border-l">
            <div className="flex items-center justify-between border-b border-[var(--tv3-hair)] px-3 py-1.5">
              <h3 className="text-xs font-semibold">{side === "docs" ? t("isc.docs.title") : t("isc.templates")}</h3>
              <button type="button" onClick={() => setSide(null)} aria-label={t("isc.close")} className="rounded-lg p-1 text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)]">
                {IND_ICONS.close(14)}
              </button>
            </div>
            {side === "docs" ? (
              <DocsPanel locale={locale} />
            ) : (
              <TemplatesPanel
                onPick={(tplName, tplCode) => askOverwrite(() => { applyCode(tplCode, tplName); setSide(null); })}
              />
            )}
          </aside>
        )}
      </div>

      {isSignedInForUserData() === false && <p className="border-t border-[var(--tv3-hair)] px-3 py-1 text-[10px] text-[var(--tv3-muted)]">{t("isc.local")}</p>}
    </div>
  );
}

/* ───────────── side panels ───────────── */

function pick(l: L, locale: string): string {
  return locale === "en" ? l.en : locale === "cn" ? l.cn : l.ru;
}

function TemplatesPanel({ onPick }: { onPick: (name: string, code: string) => void }) {
  const { t } = useT();
  const list = [{ id: "blank", name: t("isc.tpl.blank"), code: BLANK_SCRIPT }, ...SCRIPT_TEMPLATES.map((x) => ({ id: x.id, name: x.name, code: x.code }))];
  return (
    <ul className="min-h-0 flex-1 divide-y divide-[var(--tv3-hair2)] overflow-y-auto">
      {list.map((x) => (
        <li key={x.id}>
          <button type="button" onClick={() => onPick(x.id === "blank" ? t("isc.tpl.blank") : x.name, x.code)} className="block w-full px-3 py-2 text-left hover:bg-[var(--tv3-fill3)] focus:bg-[var(--tv3-fill3)] focus:outline-none">
            <span className="block text-xs font-semibold">{t(`isc.tpl.${x.id}`)}</span>
            <span className="mt-0.5 block text-[11px] text-[var(--tv3-muted)]">{t(`isc.tpl.${x.id}.d`)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CodeBlock({ code }: { code: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return (
    <div className="group relative my-2">
      <pre className="overflow-x-auto rounded border border-[var(--tv3-hair)] bg-[var(--tv3-fill3)] p-2 font-mono text-[11px] leading-[16px] text-[var(--tv3-text)]">{code}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          });
        }}
        className="absolute right-1.5 top-1.5 rounded-[9px] border border-[var(--tv3-fill2)] bg-[var(--tv3-card)] px-1.5 py-0.5 text-[10px] text-[var(--tv3-text2)] opacity-0 hover:bg-[var(--tv3-fill)] focus:opacity-100 group-hover:opacity-100"
      >
        {done ? t("isc.copied") : t("isc.copy")}
      </button>
    </div>
  );
}

function DocsPanel({ locale }: { locale: string }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const sections = useMemo(() => {
    if (!query) return DOC_SECTIONS;
    return DOC_SECTIONS.map((s) => ({
      ...s,
      blocks: s.blocks
        .map((b) => (b.k === "api" ? { ...b, rows: b.rows.filter(([sig, d]) => sig.toLowerCase().includes(query) || pick(d, locale).toLowerCase().includes(query)) } : b))
        .filter((b) => (b.k === "api" ? b.rows.length > 0 : pick(s.title, locale).toLowerCase().includes(query) || (b.k === "p" ? pick(b.t, locale).toLowerCase().includes(query) : b.c.toLowerCase().includes(query)))),
    })).filter((s) => s.blocks.length > 0);
  }, [query, locale]);

  const body: ReactNode = sections.length === 0 ? (
    <p className="p-4 text-center text-xs text-[var(--tv3-muted)]">{t("isc.docs.empty")}</p>
  ) : (
    sections.map((s) => (
      <section key={s.id} className="mb-5">
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">{pick(s.title, locale)}</h4>
        {s.blocks.map((b, i) =>
          b.k === "p" ? (
            <p key={i} className="my-1.5 text-xs leading-relaxed text-[var(--tv3-text2)]">{pick(b.t, locale)}</p>
          ) : b.k === "code" ? (
            <CodeBlock key={i} code={b.c} />
          ) : (
            <dl key={i} className="my-1.5 divide-y divide-[var(--tv3-hair2)] rounded border border-[var(--tv3-hair)]">
              {b.rows.map(([sig, d]) => (
                <div key={sig} className="px-2 py-1.5">
                  <dt className="break-words font-mono text-[11px] font-semibold text-[var(--tv3-accent)] dark:text-[#82aaff]">{sig}</dt>
                  <dd className="mt-0.5 text-[11px] leading-snug text-[var(--tv3-text2)]">{pick(d, locale)}</dd>
                </div>
              ))}
            </dl>
          ),
        )}
      </section>
    ))
  );

  return (
    <>
      <div className="border-b border-[var(--tv3-hair)] p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("isc.docs.search")} aria-label={t("isc.docs.search")} className={`${field} w-full`} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">{body}</div>
    </>
  );
}
