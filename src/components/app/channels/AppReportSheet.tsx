"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import AppSheet from "../chat/AppSheet";
import "../chat/app-chat.css";
import "./app-channels.css";

const REASONS: { code: string; key: string }[] = [
  { code: "spam", key: "feed2.reportSpam" },
  { code: "fraud", key: "feed2.reportFraud" },
  { code: "inappropriate", key: "feed2.reportInappropriate" },
  { code: "misleading", key: "feed2.reportMisleading" },
];

/** The design's «Пожаловаться» sheet (a list of reasons) over the site's report endpoint, for a channel or an author. */
export default function AppReportSheet({ target, onClose, flash }: { target: { type: "channel" | "author"; id: string }; onClose: () => void; flash: (m: string) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  async function send(reason: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: target.type, targetId: target.id, reason }) });
      const j = await r.json().catch(() => ({}));
      flash(r.ok ? t("report.sent") : j.error || t("appch.actionFailed"));
    } catch {
      flash(t("appch.actionFailed"));
    }
    setBusy(false);
    onClose();
  }

  return (
    <AppSheet
      title={t("report.button")}
      onClose={onClose}
      left={{ label: t("common.cancel"), onClick: onClose }}
      right={null}
      doneLabel={t("appui.chat.done")}
      intro={t(target.type === "channel" ? "appch.reportChannel" : "appch.reportAuthor")}
      sections={[{ key: "r", rows: REASONS.map((r) => ({ key: r.code, label: t(r.key), chev: true, onClick: () => void send(r.code) })) }]}
    />
  );
}
