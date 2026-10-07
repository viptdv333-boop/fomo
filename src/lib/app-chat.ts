// Pure helpers of the app-only Chat screens (src/components/app/chat/*). No React, no DOM: scripts/check-app-ui.ts runs them.
import { badgeLabel } from "@/lib/app-ui";
import { stripLocale } from "@/lib/i18n/locale-url";

/* ---------- data shapes (what the site's chat APIs return) ---------- */

export interface AssetItem {
  id: string;
  name: string;
  slug: string;
  chatRoom: { id: string; isClosed?: boolean; isArchived?: boolean } | null;
  category: { slug: string; name: string } | null;
}

export interface CategoryGroup {
  slug: string;
  name: string;
  assets: AssetItem[];
}

export interface PrivateRoom {
  id: string;
  name: string;
  membersCount: number;
  isOwner: boolean;
  inviteToken?: string;
}

export interface FavoriteRoom {
  roomId: string;
  name: string;
  isPrivate: boolean;
  assetSlug: string | null;
}

export interface RoomPreview {
  userId: string;
  author: string;
  text: string;
  fileName: string | null;
  createdAt: string;
}

/** Category slug -> dictionary key of its title (same strings as the site's chat sidebar). */
export const CAT_I18N: Record<string, string> = {
  "ru-stocks": "terminal.stocksRu",
  "us-stocks": "cat.stocksUs",
  indices: "terminal.indices",
  currencies: "terminal.currencies",
  crypto: "terminal.crypto",
  commodities: "terminal.commodities",
  metals: "terminal.metals",
};

export const CAT_EMOJI: Record<string, string> = {
  "ru-stocks": "\u{1F1F7}\u{1F1FA}",
  "us-stocks": "\u{1F1FA}\u{1F1F8}",
  indices: "\u{1F4CA}",
  currencies: "\u{1F4B1}",
  crypto: "₿",
  commodities: "\u{1F6E2}️",
  metals: "\u{1F947}",
};
export const GENERAL_EMOJI = "\u{1F4AC}";
export const PRIVATE_EMOJI = "\u{1F512}";
export const OTHER_EMOJI = "\u{1F4C1}";

/* ---------- grouping of the Болталка list ---------- */

export interface RoomRowModel {
  id: string;
  name: string;
  tile: string;
  /** public rooms open as /chat?room=ID; private groups too (same thread screen) */
  isPrivate: boolean;
  assetSlug: string | null;
  unread: number;
  /** unread @mentions / replies to me in this room (they get the bolder «@» marker next to the count) */
  mention: number;
  fav: boolean;
  bell: boolean;
}

export interface RoomGroupModel {
  key: string;
  kind: "fav" | "general" | "cat" | "private";
  /** null: the design prints no heading above the general chat */
  title: string | null;
  /** topics (categories) fold; the rest are always open */
  collapsible: boolean;
  open: boolean;
  /** rooms of the topic (for the count next to its name) */
  count: number;
  /** unread of the whole topic, shown on the folded heading */
  unread: number;
  /** unread mentions of the whole topic (the «@» marker of the folded heading) */
  mention: number;
  rows: RoomRowModel[];
}

export interface RoomGroupInput {
  categories: CategoryGroup[];
  privateRooms: PrivateRoom[];
  favorites: FavoriteRoom[];
  generalRoomId: string | null;
  unread: Record<string, number>;
  /** roomId -> unread mentions / replies (optional: older callers have none) */
  mentions?: Record<string, number>;
  notify: ReadonlySet<string>;
  openCats: ReadonlySet<string>;
  query: string;
  labels: { general: string; favorites: string; privateGroups: string; other: string };
  catTitle: (slug: string, name: string) => string;
}

export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || name.toLowerCase().includes(q);
}

/**
 * The list order: the general chat (no heading, always first), Избранное, the topics, Приватные группы. Empty groups are dropped,
 * a search folds nothing away: every topic that has a match opens. Rooms an admin hid (isArchived) never get here (the loader filters them).
 */
