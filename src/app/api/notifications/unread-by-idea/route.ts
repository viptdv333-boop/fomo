import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { aggregateUnread, commentIdFromLink, ideaIdFromLink, IDEA_COMMENT_TYPES } from "@/lib/app-unread";
import { loadIdeaUnread } from "@/lib/unread-ideas";
import { isTerminalSite } from "@/lib/site-mode";

// Main site only (the terminal site has no ideas: src/lib/site-mode.ts keeps this route closed there).
//
// GET                 — unread comment / new-post notifications of the session user per idea and per channel:
//                       { byIdea: { <ideaId>: { c, p } }, byChannel: { <channelId>: { c, p } }, first: <ideaId> | null, board: { n, first } }.
//                       Red counts on channel rows, post cards, board cards, «Мои идеи» (src/components/app/useUnreadByIdea.ts).
// GET ?ideaId=<id>    — the unread notifications of ONE idea, read BEFORE the idea marks them read: { total, ids, since } where ids are the
//                       comment ids named by the links (?comment=<id>) and since the time of the oldest one (the jump target of an old notification
//                       without a comment id). Used by src/components/ideas/IdeaComments.tsx.
export async function GET(request: NextRequest) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ byIdea: {}, byChannel: {}, first: null, board: { n: 0, first: null } }, { status: 401 });
  if (isTerminalSite()) return NextResponse.json({ byIdea: {}, byChannel: {}, first: null, board: { n: 0, first: null } }, { headers: { "Cache-Control": "no-store" } });

  const { rows, tariffByIdea } = await loadIdeaUnread(uid);
  const ideaId = new URL(request.url).searchParams.get("ideaId");
  if (ideaId) {
    const mine = rows.filter((r) => ideaIdFromLink(r.link) === ideaId);
    const ids = mine.filter((r) => IDEA_COMMENT_TYPES.includes(r.type)).map((r) => commentIdFromLink(r.link)).filter((x): x is string => !!x);
    const comments = mine.filter((r) => IDEA_COMMENT_TYPES.includes(r.type));
    return NextResponse.json(
      { total: mine.length, ids, since: comments[0]?.createdAt ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(aggregateUnread(rows, tariffByIdea), { headers: { "Cache-Control": "no-store" } });
}
