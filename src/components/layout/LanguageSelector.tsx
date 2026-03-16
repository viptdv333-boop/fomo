"use client";

import { useEffect, useState } from "react";

interface Language {
  code: string;
  name: string;
}

export default function LanguageSelector() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [current, setCurrent] = useState("ru");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Read current locale from cookie
    const match = document.cookie.match(/NEXT_LOCALE=(\w+)/);
    if (match) setCurrent(match[1]);

    // Load enabled languages
    fetch("/api/languages")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLanguages(data);
      })
      .catch(() => {});
  }, []);

  function setLocale(code: string) {
    document.cookie = `NEXT_LOCALE=${code};path=/;max-age=31536000`;
    setCurrent(code);
    setOpen(false);
    window.location.reload();
  }

  if (languages.length <= 1) return null;

  const currentLang = languages.find((l) => l.code === current);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition rounded"
      >
        <span className="text-xs uppercase font-medium">{current}</span>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[120px]">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLocale(lang.code)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition ${
                lang.code === current
                  ? "text-blue-600 dark:text-blue-400 font-medium"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {lang.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
