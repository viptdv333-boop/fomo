"use client";
import { useEffect, useState } from "react";

export default function GlobalProviderKeys() {
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState("twelvedata");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch("/api/admin/provider-keys", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((v) => { if (v) setStatus(v.providers.some((p: { provider: string; enabled: boolean }) => p.provider === provider && p.enabled) ? "Ключ сохранён" : "Ключ не задан"); }).catch(() => {}); }, [provider]);
  async function save() {
    setBusy(true); setStatus("");
    try { const r = await fetch("/api/admin/provider-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, key }) }); const data = await r.json(); setStatus(r.ok ? "Ключ сохранён" : data.error || "Ошибка сохранения"); if (r.ok) setKey(""); }
    catch { setStatus("Не удалось связаться с сервером"); }
    finally { setBusy(false); }
  }
  async function remove() { setBusy(true); try { const r = await fetch(`/api/admin/provider-keys?provider=${provider}`, { method: "DELETE" }); setStatus(r.ok ? "Ключ удалён" : "Ошибка удаления"); } catch { setStatus("Не удалось связаться с сервером"); } finally { setBusy(false); } }
  return <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-4"><h2 className="font-semibold dark:text-gray-100">Общие ключи провайдеров</h2><p className="text-sm text-gray-500 mt-1">Общие источники данных для терминалов.</p><div className="flex flex-wrap gap-2 mt-3"><select value={provider} onChange={(e) => { setProvider(e.target.value); setKey(""); }} className="px-3 py-2 border rounded-lg dark:bg-gray-900 dark:text-white"><option value="twelvedata">Twelve Data</option><option value="databento">Databento</option></select><input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="API-ключ" className="flex-1 min-w-0 px-3 py-2 border rounded-lg dark:bg-gray-900 dark:text-white" /><button type="button" disabled={!key || busy} onClick={() => void save()} className="rounded-lg bg-green-600 px-4 py-2 text-white disabled:opacity-50">{busy ? "Проверка…" : "Сохранить"}</button><button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg bg-gray-100 dark:bg-gray-700 px-4 py-2 dark:text-white">Удалить</button></div><p role="status" className="text-sm text-gray-500 mt-2">{status}</p></section>;
}
