"use client";

import { useT } from "@/lib/i18n/client";
import { chipAccent, chipText, unreadAccent, unreadChipParts, unreadLabel, type UnreadEntry } from "@/lib/app-unread";

/**
 * The per-idea unread marks of the app UI as plain pieces: the red count of unread comments (`red`) and the value of the card's `data-unread`
 * (`accent`: the tinted background + 2px border of the card, red = comments / replies / a new post, pink = only likes). Pure over one entry of
 * useUnreadByIdea().byIdea. The words of what is new live in the label chip (UnreadChip).
 */
export function ideaUnreadMarks(entry: Partial<UnreadEntry> | undefined | null) {
  return { red: unreadLabel({ c: entry?.c ?? 0, p: entry?.p ?? 0 }), accent: unreadAccent(entry) };
}

/** The label of a highlighted card: what is new on it, by kind («Новый комментарий», «Ответ на ваш комментарий», «♥ Лайк», «2 комментария · ♥ 3»). Nothing when nothing is unread. */
export function UnreadChip({ entry, className }: { entry: Partial<UnreadEntry> | undefined | null; className?: string }) {
  const { t, locale } = useT();
  const parts = unreadChipParts(entry);
  if (parts.length === 0) return null;
  const text = parts
    .map((p) => {
      const c = chipText(p, parts.length === 1, locale);
      return t(c.key, { n: c.n });
    })
    .join(" · ");
  return (
    <span className={`app-uchip${className ? ` ${className}` : ""}`} data-kind={chipAccent(entry)} data-app-uchip="" role="status" aria-label={text}>
      {text}
    </span>
  );
}

/** The red count of unread comments, in the flow of the title line (the chip below it says what exactly is new). */
export default function IdeaUnreadMarks({ entry }: { entry: Partial<UnreadEntry> | undefined | null }) {
  const { t } = useT();
  const m = ideaUnreadMarks(entry);
  if (!m.red) return null;
  return (
    <span className="app-ubadge" role="status" aria-label={t("appui.unread", { n: m.red })}>
      {m.red}
    </span>
  );
}
