"use client";

import { useEffect, useState } from "react";
import { reloadOnceForChunkError } from "@/lib/chunk-reload";
import { forceUpdate } from "@/lib/force-update";

// Replaces the root layout when it crashes, so it cannot use the i18n provider.
const TEXT = {
  ru: { title: "Сайт обновился", body: "Нужно обновить страницу.", button: "Обновить" },
  en: { title: "The site was updated", body: "Please reload the page.", button: "Reload" },
  zh: { title: "网站已更新", body: "请刷新页面。", button: "刷新" },
} as const;

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [lang, setLang] = useState<keyof typeof TEXT>("ru");

  useEffect(() => {
    const l = (navigator.language || "ru").toLowerCase();
    setLang(l.startsWith("zh") ? "zh" : l.startsWith("ru") ? "ru" : "en");
    reloadOnceForChunkError(error);
  }, [error]);

  const t = TEXT[lang];
  return (
    <html lang={lang === "zh" ? "zh-CN" : lang}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f9fafb", color: "#111827" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 16, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>{t.title}</h1>
          <p style={{ margin: 0, color: "#6b7280" }}>{t.body}</p>
          <button
            onClick={() => forceUpdate()}
            style={{ background: "#16a34a", color: "#fff", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 15, cursor: "pointer" }}
          >
            {t.button}
          </button>
        </div>
      </body>
    </html>
  );
}
