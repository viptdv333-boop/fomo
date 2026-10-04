import { eventId } from "./normalize";
import type { CalEvent } from "./types";

/*
 * MOSCOW EXCHANGE LAYER (country RU, category "moex"), merged into every calendar answer as an extra layer.
 *
 * What the public ISS really offers (probed): /iss/calendars*.json answer with an HTML page, /iss/events.json is empty and the
 * dividends route returns the instrument card, so neither an official trading calendar nor dividends are published openly.
 * What is built here:
 *   1. futures expirations from ISS FORTS: /iss/engines/futures/markets/forts/securities.json (SECID, SHORTNAME, LASTTRADEDATE,
 *      ASSETCODE) - official, grouped per underlying family and date;
 *   2. non-trading days and shortened sessions from the Russian production calendar (isdayoff.ru, public JSON-less API:
 *      one digit per day), because the exchange follows it. This is a derived schedule, not the exchange's own publication
 *      (the exchange may differ on special days) and the description says so.
 * MOEX times are Moscow time (UTC+3, no DST): MSK -> UTC is -3 h.
 */

export type MoexLang = "ru" | "en" | "cn";

const T = {
  ru: {
    holiday: "Нерабочий день: торги на Мосбирже не проводятся",
    holidayDesc: "Нерабочий (праздничный) день по производственному календарю РФ. Биржа обычно не проводит торги; точное расписание уточняйте на moex.com.",
    short: "Сокращённый торговый день на Мосбирже",
    shortDesc: "Предпраздничный сокращённый день по производственному календарю РФ: торговая сессия может заканчиваться раньше обычного.",
    exp: "Экспирация фьючерса",
    expMany: "Экспирация прочих фьючерсов",
    expDesc: "Последний день торгов по фьючерсным контрактам срочного рынка Московской биржи: ",
  },
  en: {
    holiday: "Non-trading day: Moscow Exchange is closed",
    holidayDesc: "A public holiday in the Russian production calendar. The exchange normally does not trade; check moex.com for the exact schedule.",
    short: "Shortened trading day on Moscow Exchange",
    shortDesc: "A pre-holiday shortened day in the Russian production calendar: the session may end earlier than usual.",
    exp: "Futures expiry",
    expMany: "Other futures expiry",
    expDesc: "Last trading day of these Moscow Exchange derivatives contracts: ",
  },
  cn: {
    holiday: "休市日：莫斯科交易所不交易",
    holidayDesc: "俄罗斯生产日历中的法定节假日，交易所通常不交易；具体安排请以 moex.com 为准。",
    short: "莫斯科交易所缩短交易日",
    shortDesc: "俄罗斯生产日历中的节前缩短工作日，交易时段可能提前结束。",
    exp: "期货到期",
    expMany: "其他期货到期",
    expDesc: "莫斯科交易所衍生品合约最后交易日：",
  },
} as const;

const MSK_MS = 3 * 3_600_000;

/** Underlyings whose expiry moves the market: shown at medium importance (quarterly index / FX / RTS ones at high). */
const MAJOR = new Set(["MIX", "MXI", "RTS", "RTSM", "Si", "Eu", "CNY", "BR", "GOLD", "SBRF", "GAZR"]);
const QUARTERLY_HIGH = new Set(["MIX", "RTS", "Si"]);

/** One digit per day of a year from isdayoff.ru (pre=1): 0 working, 1 holiday, 2 shortened, 4 working Saturday... -> events in [from, to]. */
export function buildMoexHolidays(year: number, digits: string, from: string, to: string, lang: MoexLang = "ru"): CalEvent[] {
  const out: CalEvent[] = [];
  const tr = T[lang];
  const start = Date.UTC(year, 0, 1);
  for (let i = 0; i < digits.length; i++) {
    const ts = start + i * 86_400_000;
    const date = new Date(ts).toISOString().slice(0, 10);
    if (date < from || date > to) continue;
    const wd = new Date(ts).getUTCDay();
    if (wd === 0 || wd === 6) continue; // weekends are not news
    const d = digits[i];
    if (d !== "1" && d !== "2") continue;
    const short = d === "2";
    const title = short ? tr.short : tr.holiday;
    out.push({
      id: eventId(ts, "RU", title),
      ts,
      allDay: true,
      country: "RU",
      currency: "RUB",
      event: title,
      category: "moex",
      impact: short ? 1 : 2,
      actual: null,
      forecast: null,
      previous: null,
      unit: null,
      change: null,
      changePercentage: null,
      description: short ? tr.shortDesc : tr.holidayDesc,
      hasDesc: true,
      origin: "MOEX",
    });
  }
  return out;
}

