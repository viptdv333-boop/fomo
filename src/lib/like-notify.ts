// Notifications about likes under a post / a comment. Pure (no Prisma, no Next): scripts/check-like-notify.ts runs it; the DB part is
// src/lib/like-notify-server.ts.
//
// No schema change, so everything the aggregation needs lives in Notification.link as a trailing `lk=` query parameter:
//   /ideas/<id>?lk=<count>_<tok>.<tok>...                 (idea_like)
//   /ideas/<id>?comment=<cid>&lk=<count>_<tok>.<tok>...   (comment_like)
// count = how many different people liked so far, tok = the last 8 characters of an actor's id (at most LIKE_TOKEN_CAP of the latest
// ones are kept). Rules built on it:
//   - ONE notification per (actor, target) ever: an actor whose token is in ANY row (read or not) of the target never produces another;
//   - an UNREAD row of the target is rewritten instead of adding a new one («Имя и ещё N оценили вашу идею»); once it is read, the next
//     liker starts a new row.
// Everything else on the site only looks at the part before `lk=` (ideaIdFromLink / commentIdFromLink skip unknown parameters).
import type { NotifText } from "@/lib/notif-render";

export type LikeKind = "idea_like" | "comment_like";

/** Notification.type of each kind (they double as the keys of EVENT_FOR_TYPE / BADGE_TAB_BY_TYPE). */
export const LIKE_TYPES: readonly LikeKind[] = ["idea_like", "comment_like"];

/** The reaction that counts as a like (the only other one is 👎, see /api/ideas/comments/reactions). */
export const LIKE_EMOJI = "👍";

/** How many latest actor tokens one row remembers (keeps the link short on a popular post). */
export const LIKE_TOKEN_CAP = 12;

const LK_RE = /([?&])lk=(\d{1,7})_([A-Za-z0-9_.-]*)$/;

export function actorToken(userId: string): string {
  return userId.slice(-8);
}

export interface LikeLink {
  /** the link without the `lk=` parameter */
  base: string;
  count: number;
  tokens: string[];
}

/** `base?lk=...` / `base&lk=...`; the parameter is always the last one. */
export function buildLikeLink(base: string, count: number, tokens: readonly string[]): string {
  const kept = tokens.slice(-LIKE_TOKEN_CAP);
  return `${base}${base.includes("?") ? "&" : "?"}lk=${Math.max(1, Math.floor(count))}_${kept.join(".")}`;
}

/** Splits a stored like link; a link without the parameter is a bare base (count 0, no tokens). */
export function parseLikeLink(link: string | null | undefined): LikeLink {
  const s = typeof link === "string" ? link : "";
  const m = LK_RE.exec(s);
  if (!m) return { base: s, count: 0, tokens: [] };
  return { base: s.slice(0, m.index), count: Number(m[2]), tokens: m[3] ? m[3].split(".").filter(Boolean) : [] };
}

/** The link a like notification of this target starts with (idea page, or the page scrolled to the comment). */
export function likeBaseLink(ideaId: string, commentId?: string | null): string {
  return commentId ? `/ideas/${ideaId}?comment=${commentId}` : `/ideas/${ideaId}`;
}

export interface LikeRowLite {
  id: string;
  link: string | null;
  isRead: boolean;
}

export type LikePlan =
  | { action: "skip" }
  | { action: "create"; link: string; count: number }
  | { action: "update"; id: string; link: string; count: number };

/**
 * What to do when `actorId` likes the target `base`. `rows` = all notifications (read or not) of this recipient with this type whose
 * link starts with the target (any order; the newest unread one is picked by the caller's order — pass newest first).
 */
export function planLikeNotification(rows: readonly LikeRowLite[], base: string, actorId: string): LikePlan {
  const tok = actorToken(actorId);
  const mine = rows.map((r) => ({ r, p: parseLikeLink(r.link) })).filter((x) => x.p.base === base);
  if (mine.some((x) => x.p.tokens.includes(tok))) return { action: "skip" };
  const open = mine.find((x) => !x.r.isRead);
  if (!open) return { action: "create", link: buildLikeLink(base, 1, [tok]), count: 1 };
  const count = Math.max(open.p.count, open.p.tokens.length, 1) + 1;
  return { action: "update", id: open.r.id, link: buildLikeLink(base, count, [...open.p.tokens, tok]), count };
}

/** Title of the notification: «Имя оценил(а) вашу идею» for the first liker, «Имя и ещё N оценили вашу идею» after that (N = the others). */
export function likeTitle(kind: LikeKind, name: string, count: number): NotifText {
  const base = kind === "idea_like" ? "notif.ideaLike" : "notif.commentLike";
  return count > 1 ? { key: `${base}.many`, vars: { name, n: count - 1 } } : { key: `${base}.title`, vars: { name } };
}

/** Body: the idea title / a preview of the comment, in guillemets, cut at `max` characters. null = nothing to show. */
export function likeBody(text: string | null | undefined, max = 80): string | undefined {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return `«${t.length > max ? t.slice(0, max - 1) + "…" : t}»`;
}
