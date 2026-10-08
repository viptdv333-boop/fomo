"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import AppIcon from "../AppIcon";
import { useBackLayer } from "../useBackLayer";

/** One row of a sheet or a pushed screen: the design's R() row (icon tile, label, sub, check / chevron, action buttons). */
export interface SheetRow {
  key: string;
  label: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tileBg?: string;
  tileFg?: string;
  color?: string;
  value?: ReactNode;
  check?: boolean;
  chev?: boolean;
  /** the design's switch (51x31): on / off, tapping the row calls onClick */
  toggle?: boolean;
  actions?: { label: string; tone?: "danger" | "primary"; onClick: () => void }[];
  field?: { value: string; ph: string; onChange: (v: string) => void; maxLength?: number; type?: string; inputMode?: "text" | "numeric" | "decimal" | "email" | "url" | "tel"; autoComplete?: string; multiline?: boolean; mono?: boolean };
  onClick?: () => void;
  /** profile screens: red pill (the «Финансы» row), colour / weight of the value, dimmed row, the design's channel chips, an input at the right (calculator-style), free content under the label */
  badge?: string | number;
  valueColor?: string;
  valueWeight?: number;
  disabled?: boolean;
  chips?: { key: string; label: string; on: boolean; locked?: boolean; onClick?: () => void }[];
  inline?: { value: string; ph: string; onChange: (v: string) => void; inputMode?: "text" | "numeric" | "decimal"; type?: string };
  extra?: ReactNode;
  /** a complete custom row (its own `ac-sr` markup) instead of the generated one; may render nothing */
  node?: ReactNode;
}

export interface SheetSection {
  key: string;
  title?: string | null;
  footer?: ReactNode;
  rows: SheetRow[];
}

