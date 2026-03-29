"use client";

import { useEffect, useRef, useState } from "react";

interface Settings {
  metaTitle: string;
  metaDescription: string | null;
  faviconUrl: string | null;
  headerCode: string | null;
  footerCode: string | null;
  headerCodePages: string[];
  footerCodePages: string[];
}

function PageList({
  pages,
  onChange,
}: {
  pages: string[];
  onChange: (pages: string[]) => void;
}) {
  const add = () => onChange([...pages, ""]);
  const remove = (i: number) => onChange(pages.filter((_, idx) => idx !== i));
  const update = (i: number, val: string) =>
    onChange(pages.map((p, idx) => (idx === i ? val : p)));

  return (
    <div className="space-y-2 mt-2">
      {pages.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={p}
            onChange={(e) => update(i, e.target.value)}
            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100"
            placeholder="/instruments, /feed и т.д."
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-gray-400 hover:text-red-500 transition text-lg leading-none px-1"
            title="Удалить"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        <span className="text-base leading-none">+</span> Добавить страницу
      </button>
    </div>
  );
}

export default function SiteSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [headerAllPages, setHeaderAllPages] = useState(true);
  const [footerAllPages, setFooterAllPages] = useState(true);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/site-settings")
      .then((r) => r.json())
      .then((data: Settings) => {
        setSettings(data);
        setHeaderAllPages(!data.headerCodePages || data.headerCodePages.length === 0);
        setFooterAllPages(!data.footerCodePages || data.footerCodePages.length === 0);
      });
  }, []);

  const uploadFavicon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;
    setFaviconUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/favicon", { method: "POST", body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setSettings({ ...settings, faviconUrl: url });
      }
    } finally {
      setFaviconUploading(false);
      if (faviconInputRef.current) faviconInputRef.current.value = "";
    }
  };

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
            onChange={(e) => setSettings({ ...settings, metaTitle: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            placeholder="FOMO — Find Opportunities, Manage Outcomes"
          />
          <p className="text-xs text-gray-400 mt-1">
            Отображается во вкладке браузера и в поисковой выдаче
          </p>
        </div>

        {/* Meta Description */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Мета-описание
          </label>
          <textarea
            value={settings.metaDescription || ""}
            onChange={(e) => setSettings({ ...settings, metaDescription: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
            placeholder="Торговая платформа нового поколения"
          />
        </div>

        {/* Favicon */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Favicon
          </label>
          <div className="flex items-center gap-4">
            {settings.faviconUrl ? (
              <img
                src={settings.faviconUrl}
                alt="favicon"
                className="w-10 h-10 rounded border border-gray-200 dark:border-gray-600 object-contain bg-gray-50 dark:bg-gray-700 p-1"
              />
            ) : (
              <div className="w-10 h-10 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-300 text-xl">
                🌐
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/svg+xml,image/x-icon,image/webp"
                onChange={uploadFavicon}
                className="hidden"
                id="faviconUpload"
              />
              <label
                htmlFor="faviconUpload"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition ${
                  faviconUploading ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {faviconUploading ? "Загрузка..." : "📁 Выбрать файл"}
              </label>
              {settings.faviconUrl && (
                <span className="text-xs text-gray-400 truncate max-w-xs">
                  {settings.faviconUrl}
                </span>
              )}
            </div>
            {settings.faviconUrl && (
              <button
                type="button"
                onClick={() => setSettings({ ...settings, faviconUrl: null })}
                className="text-xs text-red-400 hover:text-red-600 ml-auto"
              >
                Удалить
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            PNG, JPG, SVG, ICO, WebP. Файл сохраняется в /uploads/favicon/
          </p>
        </div>

        {/* Header Code */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Код в &lt;head&gt;
          </label>
          <p className="text-xs text-gray-400 mb-2">
            Счётчики аналитики, коды подтверждения поисковиков, стили и т.д.
          </p>
          <textarea
            value={settings.headerCode || ""}
            onChange={(e) => setSettings({ ...settings, headerCode: e.target.value })}
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
            placeholder={'<meta name="google-site-verification" content="..." />\n<script async src="https://www.googletagmanager.com/gtag/js?id=..."></script>'}
          />
          <div className="flex items-center gap-2 mt-3">
            <input
              type="checkbox"
              checked={headerAllPages}
              onChange={(e) => setHeaderAllPages(e.target.checked)}
              id="headerAll"
              className="rounded"
            />
            <label htmlFor="headerAll" className="text-sm text-gray-600 dark:text-gray-400">
              На всех страницах
            </label>
          </div>
          {!headerAllPages && (
            <>
              <p className="text-xs text-gray-400 mt-2">
                Укажите пути страниц, на которых нужно вставлять код:
              </p>
              <PageList
                pages={settings.headerCodePages || []}
                onChange={(pages) => setSettings({ ...settings, headerCodePages: pages })}
              />
            </>
          )}
        </div>

        {/* Footer Code */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Код перед &lt;/body&gt;
          </label>
          <p className="text-xs text-gray-400 mb-2">
            Скрипты аналитики, чат-боты, пиксели и т.д.
          </p>
          <textarea
            value={settings.footerCode || ""}
            onChange={(e) => setSettings({ ...settings, footerCode: e.target.value })}
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
            placeholder={'<!-- Yandex.Metrika counter -->\n<script type="text/javascript">...</script>'}
          />
          <div className="flex items-center gap-2 mt-3">
            <input
              type="checkbox"
              checked={footerAllPages}
              onChange={(e) => setFooterAllPages(e.target.checked)}
              id="footerAll"
              className="rounded"
            />
            <label htmlFor="footerAll" className="text-sm text-gray-600 dark:text-gray-400">
              На всех страницах
            </label>
          </div>
          {!footerAllPages && (
            <>
              <p className="text-xs text-gray-400 mt-2">
                Укажите пути страниц, на которых нужно вставлять код:
              </p>
              <PageList
                pages={settings.footerCodePages || []}
                onChange={(pages) => setSettings({ ...settings, footerCodePages: pages })}
              />
            </>
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
          {saved && (
            <span className="text-green-600 text-sm font-medium">✓ Сохранено</span>
          )}
        </div>
      </div>
    </div>
  );
}
