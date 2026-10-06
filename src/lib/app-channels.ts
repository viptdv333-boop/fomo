// Pure helpers of the app-only «Каналы» / «Авторы» screens (lists, channel page, author page, subscribe sheet).
// No React, no DOM: scripts/check-app-ui.ts runs them.

/* ---------- data shapes (what /api/channels, /api/authors, /api/users/[id], /api/subscriptions return) ---------- */

export interface ChannelAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number | string;
}

export interface ChannelInstrument {
  id: string;
  name: string;
  ticker?: string | null;
  slug?: string;
}

export interface ChannelItem {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  subscribersCount: number;
  ideasCount?: number;
  avatarUrl?: string | null;
  author: ChannelAuthor;
  instruments?: ChannelInstrument[];
  authorTelegramNotify?: boolean;
}

export interface AuthorItem {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  fomoId: string | null;
  rating: number | string;
  role?: string;
  ideasCount: number;
  subscribersCount: number;
  bio: string | null;
  createdAt: string;
  specializations?: string[];
  exchangeExperience?: string | null;
}

/** One entry of GET /api/subscriptions: a paid subscription (to a channel, or the old author-wide one) or a free follow. */
export interface SubscriptionEntry {
  id: string;
  type: "paid" | "free";
  tariffId?: string | null;
  endDate?: string | null;
  telegramNotify?: boolean;
  author: { id: string };
}

/* ---------- numbers and plurals ---------- */

export function ratingText(r: unknown): string {
  const n = Number(r);
  return Number.isFinite(n) ? n.toFixed(1) : "0.0";
}

type Loc = string;
const loc = (l: Loc): "ru" | "en" | "cn" => (l === "en" || l === "cn" ? l : "ru");

/** Russian plural form: 1 / 2-4 / 5+ (11-14 are «many»). */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(Math.trunc(n));
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** 1500 -> "1 500" (no-break space in ru, comma in en / cn); a fractional price keeps two decimals. */
export function groupDigits(n: number, locale: Loc = "ru"): string {
  const v = Number.isFinite(n) ? n : 0;
  const neg = v < 0;
  const fixed = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(2);
  const [int, frac] = fixed.split(".");
  const sep = loc(locale) === "ru" ? " " : ",";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return (neg ? "-" : "") + grouped + (frac ? (loc(locale) === "ru" ? "," : ".") + frac : "");
}

/** "1 500 ₽" */
export function priceLabel(price: number, locale: Loc = "ru"): string {
  return `${groupDigits(price, locale)} ₽`;
}

/** "30 дней" / "1 day" / "30天" */
export function daysLabel(days: number, locale: Loc = "ru"): string {
  const l = loc(locale);
  if (l === "en") return `${days} ${days === 1 ? "day" : "days"}`;
  if (l === "cn") return `${days}天`;
  return `${days} ${pluralRu(days, "день", "дня", "дней")}`;
}

/** «Месяц» / «Год»: the name of a subscription period by its length (the design's tariff title); other lengths are shown in days. */
export function periodName(days: number, locale: Loc = "ru"): string {
  const l = loc(locale);
  const NAMES: Record<number, { ru: string; en: string; cn: string }> = {
    7: { ru: "Неделя", en: "Week", cn: "一周" },
    30: { ru: "Месяц", en: "Month", cn: "一个月" },
    31: { ru: "Месяц", en: "Month", cn: "一个月" },
    90: { ru: "Квартал", en: "Quarter", cn: "一个季度" },
    180: { ru: "Полгода", en: "Half a year", cn: "半年" },
    365: { ru: "Год", en: "Year", cn: "一年" },
  };
  return NAMES[days]?.[l] ?? daysLabel(days, l);
}

/** "1 500 ₽ / 30 дней": the bold part of «от … / …» on the channel card. */
export function priceAndPeriod(price: number, days: number, locale: Loc = "ru"): string {
  return `${priceLabel(price, locale)} / ${daysLabel(days, locale)}`;
}

/** "12 идей" */
export function ideasLabel(n: number, locale: Loc = "ru"): string {
  const l = loc(locale);
  const v = Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0));
  if (l === "en") return `${v} ${v === 1 ? "idea" : "ideas"}`;
  if (l === "cn") return `${v} 个想法`;
  return `${v} ${pluralRu(v, "идея", "идеи", "идей")}`;
}

