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
