"use client";

import { useEffect, useState } from "react";

interface Status {
  connected: boolean;
  verified: boolean;
  botUsername: string | null;
  lastError: string | null;
}

export default function TelegramBotSettings() {
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
        setError(data.error || "Не удалось подключить бота");
        return;
      }
      setToken("");
      setInfo(`Бот @${data.botUsername} сохранён. Откройте его в Telegram, напишите любое сообщение, затем нажмите «Подтвердить».`);
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
        setError(data.error || "Не удалось подтвердить бота");
        return;
      }
      setInfo("Бот подключён — проверьте сообщение в Telegram.");
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
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Telegram-бот для уведомлений</span>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Подключите своего бота (через @BotFather), чтобы получать в нём сообщения из оплаченных каналов, на которые включите пересылку.
      </p>

      {!status.verified && (
        <ol className="list-decimal list-inside space-y-0.5 mb-3 text-xs text-gray-600 dark:text-gray-400">
          <li className={status.connected ? "line-through opacity-60" : ""}>
            Введите токен бота и нажмите «Сохранить»
          </li>
          <li>Отправьте боту любое сообщение в Telegram и нажмите «Подтвердить»</li>
        </ol>
      )}

      {status.connected && (
        <div className="flex items-center gap-2 mb-2 text-sm">
          <span className={status.verified ? "text-green-600" : "text-amber-500"}>
            {status.verified ? "✅" : "⏳"}
          </span>
          <span className="text-gray-700 dark:text-gray-300">
            @{status.botUsername} {status.verified ? "подключён" : "ожидает подтверждения"}
          </span>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="ml-auto text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            Отключить
          </button>
        </div>
      )}

      {status.lastError && (
        <p className="text-xs text-red-500 mb-2">Последняя ошибка отправки: {status.lastError}</p>
      )}

      {!status.verified && (
        <div className="flex flex-col gap-2">
          {!status.connected && (
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Токен бота от @BotFather"
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
                Сохранить
              </button>
            ) : (
              <button
                type="button"
                onClick={handleVerify}
                disabled={busy}
                className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Подтвердить
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
