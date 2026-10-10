// Per-item unread markers of the app UI (red counts on channel rows, post cards, board cards, «Мои идеи») and the jump to the first
// unread comment of an idea. Pure (no Prisma, no React): scripts/check-app-badges.ts runs it.
//
// No DB column: a comment notification keeps its target in Notification.link — `/ideas/<ideaId>` for the old ones,
// `/ideas/<ideaId>?comment=<commentId>` for the ones created from now on (see ideaCommentLink). The idea → channel step comes from Idea.tariffId.
import { badgeLabel } from "@/lib/app-ui";
import { tabForNotifType } from "@/lib/app-badges";

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
  /** of those `c`: replies to MY comment (comment_reply): «Ответ на ваш комментарий». Not an extra count (c already has them). */
  r: number;
  /** unread «new post» notifications (channel_post): 0 or 1 in practice */
  p: number;
  /** unread like notifications (idea_like + comment_like), one per notification row (a row may name several people): the pink «♥ N», NOT part of the red comment count */
  l: number;
  /** per-channel entries only: the ideas (posts) of the channel that have something unread, oldest unread first */
  ideas?: string[];
}
/** What kind of unread item a notification is: a comment, a new post, a like. */
export type UnreadKind = "c" | "p" | "l";
/**
 * Everything the dock counts for one tab, explained inside the section:
 *   n comments + replies, p new posts, l likes, total = n + p + l (= the dock number of that tab),
 *   first = the idea of the OLDEST unread item of any kind (the strip opens it), firstKind its kind,
 *   firstComment = the comment named by that item's link (`?comment=`), null when the link names none,
 *   ideas = the ideas that carry something unread, oldest unread first: the screens put the ones that are not in the loaded list on top as highlighted cards.
 */
export interface UnreadBucket {
  n: number;
  p: number;
  l: number;
  total: number;
  first: string | null;
  firstKind: UnreadKind | null;
  firstComment: string | null;
  ideas: string[];
}
export interface UnreadMap {
  byIdea: Record<string, UnreadEntry>;
  byChannel: Record<string, UnreadEntry>;
  /** the idea with the oldest unread comment (any idea): null = none (kept for older clients) */
  first: string | null;
  /** «Доска» (ordinary ideas): comments / replies / likes. `n` and `first` keep their old names (n = comments only). total = the dock number of «Доска». */
  board: UnreadBucket;
  /** «Каналы» (posts of channels): new posts, comments, likes. total = the dock number of «Каналы». */
  channels: UnreadBucket;
}
export interface UnreadRow {
  type: string;
  link: string | null;
}

export function emptyBucket(): UnreadBucket {
  return { n: 0, p: 0, l: 0, total: 0, first: null, firstKind: null, firstComment: null, ideas: [] };
}
export function emptyUnread(): UnreadMap {
  return { byIdea: {}, byChannel: {}, first: null, board: emptyBucket(), channels: emptyBucket() };
}

/** Idea id -> channel (tariff) id or null for an ordinary idea; an idea that is not in the map no longer exists. */
export type TariffByIdea = ReadonlyMap<string, string | null>;

/**
 * The type the dock counts a notification of an idea under: a comment / reply under a post of a channel is `channel_comment`, a like of a
 * channel post / of a comment under it is `channel_like` (both light «Каналы»); everything else keeps its own type. One rule for the dock
 * (effectiveByType) and for the markers inside the sections (aggregateUnread), so the two cannot drift apart.
 */
export function dockTypeOf(type: string, channelId: string | null | undefined): string {
  if (channelId) {
    if (type === "new_comment" || type === "comment_reply") return "channel_comment";
    if (IDEA_LIKE_TYPES.includes(type)) return "channel_like";
  }
  return type;
}

function kindOf(type: string): UnreadKind | null {
  if (IDEA_COMMENT_TYPES.includes(type)) return "c";
  if (IDEA_POST_TYPES.includes(type)) return "p";
  if (IDEA_LIKE_TYPES.includes(type)) return "l";
  return null;
}

function addTo(b: UnreadBucket, kind: UnreadKind, ideaId: string, link: string | null) {
  if (kind === "c") b.n++;
  else if (kind === "p") b.p++;
  else b.l++;
  b.total++;
  if (!b.ideas.includes(ideaId)) b.ideas.push(ideaId);
  if (b.first === null) {
    b.first = ideaId;
    b.firstKind = kind;
    b.firstComment = kind === "p" ? null : commentIdFromLink(link);
  }
}

/**
 * Unread counts per idea and per channel from the unread notification rows (oldest first), and the two strips (board / channels) that explain
 * the dock numbers of «Доска» and «Каналы». Rows of a deleted idea (absent from `tariffByIdea`) and rows whose link names no idea are dropped:
 * they could never be opened and would keep a badge forever.
 */
export function aggregateUnread(rows: readonly UnreadRow[], tariffByIdea: TariffByIdea): UnreadMap {
  const out = emptyUnread();
  for (const r of rows) {
    const kind = kindOf(r.type);
    if (!kind) continue;
    const id = ideaIdFromLink(r.link);
    if (!id || !tariffByIdea.has(id)) continue;
    const reply = r.type === "comment_reply" ? 1 : 0;
    const mine = (out.byIdea[id] ??= { c: 0, r: 0, p: 0, l: 0 });
    mine[kind]++;
    mine.r += reply;
    const ch = tariffByIdea.get(id);
    if (ch) {
      const chE = (out.byChannel[ch] ??= { c: 0, r: 0, p: 0, l: 0, ideas: [] });
      chE[kind]++;
      chE.r += reply;
      if (!chE.ideas!.includes(id)) chE.ideas!.push(id);
    }
    if (kind === "c" && out.first === null) out.first = id;
    // the dock tab decides where the item is explained (same rule as effectiveByType)
    const tab = tabForNotifType(dockTypeOf(r.type, ch));
    if (tab === "feed") addTo(out.board, kind, id, r.link);
    else if (tab === "channels") addTo(out.channels, kind, id, r.link);
  }
  return out;
}

