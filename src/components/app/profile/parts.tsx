"use client";

import type { ReactNode } from "react";
import AppIcon from "../AppIcon";
import AppSheet from "../chat/AppSheet";
import { useProf } from "./ProfileCtx";

export interface NavAction {
  key: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

/** The design's pushed-screen bar: «‹ Профиль», the title in the middle, up to two text buttons at the right. */
export function Nav({ title, right }: { title: string; right?: NavAction[] }) {
  const { t, back } = useProf();
  return (
    <div className="ac-nav">
      <button type="button" className="ac-back" onClick={back} aria-label={t("common.back")}>
        <AppIcon name="chevL" size={22} stroke={1.8} />
        <span>{t("profile.profile")}</span>
      </button>
      <div className="ac-navtitle">{title}</div>
      <div className="ap-navright">
        {(right ?? []).map((a) => (
          <button key={a.key} type="button" className="ap-navbtn" disabled={a.disabled} onClick={a.onClick}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A pushed screen: the bar, then the page (optional intro text under it, as in the design). */
export function ScreenFrame({ title, intro, right, children }: { title: string; intro?: ReactNode; right?: NavAction[]; children: ReactNode }) {
  return (
    <>
      <Nav title={title} right={right} />
      <div className="ac-page">
        {intro ? <div className="ac-intro">{intro}</div> : null}
        {children}
      </div>
    </>
  );
}

export function Loading({ label }: { label: string }) {
  return <div className="ap-loading">{label}</div>;
}

/** The design's `picker` sheet: a list of options with a check on the chosen one; tapping one picks it and closes the sheet. */
export function PickerSheet<K extends string>({
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  title: string;
  options: { key: K; label: string }[];
  value: K;
  onPick: (k: K) => void;
  onClose: () => void;
}) {
  const { t } = useProf();
  return (
    <AppSheet
      title={title}
      onClose={onClose}
      doneLabel={t("appui.chat.done")}
      sections={[
        {
          key: "o",
          rows: options.map((o) => ({
            key: o.key,
            label: o.label,
            check: o.key === value,
            onClick: () => {
              onPick(o.key);
              onClose();
            },
          })),
        },
      ]}
    />
  );
}