export function buildRoomGroups(inp: RoomGroupInput): RoomGroupModel[] {
  const searching = inp.query.trim().length > 0;
  const un = (id: string) => inp.unread[id] || 0;
  const men = (id: string) => Math.min(inp.mentions?.[id] || 0, inp.unread[id] || 0);
  const fav = new Set(inp.favorites.map((f) => f.roomId));
  const row = (id: string, name: string, tile: string, isPrivate: boolean, assetSlug: string | null): RoomRowModel => ({
    id,
    name,
    tile,
    isPrivate,
    assetSlug,
    unread: un(id),
    mention: men(id),
    fav: fav.has(id),
    bell: inp.notify.has(id),
  });
  const groups: RoomGroupModel[] = [];
  // a starred room keeps the tile it has in its own group
  const tiles = new Map<string, string>([[inp.generalRoomId || "general", GENERAL_EMOJI]]);
  for (const c of inp.categories) for (const a of c.assets) if (a.chatRoom) tiles.set(a.chatRoom.id, CAT_EMOJI[c.slug] || OTHER_EMOJI);
  for (const r of inp.privateRooms) tiles.set(r.id, PRIVATE_EMOJI);

  if (matchesQuery(inp.labels.general, inp.query)) {
    const id = inp.generalRoomId || "general";
    groups.push({ key: "general", kind: "general", title: null, collapsible: false, open: true, count: 1, unread: 0, mention: 0, rows: [row(id, inp.labels.general, GENERAL_EMOJI, false, null)] });
  }

  const favRows = inp.favorites
    .filter((f) => matchesQuery(f.name, inp.query))
    .map((f) => row(f.roomId, f.name, tiles.get(f.roomId) || (f.isPrivate ? PRIVATE_EMOJI : OTHER_EMOJI), f.isPrivate, f.assetSlug));
  if (favRows.length) groups.push({ key: "fav", kind: "fav", title: inp.labels.favorites, collapsible: false, open: true, count: favRows.length, unread: 0, mention: 0, rows: favRows });

  for (const cat of inp.categories) {
    const all = cat.assets.filter((a) => a.chatRoom);
    const shown = all.filter((a) => matchesQuery(a.name, inp.query));
    if (!shown.length) continue;
    const rows = shown.map((a) => row(a.chatRoom!.id, a.name, CAT_EMOJI[cat.slug] || OTHER_EMOJI, false, a.slug));
    groups.push({
      key: `cat:${cat.slug}`,
      kind: "cat",
      title: inp.catTitle(cat.slug, cat.name),
      collapsible: true,
      open: searching || inp.openCats.has(cat.slug),
      count: all.length,
      unread: all.reduce((s, a) => s + un(a.chatRoom!.id), 0),
      mention: all.reduce((s, a) => s + men(a.chatRoom!.id), 0),
      rows,
    });
  }

  const priv = inp.privateRooms.filter((r) => matchesQuery(r.name, inp.query)).map((r) => row(r.id, r.name, PRIVATE_EMOJI, true, null));
  if (priv.length) groups.push({ key: "private", kind: "private", title: inp.labels.privateGroups, collapsible: false, open: true, count: priv.length, unread: 0, mention: 0, rows: priv });
  return groups;
}

/** Categories of the site's /api/assets answer, rooms an admin hid dropped, grouped by category slug in first-seen order. */
export function groupAssets(assets: AssetItem[], otherName: string): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>();
  for (const a of assets) {
    if (a.chatRoom?.isArchived) continue;
    const key = a.category?.slug || "other";
    if (!map.has(key)) map.set(key, { slug: key, name: a.category?.name || otherName, assets: [] });
    map.get(key)!.assets.push(a);
  }
  return [...map.values()];
}

/* ---------- unread badges ---------- */

export { badgeLabel };

/** Sum of the DM unread counters shown on the «Личные» segment; muted conversations (ids) do not count, as they do not count in the dock. */
export function dmUnreadTotal(convs: { id?: string; unread?: boolean; unreadCount?: number }[], muted: readonly string[] = []): number {
  let n = 0;
  for (const c of convs) {
    if (c.id && muted.includes(c.id)) continue;
    n += typeof c.unreadCount === "number" ? Math.max(0, c.unreadCount) : c.unread ? 1 : 0;
  }
  return n;
}

/**
 * The first message the reader has not seen: the oldest message of somebody else (not deleted) newer than the read marker.
 * null: no marker (the room was never opened — the thread lands on the newest message) or nothing is unread.
 */
