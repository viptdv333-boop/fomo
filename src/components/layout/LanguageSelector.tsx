"use client";

import { useEffect, useState } from "react";

interface Language {
  code: string;
  name: string;
}

const FLAGS: Record<string, string> = {
  ru: "\u{1F1F7}\u{1F1FA}",
  en: "\u{1F1EC}\u{1F1E7}",
  de: "\u{1F1E9}\u{1F1EA}",
  fr: "\u{1F1EB}\u{1F1F7}",
  es: "\u{1F1EA}\u{1F1F8}",
  zh: "\u{1F1E8}\u{1F1F3}",
  ja: "\u{1F1EF}\u{1F1F5}",
  ko: "\u{1F1F0}\u{1F1F7}",
  ar: "\u{1F1F8}\u{1F1E6}",
  pt: "\u{1F1F5}\u{1F1F9}",
  it: "\u{1F1EE}\u{1F1F9}",
  tr: "\u{1F1F9}\u{1F1F7}",
};

export default function LanguageSelector() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [current, setCurrent] = useState("ru");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const match = document.cookie.match(/NEXT_LOCALE=(\w+)/);
    if (match) setCurrent(match[1]);

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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition rounded"
      >
        <span className="text-base leading-none">{FLAGS[current] || "\u{1F310}"}</span>
        <span className="text-xs uppercase font-medium">{current}</span>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLocale(lang.code)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-2 ${
                lang.code === current
                  ? "text-blue-600 dark:text-blue-400 font-medium"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              <span className="text-base leading-none">{FLAGS[lang.code] || "\u{1F310}"}</span>
              {lang.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