/** "214 подписчиков" */
export function subscribersLabel(n: number, locale: Loc = "ru"): string {
  const l = loc(locale);
  const v = Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0));
  if (l === "en") return `${v} ${v === 1 ? "subscriber" : "subscribers"}`;
  if (l === "cn") return `${v} 位订阅者`;
  return `${v} ${pluralRu(v, "подписчик", "подписчика", "подписчиков")}`;
}

const MONTHS: Record<"ru" | "en", string[]> = {
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** "4 ноября" / "Nov 4" / "11月4日"; another year than the current one is appended ("4 ноября 2027"). Junk -> "". */
export function endDateLabel(value: string | number | Date | null | undefined, locale: Loc = "ru", now: number = Date.now()): string {
  if (value === null || value === undefined || value === "") return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const l = loc(locale);
  const day = d.getDate();
  const month = d.getMonth();
  const withYear = d.getFullYear() !== new Date(now).getFullYear();
  const y = d.getFullYear();
  if (l === "en") return `${MONTHS.en[month]} ${day}${withYear ? `, ${y}` : ""}`;
  if (l === "cn") return `${withYear ? `${y}年` : ""}${month + 1}月${day}日`;
  return `${day} ${MONTHS.ru[month]}${withYear ? ` ${y}` : ""}`;
}

/** Whole days left until the end date (0 when past or junk). */
export function daysLeft(endDate: string | number | Date | null | undefined, now: number = Date.now()): number {
  if (endDate === null || endDate === undefined) return 0;
  const t = new Date(endDate).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - now) / 86400000));
}

/* ---------- channel card ---------- */

const EMOJIS = ["\u{1F4CA}", "\u{1F4C8}", "\u{1F6E2}️", "\u{1F3E6}", "\u{1FA99}", "\u{1F4A0}", "\u{1F947}", "\u{1F4B1}", "\u{1F9ED}", "\u{1F4C9}"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A channel has a picture or nothing: the tile of the design shows an emoji, so a channel without a picture gets a stable one picked from its id. */
export function channelEmoji(id: string): string {
  return EMOJIS[hash(id || "") % EMOJIS.length];
}

/** "#SBER", "#нефть": the channel's instruments (ticker, else name), duplicates dropped. */
export function channelTags(ch: Pick<ChannelItem, "instruments">): string[] {
  const out: string[] = [];
  for (const i of ch.instruments ?? []) {
    const v = (i.ticker || i.name || "").trim().replace(/\s+/g, "");
    if (v && !out.includes(`#${v}`)) out.push(`#${v}`);
  }
  return out;
}

export type ChannelStatusKind = "own" | "active" | "pending" | "buy";

export interface ChannelStatus {
  kind: ChannelStatusKind;
  /** end date of the active subscription (ISO), else "" */
  endDate: string;
}

/** What the channel card's pill says: own channel, active subscription (until a date), payment waiting for the author's confirmation, or «Оформить». */
export function channelStatus(p: { own: boolean; endDate?: string | null; pending?: boolean }): ChannelStatus {
  if (p.own) return { kind: "own", endDate: "" };
  if (p.endDate) return { kind: "active", endDate: p.endDate };
  if (p.pending) return { kind: "pending", endDate: "" };
  return { kind: "buy", endDate: "" };
}

/** The viewer's subscriptions indexed for the lists: end date per channel, the old author-wide ones, free follows. */
export interface SubIndex {
  paidByChannel: Map<string, string>;
  paidByAuthor: Map<string, string>;
  /** every author the viewer has an active paid subscription to (channel or old author-wide) */
  paidAuthorIds: Set<string>;
  follows: Set<string>;
  /** id of the subscription row per channel (telegram toggle) */
  subByChannel: Map<string, { id: string; telegramNotify: boolean }>;
}

export function buildSubIndex(entries: unknown): SubIndex {
  const idx: SubIndex = { paidByChannel: new Map(), paidByAuthor: new Map(), paidAuthorIds: new Set(), follows: new Set(), subByChannel: new Map() };
  if (!Array.isArray(entries)) return idx;
  for (const raw of entries) {
    const e = raw as SubscriptionEntry;
    if (!e || !e.author || !e.author.id) continue;
    if (e.type === "free") {
      idx.follows.add(e.author.id);
    } else if (e.type === "paid") {
      const end = e.endDate || "";
      idx.paidAuthorIds.add(e.author.id);
      if (e.tariffId) {
        const prev = idx.paidByChannel.get(e.tariffId);
        if (!prev || new Date(end).getTime() > new Date(prev).getTime()) idx.paidByChannel.set(e.tariffId, end);
        idx.subByChannel.set(e.tariffId, { id: e.id, telegramNotify: !!e.telegramNotify });
      } else {
        idx.paidByAuthor.set(e.author.id, end);
      }
    }
  }
  return idx;
}

/** End date of the viewer's subscription to a channel: its own, or the old author-wide one ("" when none). */
export function channelSubEnd(idx: SubIndex, ch: { id: string; author: { id: string } }): string {
  return idx.paidByChannel.get(ch.id) || idx.paidByAuthor.get(ch.author.id) || "";
}

/** Channels with a payment request waiting for the author (GET /api/payments?role=buyer). */
export function pendingChannelIds(payments: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(payments)) return out;
  for (const p of payments) {
    const r = p as { status?: string; tariffId?: string | null };
    if (r && r.status === "PENDING" && r.tariffId) out.add(r.tariffId);
  }
  return out;
}