export function firstUnreadId(msgs: { id: string; createdAt: string; mine: boolean; deleted?: boolean }[], readAt: string | number | Date | null | undefined): string | null {
  if (readAt === null || readAt === undefined || readAt === "") return null;
  const mark = new Date(readAt).getTime();
  if (!Number.isFinite(mark)) return null;
  for (const m of msgs) {
    if (m.mine || m.deleted) continue;
    const t = new Date(m.createdAt).getTime();
    if (Number.isFinite(t) && t > mark) return m.id;
  }
  return null;
}

/* ---------- dialogs ---------- */

export interface DialogLike {
  id: string;
  otherUser: { id: string; displayName: string } | null;
  lastMessage: { createdAt: string } | null;
  updatedAt?: string;
}

export interface DmMarks {
  /** conversation ids, at most DM_PIN_MAX */
  pinned: readonly string[];
  /** user ids */
  favorites: readonly string[];
  /** conversation ids */
  muted: readonly string[];
}
export const NO_MARKS: DmMarks = { pinned: [], favorites: [], muted: [] };
export const DM_PIN_MAX = 5;

/**
 * The «Личные» order of the old page: pinned chats first, then chats with a starred person, then the rest, each part newest first
 * (by the last message, then by the conversation's own update time). Filtered by the search text.
 */
export function sortFilterDialogs<T extends DialogLike>(list: T[], query: string, deletedName = "", marks: DmMarks = NO_MARKS): T[] {
  const t = (c: T) => new Date(c.lastMessage?.createdAt || c.updatedAt || 0).getTime() || 0;
  const rank = (c: T) => (marks.pinned.includes(c.id) ? 0 : c.otherUser && marks.favorites.includes(c.otherUser.id) ? 1 : 2);
  return list
    .filter((c) => matchesQuery(c.otherUser?.displayName || deletedName, query))
    .sort((a, b) => rank(a) - rank(b) || t(b) - t(a));
}

/** Adds the id when absent, removes it when present. */
export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Pin / unpin; a sixth pin is refused (the list comes back unchanged), as on the old page. */
export function togglePin(list: readonly string[], id: string, max: number = DM_PIN_MAX): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return list.length >= max ? [...list] : [...list, id];
}

/** localStorage JSON of an id list; anything but an array of strings reads as empty. */
export function parseIdList(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/* ---------- chat look settings (kept under the old page's localStorage keys) ---------- */

export const DM_KEYS = { favorites: "fomo-favorites", pinned: "fomo-pinned-chats", muted: "fomo-muted-chats", bg: "fomo-chat-bg", notif: "fomo-chat-notif", font: "fomo-chat-font-v2" } as const;

/** Backgrounds of the old settings gear. The old list had "green" twice (labelled Голубой and Зелёный, same look): one swatch is enough. */
export const CHAT_BGS: { id: string; labelKey: string; css: string }[] = [
  { id: "default", labelKey: "msg.themeDefault", css: "" },
  { id: "purple", labelKey: "msg.themePurple", css: "linear-gradient(180deg, rgba(139, 92, 246, 0.22), rgba(139, 92, 246, 0.08))" },
  { id: "green", labelKey: "msg.themeGreen", css: "linear-gradient(180deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.07))" },
  { id: "dark", labelKey: "msg.themeDark", css: "linear-gradient(180deg, rgba(120, 120, 120, 0.22), rgba(0, 0, 0, 0.25))" },
  { id: "warm", labelKey: "msg.themeWarm", css: "linear-gradient(180deg, rgba(245, 158, 11, 0.2), rgba(249, 115, 22, 0.08))" },
];
export function bgCss(id: string | null | undefined): string {
  return CHAT_BGS.find((b) => b.id === id)?.css ?? "";
}
export const FONT_MIN = 0;
export const FONT_MAX = 10;
export const FONT_DEFAULT = 1;
/** The old slider's 0..10; junk reads as the default. */
export function parseFontLevel(raw: string | null | undefined): number {
  const n = Number(raw);
  return raw !== null && raw !== undefined && raw !== "" && Number.isFinite(n) ? Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n))) : FONT_DEFAULT;
}
/** Message text size: the design's 15px at the default level 1, two pixels per step. */
export function fontPx(level: number): number {
  return 13 + 2 * Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(level)));
}