/**
 * The per-type counts of the dock (BADGE_TAB_BY_TYPE input) with the idea notifications corrected (see dockTypeOf):
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
      type = dockTypeOf(type, tariffByIdea.get(id));
    }
    out[type] = (out[type] ?? 0) + 1;
  }
  return out;
}

/** The red number of an idea / channel: its comments (a new post alone shows as 1). Likes are not in it (see likeLabel). */
export function unreadCount(e: Pick<UnreadEntry, "c" | "p"> | undefined | null): number {
  if (!e) return 0;
  return Math.max(0, e.c) + Math.max(0, e.p);
}
export function unreadLabel(e: Pick<UnreadEntry, "c" | "p"> | undefined | null): string {
  return badgeLabel(unreadCount(e));
}
/** The pink «♥ N» of an idea / channel: its unread like notifications. "" = none. */
export function likeLabel(e: Partial<Pick<UnreadEntry, "l">> | undefined | null): string {
  return badgeLabel(e && (e.l ?? 0) > 0 ? e.l : 0);
}
/** Anything unread on the idea / channel (comment, post or like). */
export function hasUnread(e: Partial<UnreadEntry> | undefined | null): boolean {
  return !!e && (e.c ?? 0) + (e.p ?? 0) + (e.l ?? 0) > 0;
}
/** The thin accent on the edge of a card (data-unread): "c" = comments / a new post (red), "l" = only likes (pink), undefined = nothing unread. */
export function unreadAccent(e: Partial<UnreadEntry> | undefined | null): "c" | "l" | undefined {
  if (!e) return undefined;
  if ((e.c ?? 0) + (e.p ?? 0) > 0) return "c";
  return (e.l ?? 0) > 0 ? "l" : undefined;
}

/** One kind of what is new on a card: comments (without replies), replies to my comment, a new post, likes. */
export type ChipKind = "c" | "r" | "p" | "l";
export interface ChipPart {
  kind: ChipKind;
  n: number;
}
/** What the label chip of a card says is new, in the order comments, replies, post, likes. The sum of the parts = c + p + l (the dock counts the same rows). */
export function unreadChipParts(e: Partial<UnreadEntry> | undefined | null): ChipPart[] {
  if (!e) return [];
  const c = Math.max(0, e.c ?? 0);
  const r = Math.min(c, Math.max(0, e.r ?? 0));
  const parts: ChipPart[] = [
    { kind: "c", n: c - r },
    { kind: "r", n: r },
    { kind: "p", n: Math.max(0, e.p ?? 0) },
    { kind: "l", n: Math.max(0, e.l ?? 0) },
  ];
  return parts.filter((x) => x.n > 0);
}
/** Plural category of a count for the chip texts: Russian one / few / many, English one / many, Chinese many. */
export function chipPlural(n: number, locale: string): "one" | "few" | "many" {
  const v = Math.abs(Math.floor(n));
  if (locale === "ru") {
    if (v % 10 === 1 && v % 100 !== 11) return "one";
    if (v % 10 >= 2 && v % 10 <= 4 && (v % 100 < 12 || v % 100 > 14)) return "few";
    return "many";
  }
  if (locale === "en") return v === 1 ? "one" : "many";
  return "many";
}
/**
 * The i18n key + count of one part of the chip. A chip with ONE kind says it in full («Новый комментарий» / «Новых комментариев: N» / «Ответ на ваш
 * комментарий» / «Ответов: N» / «Новый пост» / «♥ Лайк» / «♥ N»); a chip with several kinds is short («2 комментария · 1 ответ · ♥ 3»).
 */
export function chipText(part: ChipPart, alone: boolean, locale: string): { key: string; n: number } {
  if (alone) return { key: `appui.chip.${part.kind}${part.n === 1 ? "1" : "N"}`, n: part.n };
  if (part.kind === "l") return { key: "appui.chip.lN", n: part.n };
  return { key: `appui.chipS.${part.kind}.${chipPlural(part.n, locale)}`, n: part.n };
}
/** The accent of the chip: "l" (pink) when there are only likes, otherwise "c" (red). undefined = nothing unread. Same rule as the accent on the card's edge. */
export function chipAccent(e: Partial<UnreadEntry> | undefined | null): "c" | "l" | undefined {
  return unreadAccent(e);
}
/**
 * The unread ideas that must be put on top of a list because the list as loaded does not show them: from `unreadIds` (oldest unread first) those that are
 * not among `shownIds` (the cards the reader sees without scrolling), at most `cap`. Keeps the order; duplicates dropped.
 */
export function unreadOffList(unreadIds: readonly string[], shownIds: readonly string[], cap = 5): string[] {
  const shown = new Set(shownIds);
  const out: string[] = [];
  for (const id of unreadIds) {
    if (out.length >= cap) break;
    if (!shown.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
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
