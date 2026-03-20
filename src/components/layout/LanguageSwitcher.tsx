"use client";

import { useState } from "react";
import { FlagIcon } from "./FlagIcon";

const LANGUAGES = [
  { code: "ru", label: "RU", name: "Русский" },
  { code: "en", label: "EN", name: "English" },
  { code: "cn", label: "CN", name: "中文" },
];

export default function LanguageSwitcher() {
  const [current, setCurrent] = useState("ru");
  const [open, setOpen] = useState(false);

  const currentLang = LANGUAGES.find((l) => l.code === current);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
      >
        <FlagIcon code={current === "cn" ? "zh" : current} size={20} />
        {currentLang?.label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-[140px] py-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setCurrent(lang.code);
                  setOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-2 ${
                  current === lang.code
                    ? "text-green-600 dark:text-green-400 font-medium"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                <FlagIcon code={lang.code === "cn" ? "zh" : lang.code} size={18} />
                {lang.label} — {lang.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