/** Pinned messages joined like the old banner: first 40 characters of each, a paperclip for a bare file. */
export function pinnedLine(msgs: { text: string; isPinned?: boolean; isDeleted?: boolean }[], fileWord: string): string {
  return msgs
    .filter((m) => m.isPinned && !m.isDeleted)
    .map((m) => m.text.slice(0, 40) || `\u{1F4CE} ${fileWord}`)
    .join(", ");
}

/** «> Автор: текст» draft of the «Цитировать» action. */
export function quoteDraft(author: string, text: string): string {
  return `> ${author}: ${text}\n\n`;
}

/** People of a room as far as the loaded messages show them: unique authors, newest speaker first. */
export function roomMembers<M extends { user: { id: string; displayName: string; avatarUrl: string | null } }>(msgs: M[]): { id: string; displayName: string; avatarUrl: string | null }[] {
  const seen = new Map<string, { id: string; displayName: string; avatarUrl: string | null }>();
  for (let i = msgs.length - 1; i >= 0; i--) if (!seen.has(msgs[i].user.id)) seen.set(msgs[i].user.id, msgs[i].user);
  return [...seen.values()];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ---------- times ---------- */

const DAYS = {
  ru: { today: "Сегодня", yesterday: "Вчера", yesterdayShort: "вчера", wd: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"], months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"] },
  en: { today: "Today", yesterday: "Yesterday", yesterdayShort: "yesterday", wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
  cn: { today: "今天", yesterday: "昨天", yesterdayShort: "昨天", wd: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"], months: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"] },
} as const;

const p2 = (n: number) => String(n).padStart(2, "0");
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const words = (locale: string) => DAYS[(locale === "en" || locale === "cn" ? locale : "ru") as "ru" | "en" | "cn"];

/** "12:04" */
export function clockLabel(value: string | number | Date): string {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : "";
}

/** Whole days between two moments by the calendar (0 = same day). */
export function daysBetween(value: string | number | Date, now: number): number {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return 0;
  return Math.round((startOfDay(new Date(now)) - startOfDay(d)) / 86_400_000);
}