/** True when the viewer follows the author (free follow) or has any paid subscription to them. */
export function isSubscribedToAuthor(idx: SubIndex, authorId: string): boolean {
  return idx.follows.has(authorId) || idx.paidAuthorIds.has(authorId);
}

/* ---------- authors ---------- */

/** Trader types of the profile form -> dictionary keys (feed2.spec.*). */
export const SPEC_KEYS: Record<string, string> = {
  trader: "feed2.spec.trader",
  analyst: "feed2.spec.analyst",
  investor: "feed2.spec.investor",
  scalper: "feed2.spec.scalper",
  algotrader: "feed2.spec.algotrader",
};

const YEARS_WORD: Record<"ru" | "en" | "cn", (n: number) => string> = {
  ru: (n) => `${n} ${pluralRu(n, "год", "года", "лет")} на бирже`,
  en: (n) => `${n} ${n === 1 ? "year" : "years"} on the exchange`,
  cn: (n) => `${n}年交易经验`,
};

/**
 * «8 лет на бирже» from the free-text field «Опыт на бирже» of the profile. A bare number or a number with a year word ("8", "8 лет", "12 years")
 * becomes the sentence; any other text the author wrote ("с 2015 года", "более 5 лет") is shown as written; empty -> "".
 */
export function yearsOnExchangeText(raw: string | null | undefined, locale: Loc = "ru"): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const m = /^(\d{1,2})(?:[.,]\d+)?\s*(?:лет|года|год|г\.?|years?|yrs?|y|年)?$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 0 && n < 100) return YEARS_WORD[loc(locale)](n);
  }
  return s.length > 40 ? `${s.slice(0, 39).trimEnd()}…` : s;
}

/** «Фьючерсы, сырьё · 8 лет на бирже» (on the author page «Фьючерсы · Москва · 8 лет на бирже»): specialization labels, the city, the experience; empty parts are left out. */
export function authorSubline(specLabels: string[], exp: string, city: string = ""): string {
  return [specLabels.filter(Boolean).join(", "), city, exp].filter((p) => p && p.trim()).join(" · ");
}

/** Specialization codes -> readable labels (unknown codes are shown as typed). */
export function specLabels(codes: string[] | undefined, t: (key: string) => string): string[] {
  return (codes ?? []).map((c) => (SPEC_KEYS[c] ? t(SPEC_KEYS[c]) : c)).filter(Boolean);
}

/* ---------- search / sort ---------- */

const norm = (s: unknown) => String(s ?? "").toLowerCase();

/** Channel search: name, author, description, tags. */
export function filterChannels<T extends ChannelItem>(list: T[], query: string): T[] {
  const q = norm(query).trim();
  if (!q) return list;
  return list.filter((c) => norm(c.name).includes(q) || norm(c.author.displayName).includes(q) || norm(c.description).includes(q) || channelTags(c).some((t) => norm(t).includes(q)) || norm(c.slug).includes(q));
}

export type ChannelSort = "subscribers" | "rating" | "price";
export type SortDir = "asc" | "desc";

