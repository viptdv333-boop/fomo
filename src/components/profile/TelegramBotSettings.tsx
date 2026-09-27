"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

interface Status {
  connected: boolean;
  verified: boolean;
  botUsername: string | null;
  lastError: string | null;
}

export default function TelegramBotSettings() {
  const { t } = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  function load() {
    fetch("/api/telegram/account")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!token.trim()) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/telegram/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("profile2.tgConnectFailed"));
        return;
      }
      setToken("");
      setInfo(t("profile2.tgSaved", { bot: data.botUsername }));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/telegram/verify", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("profile2.tgVerifyFailed"));
        return;
      }
      setInfo(t("profile2.tgConnectedInfo"));
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await fetch("/api/telegram/account", { method: "DELETE" });
      setInfo("");
      setError("");
      load();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="border-t dark:border-gray-700 pt-4">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("profile2.tgTitle")}</span>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        {t("profile2.tgDesc")}
      </p>

      {!status.verified && (
        <ol className="list-decimal list-inside space-y-0.5 mb-3 text-xs text-gray-600 dark:text-gray-400">
          <li className={status.connected ? "line-through opacity-60" : ""}>
            {t("profile2.tgStep1")}
          </li>
          <li>{t("profile2.tgStep2")}</li>
        </ol>
      )}

      {status.connected && (
        <div className="flex items-center gap-2 mb-2 text-sm">
          <span className={status.verified ? "text-green-600" : "text-amber-500"}>
            {status.verified ? "✅" : "⏳"}
          </span>
          <span className="text-gray-700 dark:text-gray-300">
            @{status.botUsername} {status.verified ? t("profile2.tgConnected") : t("profile2.tgPending")}
          </span>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="ml-auto text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            {t("profile2.tgDisconnect")}
          </button>
        </div>
      )}

      {status.lastError && (
        <p className="text-xs text-red-500 mb-2">{t("profile2.tgLastError", { error: status.lastError })}</p>
      )}

      {!status.verified && (
        <div className="flex flex-col gap-2">
          {!status.connected && (
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("profile2.tgTokenPlaceholder")}
              className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-green-500"
            />
          )}
          <div className="flex gap-2">
            {!status.connected ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || !token.trim()}
                className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleVerify}
                disabled={busy}
                className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {t("profile.confirm")}
              </button>
            )}
          </div>
        </div>
      )}

      {info && <p className="text-xs text-green-600 mt-2">{info}</p>}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}
