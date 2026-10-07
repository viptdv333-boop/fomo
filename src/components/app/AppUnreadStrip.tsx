"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { badgeLabel } from "@/lib/app-ui";
import { useAppUi } from "./useAppUi";
import { useUnreadByIdea } from "./useUnreadByIdea";

/**
 * Board of the app UI: «Новых комментариев: N» above the list while some idea has unread comments / replies. The cards carry their own red
 * count, but the idea may sit far down the board: the strip opens the oldest unread one and the idea page scrolls to the comment.
 * Renders nothing outside the app UI, for a guest, or when everything is read.
 */
export default function AppUnreadStrip() {
  const on = useAppUi();
  const { t } = useT();
  const u = useUnreadByIdea(on);
  if (!on || !u.board.first || u.board.n <= 0) return null;
  return (
    <Link href={`/ideas/${u.board.first}`} prefetch={false} className="app-unread-strip" data-app-strip="comments">
      <span className="app-ubadge" aria-hidden="true">
        {badgeLabel(u.board.n)}
      </span>
      <span className="app-unread-strip-txt">{t("appui.newComments", { n: u.board.n })}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}
