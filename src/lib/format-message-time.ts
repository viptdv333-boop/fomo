// "Сегодня, 14:05" / "Вчера, 14:05" / "17 сент., 14:05" (+ год для прошлых лет).
// Comments used to show the bare time, so an old comment looked like a fresh one.
const DAY_WORDS: Record<string, { today: string; yesterday: string; intl: string }> = {
  ru: { today: "Сегодня", yesterday: "Вчера", intl: "ru" },
  en: { today: "Today", yesterday: "Yesterday", intl: "en-US" },
  cn: { today: "今天", yesterday: "昨天", intl: "zh-CN" },
};

export function formatMessageTime(value: string | Date, locale: string = "ru"): string {
  const words = DAY_WORDS[locale] ?? DAY_WORDS.ru;
  const d = new Date(value);
  const time = d.toLocaleTimeString(words.intl, { hour: "2-digit", minute: "2-digit" });

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);

  if (daysAgo === 0) return `${words.today}, ${time}`;
  if (daysAgo === 1) return `${words.yesterday}, ${time}`;

  const date = d.toLocaleDateString(words.intl, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
  return `${date}, ${time}`;
}

const UPDATED_WORD: Record<string, string> = { ru: "обновлено", en: "updated", cn: "已更新" };

/** "5 нояб., 14:05" (+ year for a past year): the date and the time of a post, always absolute (never "Today" or "9 h ago"). */
export function formatDateTime(value: string | Date, locale: string = "ru"): string {
  const words = DAY_WORDS[locale] ?? DAY_WORDS.ru;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const time = d.toLocaleTimeString(words.intl, { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString(words.intl, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
  return `${date}, ${time}`;
}

/** "обновлено 5 нояб., 15:30" for an edited post, "" for one that was never edited. */
export function editedLabel(editedAt: string | Date | null | undefined, locale: string = "ru"): string {
  if (!editedAt) return "";
  const t = formatDateTime(editedAt, locale);
  return t ? `${UPDATED_WORD[locale] ?? UPDATED_WORD.ru} ${t}` : "";
}