/** Time on the right of a list row, like the design: «12:04» today, «вчера», a weekday within a week, then «05.10» ("05.10.25" for other years). */
export function listTimeLabel(value: string | number | Date | null | undefined, locale: string, now: number = Date.now()): string {
  if (value === null || value === undefined || value === "") return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const w = words(locale);
  const ago = daysBetween(d, now);
  if (ago < 0) return clockLabel(d);
  if (ago === 0) return clockLabel(d);
  if (ago === 1) return w.yesterdayShort;
  if (ago < 7) return w.wd[d.getDay()];
  const base = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base}.${String(d.getFullYear()).slice(2)}`;
}

/** Day separator of a conversation: «Сегодня», «Вчера», «5 октября» ("5 октября 2025" for other years). */
export function dayLabel(value: string | number | Date, locale: string, now: number = Date.now()): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const w = words(locale);
  const ago = daysBetween(d, now);
  if (ago === 0) return w.today;
  if (ago === 1) return w.yesterday;
  const month = w.months[d.getMonth()];
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  if (locale === "cn") return `${sameYear ? "" : d.getFullYear() + "年"}${month}${d.getDate()}日`;
  return `${d.getDate()} ${month}${sameYear ? "" : " " + d.getFullYear()}`;
}

export type ThreadItem<M> = { kind: "day"; key: string; label: string } | { kind: "new"; key: string } | { kind: "msg"; key: string; msg: M };

/** Messages (oldest first) with a day separator before the first message of every calendar day, and «Новые сообщения» right above `newFromId`. */
export function withDaySeparators<M extends { id: string; createdAt: string }>(msgs: M[], locale: string, now: number = Date.now(), newFromId: string | null = null): ThreadItem<M>[] {
  const out: ThreadItem<M>[] = [];
  let last = "";
  for (const m of msgs) {
    const d = new Date(m.createdAt);
    const day = Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "";
    if (day && day !== last) {
      out.push({ kind: "day", key: `d:${day}`, label: dayLabel(d, locale, now) });
      last = day;
    }
    if (newFromId && m.id === newFromId) out.push({ kind: "new", key: "new" });
    out.push({ kind: "msg", key: m.id, msg: m });
  }
  return out;
}

/* ---------- previews ---------- */

/** «Автор: текст» of a room row (the design prints the author before the text); a file without a caption reads «Автор: 📎 name». */
export function roomPreviewLine(p: { userId?: string; author: string; text: string; fileName?: string | null } | null | undefined, myId: string | undefined, youWord: string, fileWord: string): string {
  if (!p) return "";
  const body = (p.text || "").replace(/\s+/g, " ").trim() || `\u{1F4CE} ${p.fileName || fileWord}`;
  const who = p.userId && myId && p.userId === myId ? youWord : p.author;
  return who ? `${who}: ${body}` : body;
}

/** «Вы: текст» / «текст» of a dialog row. */
export function dialogPreviewLine(last: { text: string; senderId: string } | null | undefined, myId: string | undefined, youPrefix: string, fileWord: string): string {
  if (!last) return "";
  const body = (last.text || "").replace(/\s+/g, " ").trim() || `\u{1F4CE} ${fileWord}`;
  return `${last.senderId === myId ? youPrefix : ""}${body}`;
}

/* ---------- message text ---------- */

/** Escapes the text first (it is user input rendered as HTML), then highlights links, @mentions and instrument :shortcodes:. */
export function messageHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow" class="ac-link">$1</a>')
    .replace(/@(\S+)/g, '<span class="ac-mention">@$1</span>')
    .replace(/:([a-z0-9-]+):/g, '<img src="/icons/instruments/$1.svg" alt="$1" class="ac-emo" />');
}

/* ---------- URL state ---------- */

export type ChatSeg = "rooms" | "dms";

export interface ChatRoute {
  seg: ChatSeg;
  /** open room thread (болталка or private group) */
  room: string | null;
  /** open personal conversation */
  dm: string | null;
  /** start (or open) a conversation with this user */
  with: string | null;
  /** the "Комнаты" screen (my private groups) */
  groups: boolean;
}

/** Reads the chat screen from the page path and query. /messages is the personal segment, /rooms/<id> (links of notifications) a private group; ?conversation= and ?startWith= are the old links. */
export function parseChatRoute(pathname: string, params: { get(name: string): string | null }): ChatRoute {
  const path = stripLocale((pathname || "").split(/[?#]/)[0]).path;
  const onMessages = /^\/messages\/?$/.test(path);
  const groupId = /^\/rooms\/([^/]+)\/?$/.exec(path)?.[1];
  const seg: ChatSeg = params.get("seg") === "dms" || (onMessages && params.get("seg") !== "rooms") ? "dms" : "rooms";
  const room = params.get("room") || (groupId && groupId !== "join" ? decodeURIComponent(groupId) : null);
  const dm = params.get("dm") || params.get("conversation");
  const withUser = params.get("with") || params.get("startWith");
  return {
    seg: room ? "rooms" : dm || withUser ? "dms" : seg,
    room: room || null,
    dm: dm || null,
    with: withUser || null,
    groups: params.get("groups") === "1",
  };
}

/** Query string of a chat screen (no leading "?"); the app preview flag and share marker of the current URL are kept by the caller. */
export function chatQuery(r: Partial<ChatRoute>): string {
  const q: string[] = [];
  if (r.room) q.push(`room=${encodeURIComponent(r.room)}`);
  else if (r.dm) q.push(`seg=dms`, `dm=${encodeURIComponent(r.dm)}`);
  else if (r.with) q.push(`seg=dms`, `with=${encodeURIComponent(r.with)}`);
  else if (r.groups) q.push("groups=1");
  else if (r.seg === "dms") q.push("seg=dms");
  return q.join("&");
}

/* ---------- emoji of the personal composer (the same sets as the site's DM page) ---------- */

export const DM_EMOJI: { key: string; labelKey: string; emojis: string[] }[] = [
  { key: "freq", labelKey: "msg.freq", emojis: ["👍", "❤️", "😂", "🔥", "👎", "😊", "🎉", "💯", "🙏", "😭", "🤣", "😍", "🥰", "😘", "😎", "🤔"] },
  { key: "faces", labelKey: "msg.faces", emojis: ["😀", "😃", "😄", "😁", "😅", "😆", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥"] },
  { key: "gestures", labelKey: "msg.gestures", emojis: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏"] },
  { key: "symbols", labelKey: "msg.symbols", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "⭐", "🌟", "✨", "⚡", "🔥", "💥", "🎉", "🎊", "💯", "✅", "❌", "⚠️", "🚀"] },
];
