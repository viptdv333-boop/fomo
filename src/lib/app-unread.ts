// Per-item unread markers of the app UI (red counts on channel rows, post cards, board cards, «Мои идеи») and the jump to the first
// unread comment of an idea. Pure (no Prisma, no React): scripts/check-app-badges.ts runs it.
//
// No DB column: a comment notification keeps its target in Notification.link — `/ideas/<ideaId>` for the old ones,
// `/ideas/<ideaId>?comment=<commentId>` for the ones created from now on (see ideaCommentLink). The idea → channel step comes from Idea.tariffId.
import { badgeLabel } from "@/lib/app-ui";

/** Notification types of a comment under an idea: on my idea, a reply to my comment, a comment under a post of a channel I follow. */
export const IDEA_COMMENT_TYPES: readonly string[] = ["new_comment", "comment_reply", "channel_comment"];
/** A new post of a channel I follow. */
export const IDEA_POST_TYPES: readonly string[] = ["channel_post"];
/** Likes of my idea / of my comment (src/lib/like-notify.ts): they light the dock badge but are NOT part of the red per-post comment counter. */
export const IDEA_LIKE_TYPES: readonly string[] = ["idea_like", "comment_like"];
/** Everything the per-item markers read from (the types of the unread-by-idea endpoint). */
export const IDEA_UNREAD_TYPES: readonly string[] = [...IDEA_COMMENT_TYPES, ...IDEA_POST_TYPES, ...IDEA_LIKE_TYPES];
/** Opening an idea marks all of these read: its comments, its post notification, and «new idea of an author I follow». */
export const IDEA_READ_TYPES: readonly string[] = [...IDEA_UNREAD_TYPES, "new_idea"];

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

/** `/ideas/<id>`, `/ideas/<id>?...`, `/ideas/<id>#...` -> id; anything else (null, `/ideas/new`, `/ideas/<id>/edit`, other pages) -> null. */
export function ideaIdFromLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const m = /^\/ideas\/([^/?#]+)(?:[?#].*)?$/.exec(link.trim());
  return m && ID_RE.test(m[1]) ? m[1] : null;
}

/** `?comment=<id>` of a notification link, null when there is none. */
export function commentIdFromLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const q = link.split("#")[0].split("?")[1];
  if (!q) return null;
  for (const part of q.split("&")) {
    const [k, v] = part.split("=");
    if (k === "comment" && v && ID_RE.test(v)) return v;
  }
  return null;
}

/** The link a comment notification stores: the idea page that scrolls to the comment. */
export function ideaCommentLink(ideaId: string, commentId: string): string {
  return `/ideas/${ideaId}?comment=${commentId}`;
}

export interface UnreadEntry {
  /** unread comments (new_comment + comment_reply + channel_comment) */
  c: number;
  /** unread «new post» notifications (channel_post): 0 or 1 in practice */
  p: number;
}
export interface UnreadMap {
  byIdea: Record<string, UnreadEntry>;
  byChannel: Record<string, UnreadEntry>;
  /** the idea with the oldest unread comment (any idea): null = none */
  first: string | null;
  /** unread comments under ordinary ideas (not posts of a channel): the board's «new comments» strip, `first` = the idea it opens */
  board: { n: number; first: string | null };
}
export interface UnreadRow {
  type: string;
  link: string | null;
}

/** Idea id -> channel (tariff) id or null for an ordinary idea; an idea that is not in the map no longer exists. */
export type TariffByIdea = ReadonlyMap<string, string | null>;

/**
 * Unread counts per idea and per channel from the unread notification rows (oldest first). Rows of a deleted idea (absent from
 * `tariffByIdea`) and rows whose link names no idea are dropped: they could never be opened and would keep a badge forever.
 */
