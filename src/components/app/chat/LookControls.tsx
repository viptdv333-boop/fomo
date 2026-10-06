"use client";

import { useT } from "@/lib/i18n/client";
import { CHAT_BGS, FONT_MAX, FONT_MIN } from "@/lib/app-chat";
import type { useChatLook } from "./useChatPrefs";

/** The old settings gear's «Фон чата» swatches and text-size slider (0..10), drawn as two design cards of a sheet. */
export default function LookControls({ look }: { look: ReturnType<typeof useChatLook> }) {
  const { t } = useT();
  return (
    <>
      <div className="ac-sec">
        <div className="ac-sectitle">{t("chat2.chatBackground")}</div>
        <div className="ac-secbox">
          <div className="ac-swatches">
            {CHAT_BGS.map((b) => (
              <button
                key={b.id}
                type="button"
                className="ac-swatch"
                data-on={look.bg === b.id ? "1" : undefined}
                aria-pressed={look.bg === b.id}
                aria-label={t(b.labelKey)}
                title={t(b.labelKey)}
                style={b.css ? { backgroundImage: b.css } : undefined}
                onClick={() => look.setBg(b.id)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="ac-sec">
        <div className="ac-sectitle">
          {t("msg.fontSize")} {look.font}
        </div>
        <div className="ac-secbox">
          <div className="ac-slider">
            <span>{FONT_MIN}</span>
            <input type="range" min={FONT_MIN} max={FONT_MAX} step={1} value={look.font} aria-label={t("msg.fontSize")} onChange={(e) => look.setFont(Number(e.target.value))} />
            <span>{FONT_MAX}</span>
          </div>
        </div>
      </div>
    </>
  );
}
