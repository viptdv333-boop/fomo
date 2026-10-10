"use client";

import { useT } from "@/lib/i18n/client";
import { likeLabel, unreadAccent, unreadLabel, type UnreadEntry } from "@/lib/app-unread";

/**
 * The per-idea unread marks of the app UI as plain pieces, for the cards that are not the big board card (the «ТОП 1..3» block, the list and the grid
 * view of the board): a red count of unread comments and a pink «♥ N» of unread likes (they are in the dock badge but not in the red count).
 * `accent` is the value of the card's `data-unread` (thin accent on its edge). Pure over one entry of useUnreadByIdea().byIdea.
 */
export function ideaUnreadMarks(entry: Partial<UnreadEntry> | undefined | null) {
  return { red: unreadLabel({ c: entry?.c ?? 0, p: entry?.p ?? 0 }), like: likeLabel(entry), accent: unreadAccent(entry) };
}

export default function IdeaUnreadMarks({ entry }: { entry: Partial<UnreadEntry> | undefined | null }) {
  const { t } = useT();
  const m = ideaUnreadMarks(entry);
  if (!m.red && !m.like) return null;
  return (
    <>
      {m.red && (
        <span className="app-ubadge" role="status" aria-label={t("appui.unread", { n: m.red })}>
          {m.red}
        </span>
      )}
      {m.like && (
        <span className="app-ulike" role="status" aria-label={t("appui.likesUnread", { n: m.like })}>
          {"♥"} {m.like}
        </span>
      )}
    </>
  );
}
