"use client";

import { useState, useRef, useEffect } from "react";

const INSTRUMENT_EMOJIS = [
  "bitcoin", "ethereum", "solana", "xrp", "bnb", "dogecoin", "cardano", "avalanche",
  "polkadot", "chainlink", "litecoin", "polygon", "toncoin", "sui-crypto", "pepe",
  "sberbank", "gazprom", "lukoil", "yandex", "rosneft", "norilsk-nickel", "novatek",
  "polyus", "magnit", "vtb", "tinkoff", "mts", "aeroflot", "alrosa", "nlmk",
  "apple", "tesla", "microsoft", "amazon", "google", "nvidia", "meta", "netflix",
  "amd", "intel", "jpmorgan", "berkshire", "visa", "coca-cola", "disney",
  "oil", "gas", "euro-gas", "cocoa", "wheat", "sugar", "corn", "soy", "coffee", "gasoline", "orange-juice",
  "gold", "silver", "platinum", "palladium", "copper",
  "moex-index", "rts-index", "sp500", "nasdaq100", "dow-jones", "russell2000",
  "hang-seng", "hscei", "dax40", "ftse100", "nikkei225",
  "usd-rub", "cny-rub", "eur-usd",
];

const CATEGORIES = [
  { name: "Часто", emojis: ["👍", "❤️", "😂", "🔥", "👎", "😊", "🎉", "💯", "🙏", "🚀", "📈", "📉", "💰", "⚡", "🤔", "😎"] },
  { name: "Тикеры", emojis: INSTRUMENT_EMOJIS.map(s => `:${s}:`), isCustom: true },
  { name: "Трейдинг", emojis: ["📈", "📉", "💰", "💸", "🏦", "💹", "📊", "🎯", "⚠️", "✅", "❌", "🔥", "🚀", "💎", "🐂", "🐻", "🤑", "💥", "⭐", "🏆"] },
  { name: "Лица", emojis: ["😀", "😃", "😄", "😁", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😋", "😛", "😜", "🤪", "🤑", "🤗", "🤭", "🤫", "🤔", "😐", "😏", "😒", "🙄", "😬"] },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1.5 text-gray-400 hover:text-green-600 transition rounded"
        title="Emoji и стикеры"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-10 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 w-80">
          <div className="flex border-b border-gray-100 dark:border-gray-700">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setCategory(i)}
                className={`flex-1 py-2 text-xs transition ${
                  category === i
                    ? "text-green-600 border-b-2 border-green-600 font-medium"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-0.5 p-2 max-h-52 overflow-y-auto">
            {CATEGORIES[category].emojis.map((emoji) => {
              const isCustom = emoji.startsWith(":") && emoji.endsWith(":");
              const slug = isCustom ? emoji.slice(1, -1) : "";
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onSelect(emoji); setOpen(false); }}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition flex items-center justify-center"
                  title={isCustom ? slug : undefined}
                >
                  {isCustom ? (
                    <img src={`/icons/instruments/${slug}.svg`} alt={slug} className="w-8 h-8 rounded-full" />
                  ) : (
                    <span className="text-xl">{emoji}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