export function sortChannels<T extends ChannelItem>(list: T[], field: ChannelSort, dir: SortDir): T[] {
  const val = (c: T) => (field === "price" ? Number(c.price) : field === "rating" ? Number(c.author.rating) : Number(c.subscribersCount));
  return [...list].sort((a, b) => (dir === "desc" ? val(b) - val(a) : val(a) - val(b)));
}

/** Channels filtered by one instrument (the old page's «Инструмент» filter). */
export function channelsWithInstrument<T extends ChannelItem>(list: T[], instrumentId: string): T[] {
  if (!instrumentId) return list;
  return list.filter((c) => (c.instruments ?? []).some((i) => i.id === instrumentId));
}

/** Distinct instruments of all channels, in order of first appearance. */
export function channelInstruments(list: ChannelItem[]): ChannelInstrument[] {
  const seen = new Map<string, ChannelInstrument>();
  for (const c of list) for (const i of c.instruments ?? []) if (!seen.has(i.id)) seen.set(i.id, i);
  return [...seen.values()];
}

/** Author search: name, #id, bio, specialization labels. */
export function filterAuthors<T extends AuthorItem>(list: T[], query: string, specText: (a: T) => string = () => ""): T[] {
  const q = norm(query).trim().replace(/^#/, "");
  if (!q) return list;
  return list.filter((a) => norm(a.displayName).includes(q) || norm(a.fomoId).includes(q) || norm(a.bio).includes(q) || norm(specText(a)).includes(q) || norm(a.exchangeExperience).includes(q));
}

export type AuthorSort = "rating" | "createdAt" | "subscribersCount" | "ideasCount";

export function sortAuthors<T extends AuthorItem>(list: T[], field: AuthorSort, dir: SortDir): T[] {
  const val = (a: T) => (field === "rating" ? Number(a.rating) : field === "createdAt" ? new Date(a.createdAt).getTime() : field === "ideasCount" ? a.ideasCount : a.subscribersCount);
  return [...list].sort((a, b) => (dir === "desc" ? val(b) - val(a) : val(a) - val(b)));
}

/** «ТОП 1..3» badges of the old pages: the three channels with most subscribers (only when there are at least three channels). */
export function topChannelRanks(list: ChannelItem[]): Map<string, number> {
  const out = new Map<string, number>();
  if (list.length < 3) return out;
  [...list].sort((a, b) => b.subscribersCount - a.subscribersCount).slice(0, 3).forEach((c, i) => out.set(c.id, i + 1));
  return out;
}

/** Podium of the old authors page (needs three authors): the site owner first, then the top three by rating. rank 0 = owner. */
export function authorPodium(list: AuthorItem[]): Map<string, number> {
  const out = new Map<string, number>();
  if (list.length < 3) return out;
  const owner = list.find((a) => a.role === "OWNER");
  if (owner) out.set(owner.id, 0);
  [...list].filter((a) => a.role !== "OWNER").sort((a, b) => Number(b.rating) - Number(a.rating)).slice(0, 3).forEach((a, i) => out.set(a.id, i + 1));
  return out;
}

/* ---------- routes ---------- */

/** A route parameter as typed (percent-decoded); a malformed escape is left as it is instead of throwing. */
export function safeDecode(v: unknown): string {
  const s = String(v ?? "");
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Public base of the share links. */
export const SHARE_BASE = "https://fomo.spot";

export function channelSlugOrId(ch: Pick<ChannelItem, "id" | "slug">): string {
  return ch.slug || ch.id;
}

export function channelPath(ch: Pick<ChannelItem, "id" | "slug">): string {
  return `/channels/${encodeURIComponent(channelSlugOrId(ch))}`;
}

/** The author page: by #id when the author has one (the site's /authors/<fomoId>), else by user id (/profile/<id>). */
export function authorPath(a: { id: string; fomoId?: string | null }): string {
  return a.fomoId ? `/authors/${encodeURIComponent(a.fomoId)}` : `/profile/${encodeURIComponent(a.id)}`;
}

/** Days the owner can add to a subscription / to everybody: whole days 1..3650. */
export function validGrantDays(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : null;
}

/** Image receipts only, up to 10 MB (the same limits as the payment modal). */
export function receiptProblem(file: { type: string; size: number }): "type" | "size" | null {
  if (!file.type.startsWith("image/")) return "type";
  if (file.size > 10 * 1024 * 1024) return "size";
  return null;
}