export type ForstRow = [secid: string, shortname: string, lastTradeDate: string, assetCode: string];

/** FORTS contracts -> expiry events in [from, to]: one per major underlying and date, one grouped event for the rest of a date. */
export function buildMoexExpirations(rows: readonly ForstRow[], from: string, to: string, lang: MoexLang = "ru"): CalEvent[] {
  const tr = T[lang];
  const byDate = new Map<string, ForstRow[]>();
  for (const r of rows) {
    const d = r?.[2];
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < from || d > to) continue;
    const g = byDate.get(d);
    if (g) g.push(r);
    else byDate.set(d, [r]);
  }
  const out: CalEvent[] = [];
  for (const [date, list] of [...byDate.entries()].sort()) {
    const [y, m, dd] = date.split("-").map(Number);
    const ts = Date.UTC(y, m - 1, dd, 18, 50) - MSK_MS; // the evening clearing break: 18:50 MSK
    const fam = new Map<string, ForstRow[]>();
    for (const r of list) {
      const g = fam.get(r[3]);
      if (g) g.push(r);
      else fam.set(r[3], [r]);
    }
    const rest: ForstRow[] = [];
    for (const [code, contracts] of [...fam.entries()].sort()) {
      if (!MAJOR.has(code)) {
        rest.push(...contracts);
        continue;
      }
      const names = contracts.map((c) => c[1]).join(", ");
      const title = `${tr.exp} ${code} (${contracts[0][1]})`;
      out.push({
        id: eventId(ts, "RU", title),
        ts,
        allDay: false,
        country: "RU",
        currency: "RUB",
        event: title,
        category: "moex",
        impact: QUARTERLY_HIGH.has(code) && m % 3 === 0 ? 3 : 2,
        actual: null,
        forecast: null,
        previous: null,
        unit: null,
        change: null,
        changePercentage: null,
        description: tr.expDesc + names,
        hasDesc: true,
        origin: "MOEX",
      });
    }
    if (rest.length) {
      const title = `${tr.expMany} (${rest.length})`;
      out.push({
        id: eventId(ts, "RU", title),
        ts,
        allDay: false,
        country: "RU",
        currency: "RUB",
        event: title,
        category: "moex",
        impact: 1,
        actual: null,
        forecast: null,
        previous: null,
        unit: null,
        change: null,
        changePercentage: null,
        description: tr.expDesc + rest.map((c) => c[1]).join(", "),
        hasDesc: true,
        origin: "MOEX",
      });
    }
  }
  return out.sort((a, b) => a.ts - b.ts || b.impact - a.impact);
}

export const ISS_FORTS_URL =
  "https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE,ASSETCODE&iss.meta=off";
export const DAYOFF_URL = (year: number) => `https://isdayoff.ru/api/getdata?year=${year}&pre=1`;

/** ISS answer -> rows (empty on anything unexpected). */
export function parseForts(body: unknown): ForstRow[] {
  const blk = body && typeof body === "object" ? (body as { securities?: { columns?: string[]; data?: unknown[][] } }).securities : null;
  if (!blk?.columns || !Array.isArray(blk.data)) return [];
  const idx = ["SECID", "SHORTNAME", "LASTTRADEDATE", "ASSETCODE"].map((c) => blk.columns!.indexOf(c));
  if (idx.some((i) => i < 0)) return [];
  const rows: ForstRow[] = [];
  for (const r of blk.data) {
    const v = idx.map((i) => r[i]);
    if (v.every((x) => typeof x === "string" && x)) rows.push(v as ForstRow);
  }
  return rows;
}