/** Rows of one section: a card with hairline separators (the last row has none). */
export function SectionBox({ rows }: { rows: SheetRow[] }) {
  return (
    <div className="ac-secbox">
      {rows.map((r) => {
        if (r.node !== undefined) return <Fragment key={r.key}>{r.node}</Fragment>;
        const body = (
          <>
            {r.icon !== undefined && r.icon !== null && (
              <div className="ac-sr-ico" style={{ background: r.tileBg, color: r.tileFg }}>
                {r.icon}
              </div>
            )}
            <div className="ac-sr-body">
              <div className="ac-sr-txt">
                <div className="ac-sr-label" style={{ color: r.color }}>
                  {r.label}
                </div>
                {r.sub ? <div className="ac-sr-sub">{r.sub}</div> : null}
                {r.field && !r.field.multiline && (
                  <input
                    className="ac-sfield"
                    data-mono={r.field.mono ? "1" : undefined}
                    type={r.field.type}
                    inputMode={r.field.inputMode}
                    autoComplete={r.field.autoComplete}
                    value={r.field.value}
                    placeholder={r.field.ph}
                    maxLength={r.field.maxLength}
                    onChange={(e) => r.field!.onChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {r.field && r.field.multiline && (
                  <textarea
                    className="ac-sfield ac-sfield-area"
                    rows={3}
                    value={r.field.value}
                    placeholder={r.field.ph}
                    maxLength={r.field.maxLength}
                    onChange={(e) => r.field!.onChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {r.chips && (
                  <div className="ap-chips">
                    {r.chips.map((c) => (
                      <span
                        key={c.key}
                        role="button"
                        tabIndex={c.locked ? -1 : 0}
                        aria-pressed={c.on}
                        className="ap-chip"
                        data-on={c.on ? "1" : undefined}
                        data-locked={c.locked ? "1" : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!c.locked) c.onClick?.();
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && !c.locked) {
                            e.preventDefault();
                            e.stopPropagation();
                            c.onClick?.();
                          }
                        }}
                      >
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
                {r.extra}
                {r.actions && (
                  <div className="ac-acts">
                    {r.actions.map((a) => (
                      <span
                        key={a.label}
                        role="button"
                        tabIndex={0}
                        className="ac-act"
                        data-tone={a.tone}
                        onClick={(e) => {
                          e.stopPropagation();
                          a.onClick();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            a.onClick();
                          }
                        }}
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {r.inline && (
                <input
                  className="ap-inl"
                  type={r.inline.type}
                  inputMode={r.inline.inputMode}
                  value={r.inline.value}
                  placeholder={r.inline.ph}
                  onChange={(e) => r.inline!.onChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              {r.value ? (
                <div className="ac-sr-val" style={{ color: r.valueColor, fontWeight: r.valueWeight }}>
                  {r.value}
                </div>
              ) : null}
              {r.badge !== undefined && r.badge !== "" && r.badge !== 0 ? <div className="ap-badge">{r.badge}</div> : null}
              {r.toggle !== undefined && (
                <div className="ac-tg" data-on={r.toggle ? "1" : undefined} role="switch" aria-checked={r.toggle}>
                  <div />
                </div>
              )}
              {r.check && (
                <div className="ac-sr-chk">
                  <AppIcon name="check" size={22} stroke={1.8} />
                </div>
              )}
              {r.chev && (
                <div className="ac-sr-chev">
                  <AppIcon name="chevR" size={18} stroke={1.8} />
                </div>
              )}
            </div>
          </>
        );
        return r.onClick && !r.disabled ? (
          <button key={r.key} type="button" className="ac-sr" onClick={r.onClick}>
            {body}
          </button>
        ) : (
          <div key={r.key} className="ac-sr" data-disabled={r.disabled ? "1" : undefined}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function Sections({ sections }: { sections: SheetSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.key} className="ac-sec">
          {s.title ? <div className="ac-sectitle">{s.title}</div> : null}
          {s.rows.length > 0 && <SectionBox rows={s.rows} />}
          {s.footer ? <div className="ac-secfoot">{s.footer}</div> : null}
        </div>
      ))}
    </>
  );
}

export interface AppSheetProps {
  title: string;
  onClose: () => void;
  left?: { label: string; onClick: () => void };
  right?: { label: string; onClick: () => void } | null;
  search?: { value: string; ph: string; onChange: (v: string) => void };
  segs?: { key: string; label: string; on: boolean; onClick: () => void }[];
  intro?: ReactNode;
  sections?: SheetSection[];
  btn?: { label: string; disabled?: boolean; onClick: () => void };
  /** "full": fixed 88% height (long lists keep the sheet from jumping while the search filters it) */
  height?: "auto" | "full";
  children?: ReactNode;
  /** draw the children above the sections (the message sheet: reactions, then actions); by default they follow them */
  childrenFirst?: boolean;
  doneLabel: string;
}

/** The design's bottom sheet (SH): grip, 46px title bar (left / title / right), body, optional big button. Slides up with fomoUp. */
export default function AppSheet(p: AppSheetProps) {
  useBackLayer(true, p.onClose); // the Android Back button closes the sheet (src/lib/app-back.ts)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [p]);
  const right = p.right === undefined ? { label: p.doneLabel, onClick: p.onClose } : p.right;
  const node = (
    <div className="ac-sheet-wrap" role="dialog" aria-modal="true" aria-label={p.title}>
      <div className="ac-sheet-back" onClick={p.onClose} />
      <div className="ac-sheet ac" data-h={p.height === "full" ? "full" : undefined}>
        <div className="ac-grip">
          <div />
        </div>
        <div className="ac-sbar">
          <div role="button" tabIndex={0} onClick={p.left?.onClick}>
            {p.left?.label}
          </div>
          <div>{p.title}</div>
          <div role="button" tabIndex={0} onClick={right?.onClick}>
            {right?.label}
          </div>
        </div>
        <div className="ac-sbody">
          {p.search && (
            <div className="ac-search">
              <AppIcon name="search" size={18} stroke={1.8} />
              <input value={p.search.value} placeholder={p.search.ph} onChange={(e) => p.search!.onChange(e.target.value)} autoFocus={false} />
            </div>
          )}
          {p.segs && (
            <div className="ac-segs">
              {p.segs.map((s) => (
                <button key={s.key} type="button" data-on={s.on ? "1" : undefined} onClick={s.onClick}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {p.intro ? <div className="ac-sintro">{p.intro}</div> : null}
          {p.childrenFirst && p.children}
          {p.sections && <Sections sections={p.sections} />}
          {!p.childrenFirst && p.children}
        </div>
        {p.btn && (
          <button type="button" className="ac-sbtn" disabled={p.btn.disabled} onClick={p.btn.onClick}>
            {p.btn.label}
          </button>
        )}
      </div>
    </div>
  );
  // portal to <body>: html.app-ui wraps everything, but a fixed layer inside <main> would be clipped by its overflow
  return typeof document === "undefined" ? null : createPortal(node, document.body);
}
