"use client";

import { useT } from "@/lib/i18n/client";

/** Title bar of the macOS-style terminal window (design "FOMO Terminal macOS v2"): "FOMO Terminal — <instrument> · <timeframe>" and the way back to the classic look. */
export default function MacTitleBar({ title, onClassic }: { title: string; onClassic: () => void }) {
  const { t } = useT();
  return (
    <div className="tvmac-title" data-tv="title">
      <span className="tvmac-title-spacer" />
      <div className="tvmac-title-text">
        FOMO Terminal<span className="tvmac-title-sub"> — {title}</span>
      </div>
      <button type="button" onClick={onClassic} title={t("mac.classicTip")} className="tvmac-classic">
        {t("mac.classic")}
      </button>
    </div>
  );
}