export function aggregateUnread(rows: readonly UnreadRow[], tariffByIdea: TariffByIdea): UnreadMap {
  const byIdea: Record<string, UnreadEntry> = {};
  const byChannel: Record<string, UnreadEntry> = {};
  let first: string | null = null;
  const board: { n: number; first: string | null } = { n: 0, first: null };
  for (const r of rows) {
    const isComment = IDEA_COMMENT_TYPES.includes(r.type);
    const isPost = IDEA_POST_TYPES.includes(r.type);
    if (!isComment && !isPost) continue;
    const id = ideaIdFromLink(r.link);
    if (!id || !tariffByIdea.has(id)) continue;
    const key = isComment ? "c" : "p";
    (byIdea[id] ??= { c: 0, p: 0 })[key]++;
    const ch = tariffByIdea.get(id);
    if (ch) (byChannel[ch] ??= { c: 0, p: 0 })[key]++;
    if (isComment && first === null) first = id;
    if (isComment && !ch) {
      board.n++;
      if (board.first === null) board.first = id;
    }
  }
  return { byIdea, byChannel, first, board };
}

/**
 * The per-type counts of the dock (BADGE_TAB_BY_TYPE input) with the idea notifications corrected:
 *  - a comment / reply under a post of a channel counts as `channel_comment` (the «Каналы» tab: that is where its post lives),
 *  - a like of a channel post / of a comment under it counts as `channel_like` (same tab); likes under ordinary ideas keep idea_like / comment_like (Доска),
 *  - notifications of a deleted idea are dropped,
 *  - rows without a parseable idea link keep their own type.
 * `others` = the counts of the types that do not point at an idea (price alerts, calendar, chat ...).
 */
export function effectiveByType(others: Record<string, number>, ideaRows: readonly UnreadRow[], tariffByIdea: TariffByIdea): Record<string, number> {
  const out: Record<string, number> = { ...others };
  for (const r of ideaRows) {
    let type = r.type;
    const id = ideaIdFromLink(r.link);
    if (id) {
      if (!tariffByIdea.has(id)) continue;
      if ((type === "new_comment" || type === "comment_reply") && tariffByIdea.get(id)) type = "channel_comment";
      else if (IDEA_LIKE_TYPES.includes(type) && tariffByIdea.get(id)) type = "channel_like";
    }
    out[type] = (out[type] ?? 0) + 1;
  }
  return out;
}

/** The red number of an idea / channel: its comments (a new post alone shows as 1). "" = no badge. */
export function unreadCount(e: UnreadEntry | undefined | null): number {
  if (!e) return 0;
  return Math.max(0, e.c) + Math.max(0, e.p);
}
export function unreadLabel(e: UnreadEntry | undefined | null): string {
  return badgeLabel(unreadCount(e));
}

export interface ThreadComment {
  id: string;
  createdAt: string;
  user: { id: string };
}

/**
 * Which comment to scroll to when an idea is opened.
 *   1. `wanted` — the `?comment=` of the link the user came by, when that comment is in the thread;
 *   2. the first comment whose id is named by an unread notification (`ids`);
 *   3. old notifications carry no comment id: the first comment of somebody else written at / after the oldest unread notification (`since`; a notification
 *      is created right after its comment, hence the small slack).
 * null = nothing to jump to (the thread opens as usual).
 */
export function pickCommentToShow(comments: readonly ThreadComment[], opts: { wanted?: string | null; ids?: readonly string[]; since?: string | null; myId?: string | null }): string | null {
  const has = new Set(comments.map((c) => c.id));
  if (opts.wanted && has.has(opts.wanted)) return opts.wanted;
  const ids = new Set(opts.ids ?? []);
  if (ids.size > 0) {
    const hit = comments.find((c) => ids.has(c.id));
    if (hit) return hit.id;
  }
  if (opts.since) {
    const t = Date.parse(opts.since);
    if (Number.isFinite(t)) {
      const hit = comments.find((c) => c.user.id !== opts.myId && Date.parse(c.createdAt) >= t - 5000);
      if (hit) return hit.id;
    }
  }
  return null;
}
