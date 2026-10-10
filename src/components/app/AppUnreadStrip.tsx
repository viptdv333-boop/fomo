"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { badgeLabel } from "@/lib/app-ui";
import { stripHref, stripText, type UnreadBucket } from "@/lib/app-unread";
import { useAppUi } from "./useAppUi";
import { useUnreadByIdea } from "./useUnreadByIdea";

type StripBucket = Pick<UnreadBucket, "n" | "p" | "l" | "first" | "firstComment">;

/** The strip itself: the number of the dock tab it explains, what it is made of («Новых комментариев» / «Новых лайков» / «Новое»), one tap to the oldest unread idea. */
export function UnreadStripView({ bucket, scope }: { bucket: StripBucket; scope: string }) {
  const { t } = useT();
  const txt = stripText(bucket);
  const href = stripHref(bucket);
  if (!txt || !href) return null;
  return (
    <Link href={href} prefetch={false} className="app-unread-strip" data-app-strip={scope} data-strip-kind={txt.key.replace("appui.", "")}>
      <span className="app-ubadge" aria-hidden="true">
        {badgeLabel(txt.n)}
      </span>
      <span className="app-unread-strip-txt">{t(txt.key, { n: txt.n })}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

/**
 * App UI sections: everything the dock badge of the tab counts, as one strip above the list. The cards carry their own marks (red count of
 * comments, pink hearts), but the idea may sit far down the list or not be loaded at all: the strip opens the oldest unread one (the idea page
 * scrolls to the comment / liked comment). scope "board" = «Доска» (comments, replies, likes under ordinary ideas), "channels" = «Каналы»
 * (new posts, comments, likes of channel posts). Renders nothing outside the app UI, for a guest, or when everything is read.
 */
export default function AppUnreadStrip({ scope = "board" }: { scope?: "board" | "channels" }) {
  const on = useAppUi();
  const u = useUnreadByIdea(on);
  if (!on) return null;
  return <UnreadStripView bucket={scope === "channels" ? u.channels : u.board} scope={scope} />;
}
