// "Сегодня, 14:05" / "Вчера, 14:05" / "17 сент., 14:05" (+ год для прошлых лет).
// Comments used to show the bare time, so an old comment looked like a fresh one.
export function formatMessageTime(value: string | Date): string {
  const d = new Date(value);
  const time = d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);

  if (daysAgo === 0) return `Сегодня, ${time}`;
  if (daysAgo === 1) return `Вчера, ${time}`;

  const date = d.toLocaleDateString("ru", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
  return `${date}, ${time}`;
}
