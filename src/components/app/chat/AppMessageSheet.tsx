"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import AppSheet, { type SheetRow } from "./AppSheet";

export interface MsgAction {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/** Tap on a message: quick reactions and the message actions (reply, mention, edit, delete, pin) in the design's bottom sheet. */
export default function AppMessageSheet({
  author,
  preview,
  reactions,
  mine,
  actions,
  onReact,
  onClose,
}: {
  author: string;
  preview: string;
  reactions: readonly string[];
  mine: string[];
  actions: MsgAction[];
  onReact: (emoji: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const rows: SheetRow[] = actions.map((a) => ({
    key: a.key,
    label: a.label,
    icon: a.icon,
    color: a.danger ? "var(--app-red)" : undefined,
    onClick: a.onSelect,
  }));
  return (
    <AppSheet title={author} onClose={onClose} left={undefined} right={{ label: t("appui.chat.done"), onClick: onClose }} doneLabel={t("appui.chat.done")} sections={[{ key: "a", rows }]} intro={undefined}>
      {preview && <div className="ac-quotepv">{preview}</div>}
      <div className="ac-reacts">
        {reactions.map((e) => (
          <button key={e} type="button" data-on={mine.includes(e) ? "1" : undefined} aria-pressed={mine.includes(e)} onClick={() => onReact(e)}>
            {e}
          </button>
        ))}
      </div>
    </AppSheet>
  );
}
