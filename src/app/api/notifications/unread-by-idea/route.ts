import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { aggregateUnread, commentIdFromLink, emptyUnread, ideaIdFromLink, IDEA_COMMENT_TYPES } from "@/lib/app-unread";
import { parseLikeLink } from "@/lib/like-notify";
import { loadIdeaUnread } from "@/lib/unread-ideas";
import { isTerminalSite } from "@/lib/site-mode";

// Main site only (the terminal site has no ideas: src/lib/site-mode.ts keeps this route closed there).
//
// GET                 — unread comment / new-post / like notifications of the session user per idea and per channel:
//                       { byIdea: { <ideaId>: { c, p, l } }, byChannel: { <channelId>: { c, p, l } }, first: <ideaId> | null,
//                         board: { n, p, l, total, first, firstKind, firstComment }, channels: { ...same } }.
//                       c = comments + replies, p = new post, l = likes; board / channels explain the dock numbers of «Доска» / «Каналы»
//                       (total = the dock number). Red counts + pink hearts on channel rows, post cards, board cards, «Мои идеи» and the strips
//                       (src/components/app/useUnreadByIdea.ts).
// GET ?ideaId=<id>    — the unread notifications of ONE idea, read BEFORE the idea marks them read: { total, ids, since, likes } where ids are the
//                       comment ids named by the links (?comment=<id>; comments first, then the comments that were liked, oldest first), since the time
//                       of the oldest comment notification (the jump target of an old notification without a comment id) and likes the number of people
//                       who liked the idea / its comments ({ idea, comment }, from the `lk=` of the like links). Used by src/components/ideas/IdeaComments.tsx.
export async function GET(request: NextRequest) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json(emptyUnread(), { status: 401 });
  if (isTerminalSite()) return NextResponse.json(emptyUnread(), { headers: { "Cache-Control": "no-store" } });

  const { rows, tariffByIdea } = await loadIdeaUnread(uid);
  const ideaId = new URL(request.url).searchParams.get("ideaId");
  if (ideaId) {
    const mine = rows.filter((r) => ideaIdFromLink(r.link) === ideaId);
    const comments = mine.filter((r) => IDEA_COMMENT_TYPES.includes(r.type));
    const ids = [...comments, ...mine.filter((r) => r.type === "comment_like")].map((r) => commentIdFromLink(r.link)).filter((x): x is string => !!x);
    // people, not rows: «Имя и ещё 3 оценили» is one row with lk=4
    const people = (type: string) => mine.filter((r) => r.type === type).reduce((s, r) => s + Math.max(1, parseLikeLink(r.link).count), 0);
    return NextResponse.json(
      { total: mine.length, ids, since: comments[0]?.createdAt ?? null, likes: { idea: people("idea_like"), comment: people("comment_like") } },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(aggregateUnread(rows, tariffByIdea), { headers: { "Cache-Control": "no-store" } });
}
