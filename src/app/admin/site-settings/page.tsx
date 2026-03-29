"use client";

import { useEffect, useState } from "react";

interface Settings {
  metaTitle: string;
  metaDescription: string | null;
  faviconUrl: string | null;
  headerCode: string | null;
  footerCode: string | null;
  headerCodePages: string[];
  footerCodePages: string[];
}

export default function SiteSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [headerAllPages, setHeaderAllPages] = useState(true);
  const [footerAllPages, setFooterAllPages] = useState(true);

  useEffect(() => {
    fetch("/api/admin/site-settings")
      .then(r => r.json())
      .then((data: Settings) => {
        setSettings(data);
        setHeaderAllPages(!data.headerCodePages || data.headerCodePages.length === 0);
        setFooterAllPages(!data.footerCodePages || data.footerCodePages.length === 0);
      });
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const body = {
        ...settings,
        headerCodePages: headerAllPages ? [] : settings.headerCodePages,
        footerCodePages: footerAllPages ? [] : settings.footerCodePages,
      };
      const res = await fetch("/api/admin/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setSettings(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="text-gray-500">Загрузка...</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold dark:text-gray-100 mb-6">Настройки сайта</h1>

      <div className="space-y-6">
        {/* Meta Title */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Мета-заголовок (title)
          </label>
          <input
            type="text"
            value={settings.metaTitle}
            onChange={e => setSettings({ ...settings, metaTitle: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            placeholder="FOMO — Find Opportunities, Manage Outcomes"
          />
          <p className="text-xs text-gray-400 mt-1">Отображается во вкладке браузера и в поисковой выдаче</p>
        </div>

        {/* Meta Description */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Мета-описание
          </label>
          <textarea
            value={settings.metaDescription || ""}
            onChange={e => setSettings({ ...settings, metaDescription: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            placeholder="Торговая платформа нового поколения"
          />
        </div>

        {/* Favicon */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Favicon (URL или путь)
          </label>
          <div className="flex items-center gap-3">
            {settings.faviconUrl && (
              <img src={settings.faviconUrl} alt="favicon" className="w-8 h-8 rounded" />
            )}
            <input
              type="text"
              value={settings.faviconUrl || ""}
              onChange={e => setSettings({ ...settings, faviconUrl: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
              placeholder="/favicon.ico или https://..."
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">Загрузите файл в /public/favicon.ico или укажите URL</p>
        </div>

        {/* Header Code */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Код в &lt;head&gt;
          </label>
          <p className="text-xs text-gray-400 mb-2">Счётчики аналитики, коды подтверждения поисковиков, стили и т.д.</p>
          <textarea
            value={settings.headerCode || ""}
            onChange={e => setSettings({ ...settings, headerCode: e.target.value })}
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
            placeholder={'<meta name="google-site-verification" content="..." />\n<script async src="https://www.googletagmanager.com/gtag/js?id=..."></script>'}
          />
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={headerAllPages}
              onChange={e => setHeaderAllPages(e.target.checked)}
              id="headerAll"
              className="rounded"
            />
            <label htmlFor="headerAll" className="text-sm text-gray-600 dark:text-gray-400">
              На всех страницах
            </label>
          </div>
          {!headerAllPages && (
            <input
              type="text"
              value={(settings.headerCodePages || []).join(", ")}
              onChange={e => setSettings({ ...settings, headerCodePages: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              className="w-full mt-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              placeholder="/, /instruments, /feed — через запятую"
            />
          )}
        </div>

        {/* Footer Code */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Код перед &lt;/body&gt;
          </label>
          <p className="text-xs text-gray-400 mb-2">Скрипты аналитики, чат-боты, пиксели и т.д.</p>
          <textarea
            value={settings.footerCode || ""}
            onChange={e => setSettings({ ...settings, footerCode: e.target.value })}
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
            placeholder={'<!-- Yandex.Metrika counter -->\n<script type="text/javascript">...</script>'}
          />
          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={footerAllPages}
              onChange={e => setFooterAllPages(e.target.checked)}
              id="footerAll"
              className="rounded"
            />
            <label htmlFor="footerAll" className="text-sm text-gray-600 dark:text-gray-400">
              На всех страницах
            </label>
          </div>
          {!footerAllPages && (
            <input
              type="text"
              value={(settings.footerCodePages || []).join(", ")}
              onChange={e => setSettings({ ...settings, footerCodePages: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
              className="w-full mt-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
              placeholder="/, /instruments, /feed — через запятую"
            />
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          {saved && <span className="text-green-600 text-sm font-medium">✓ Сохранено</span>}
        </div>
      </div>
    </div>
  );
}
