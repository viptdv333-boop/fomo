import type { CalEvent } from "./types";

/* The category filter of the economic calendar: ONE pure function maps every event to EXACTLY ONE of nine categories a retail
   trader recognises at a glance. It replaces the old layer switches (Moscow Exchange, commodities, Russia, dividends, oil and gas):
   the data of all layers is always loaded, the user narrows it down by category (and country).

   Inputs, in the order of trust: the layer of the event (CalEvent.category: moex / corp / commodity / ru / holiday), the glossary
   key `gk` (set by the API for every language, so the result does not depend on the UI language), the regex category of the
   source name (CalEvent.category: centralbank / inflation / ...) and, for metals only, the English name (`eventEn`, or `event`
   when the list is English) - metals are not a category of the feed, they hide in "Industrial Production" (Gold Production,
   Copper Production, Mining Production). The «gold» market tag is NOT used: dozens of macro releases (CPI, NFP, Fed) carry it. */

export type EventCategory = "cb" | "economy" | "energy" | "metals" | "agro" | "consumer" | "corp" | "moex" | "other";

/** The order of the picker. */
export const EVENT_CATEGORIES: readonly EventCategory[] = ["cb", "economy", "energy", "metals", "agro", "consumer", "corp", "moex", "other"];

const IDS = new Set<string>(EVENT_CATEGORIES);
export const isEventCategory = (v: unknown): v is EventCategory => typeof v === "string" && IDS.has(v);

/** i18n key of a category title (lib/i18n/dict/econcal.ts). */
export const eventCategoryKey = (c: EventCategory): string => `ec.ctg.${c}`;

/* English name of metals: gold / silver / platinum / palladium / copper / aluminium / nickel / zinc / steel / iron ore, mining output
   and the metals bourses. `\bgold\b` does not match "Golden Week", "mining" is South African / Chilean / Australian output. */
const METALS_EN = /\b(gold|silver|platinum|palladium|copper|alumini?um|nickel|zinc|lithium|steel|iron ore|metals?|mining|minerals?|lbma|bullion)\b/i;
const METALS_RU = /золот|серебр|платин|палладий|(?:^|\s)медь|(?:^|\s)меди(?:\s|$)|алюмин|никел|цинк|сталь|стали(?:\s|$)|железн\w* руд|металл|горнодобыв/i;
const CAR_OR_RETAIL = /\b(car|cars|vehicle|vehicles|motorbike|motor vehicle|auto|redbook)\b/i;
const AGRO_MISC = /dairy|crush|\bmilk\b|\bsugar\b|\bwheat\b|\bcorn\b|\bcoffee\b|\bcocoa\b|\bcattle\b|\bhogs?\b|\bpalm\b/i;

