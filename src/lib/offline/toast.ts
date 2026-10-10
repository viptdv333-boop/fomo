// One small toast for the whole app («Нет сети», «Отправится, когда появится сеть»). OfflineSync renders it; any code can ask for one.
export const TOAST_EVENT = "fomo-toast";

let last = { text: "", at: 0 };

/** Shows a short message; the same text is not repeated within 4 s. */
export function showToast(text: string): void {
  if (typeof window === "undefined" || !text) return;
  const now = Date.now();
  if (last.text === text && now - last.at < 4000) return;
  last = { text, at: now };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { text } }));
}