/** The category of the glossary key, or null when the key says nothing (then the source category decides). */
function byGlossaryKey(gk: string, name: string): EventCategory | null {
  if (gk.startsWith("oil.") || gk.startsWith("gas.")) return "energy";
  if (gk.startsWith("agro.")) return "agro";
  if (gk.startsWith("corp.")) return "corp";
  // Bank of Russia: the key rate and its documents, money supply and surveys are about rates; the balance of payments and foreign trade are economy
  if (gk === "ru.cbr.bop" || gk === "ru.cbr.trade" || gk === "ru.cbr.reserves") return "economy";
  if (gk.startsWith("ru.cbr.") || gk === "cbr.keyrate") return "cb";
  // Minfin OFZ auctions and every bill / bond auction in the world: the rates and bonds market
  if (gk === "ru.ofz.auction" || gk === "auction" || gk === "treasury") return "cb";
  if (gk.startsWith("ru.rosstat.")) return "economy";
  // central banks: decisions, minutes, speeches, press conferences, balance sheets, facilities, rate surveys and PBoC LPR; money and credit aggregates
  if (/^(cb|fed|fomc|ecb|boe|boj|boc|bcb|rba|snb)\./.test(gk) || gk === "cn.lpr" || gk === "money" || gk === "credit") return "cb";
  if (gk === "misc.lmi") return CAR_OR_RETAIL.test(name) ? "consumer" : AGRO_MISC.test(name) ? "agro" : "economy";
  // the consumer: retail, sentiment, personal income / spending, households, tourism, housing
  if (gk.startsWith("retail") || gk.startsWith("conf.") || gk.startsWith("hous.") || gk === "household" || gk === "income" || gk === "tourism" || gk === "constr" || gk === "jp.ecowatch") return "consumer";
  // wages and costs of labour belong to employment, i.e. the economy
  if (gk.startsWith("wages.") || gk === "eci" || gk === "labcost") return "economy";
  // everything the regex marked "centralbank" / "consumer" by an accident of the name (Fixed Asset Investment, Trimmed Mean CPI) is macro
  if ((gk.startsWith("cpi.") && gk !== "cpi.misc") || gk.startsWith("ppi") || gk.startsWith("gdp") || gk.startsWith("pce") || gk.startsWith("pmi.") || gk === "ip" || gk === "fdi.fai" || gk === "biz.conf") return "economy";
  if (gk.startsWith("unemp.") || gk.startsWith("emp.") || gk.startsWith("claims") || gk.startsWith("nfp") || gk.startsWith("adp") || gk === "jolts") return "economy";
  if (gk.startsWith("trade.") || gk === "fx.res" || gk === "tic" || gk === "budget" || gk === "debt" || gk === "act.idx" || gk === "profit") return "economy";
  if (gk === "holiday" || gk.startsWith("pol.")) return "other";
  return null;
}

/** The category of an event by its source category (the regex of lib/calendar/normalize.ts) when nothing more specific is known. */
function bySource(c: CalEvent["category"]): EventCategory {
  switch (c) {
    case "centralbank":
    case "auction":
      return "cb";
    case "inflation":
    case "employment":
    case "growth":
    case "manufacturing":
    case "trade":
    case "ru":
      return "economy";
    case "consumer":
    case "housing":
      return "consumer";
    case "energy":
      return "energy";
    case "commodity":
      return "agro";
    case "corp":
      return "corp";
    case "moex":
      return "moex";
    default:
      return "other";
  }
}

/**
 * The single category of an event. The layers decide first (a Moscow Exchange row is «Биржа», a dividend is «Компании»,
 * a USDA report is «Агро и сырьё»), holidays are «Прочее», then oil and gas, metals (by name), the glossary key and the source category.
 */
export function eventCategory(ev: Pick<CalEvent, "category" | "gk" | "tags" | "event" | "eventEn">): EventCategory {
  const layer = ev.category;
  if (layer === "moex") return "moex";
  if (layer === "corp") return "corp";
  if (layer === "commodity") return "agro";
  if (layer === "holiday") return "other";
  const gk = ev.gk ?? "";
  if (layer === "energy" || gk.startsWith("oil.") || gk.startsWith("gas.")) return "energy";
  if (gk === "holiday") return "other";
  const name = ev.eventEn ?? ev.event;
  if (METALS_EN.test(name) || (!ev.eventEn && METALS_RU.test(ev.event))) return "metals";
  const k = gk ? byGlossaryKey(gk, name) : null;
  if (k) return k;
  // not localised (no glossary key): a plain «oil / gas» tag on an uncategorised release still means energy
  if (layer === "other" && ev.tags && (ev.tags.includes("oil") || ev.tags.includes("gas"))) return "energy";
  return bySource(layer);
}

/** Events per category (every category present, zeros included). */
export function categoryCounts(events: readonly Pick<CalEvent, "category" | "gk" | "tags" | "event" | "eventEn">[]): Record<EventCategory, number> {
  const out = Object.fromEntries(EVENT_CATEGORIES.map((c) => [c, 0])) as Record<EventCategory, number>;
  for (const e of events) out[eventCategory(e)]++;
  return out;
}
