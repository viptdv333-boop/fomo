import type { CalCategory, CalEvent, CalFilter, ImpactLevel } from "./types";

/* Normalisation of FMP economic-calendar rows (stable/economic-calendar). Pure functions: used by the API route, the
   client and the check script. FMP quirks handled here:
   - date "YYYY-MM-DD HH:mm:ss" has no zone and means UTC; a bare "YYYY-MM-DD" has no clock time;
   - impact is a string "High" | "Medium" | "Low" | "None" (sometimes lower case, sometimes empty);
   - numbers may be null, numeric strings or garbage; the same release can be listed twice;
   - the euro area is "EU", currency is sometimes the only hint of the country. */

const CURRENCY_COUNTRY: Record<string, string> = {
  USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", CNY: "CN", CNH: "CN", RUB: "RU", CAD: "CA", AUD: "AU", NZD: "NZ", CHF: "CH",
  INR: "IN", BRL: "BR", MXN: "MX", KRW: "KR", TRY: "TR", ZAR: "ZA", SEK: "SE", NOK: "NO", DKK: "DK", PLN: "PL", HKD: "HK",
  SGD: "SG", IDR: "ID", SAR: "SA", ARS: "AR", CZK: "CZ", HUF: "HU", ILS: "IL", THB: "TH",
};

const COUNTRY_NAME: Record<string, string> = {
  "united states": "US", usa: "US", "united kingdom": "GB", uk: "GB", "euro area": "EU", eurozone: "EU", "european union": "EU",
  japan: "JP", china: "CN", russia: "RU", germany: "DE", france: "FR", italy: "IT", spain: "ES", canada: "CA", australia: "AU",
  switzerland: "CH", india: "IN", brazil: "BR", mexico: "MX", "south korea": "KR", turkey: "TR", "south africa": "ZA",
  "new zealand": "NZ", sweden: "SE", norway: "NO", poland: "PL", "hong kong": "HK", singapore: "SG", indonesia: "ID",
};

/** FNV-1a, two passes with different seeds -> 52 bits as base36. Stable across runs and runtimes. */
function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export function eventId(ts: number, country: string, event: string): string {
  return "e" + hash(`${ts}|${country}|${event.trim().toLowerCase()}`);
}

/** FMP date -> UTC ms (+ whether a clock time was present). null when unparsable. */
export function parseCalDate(v: unknown): { ts: number; allDay: boolean } | null {
  if (typeof v === "number" && Number.isFinite(v)) return { ts: v > 1e12 ? v : v * 1000, allDay: false };
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const ts = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return Number.isFinite(ts) ? { ts, allDay: true } : null;
  }
  // "2024-03-01 03:35:00" / "2024-03-01T03:35:00" / "...Z" / "...+03:00" / with fractions
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (!m) return null;
  let ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  if (m[7] && m[7].toUpperCase() !== "Z") {
    const sign = m[7][0] === "-" ? -1 : 1;
    const digits = m[7].slice(1).replace(":", "");
    ts -= sign * (+digits.slice(0, 2) * 60 + +digits.slice(2, 4)) * 60_000;
  }
  return Number.isFinite(ts) ? { ts, allDay: false } : null;
}

export function parseImpact(v: unknown): ImpactLevel {
  if (typeof v === "number") return v >= 3 ? 3 : v >= 2 ? 2 : 1;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "high" || s === "3") return 3;
  if (s === "medium" || s === "moderate" || s === "2") return 2;
  return 1; // Low, None, empty, unknown
}

export function parseNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.replace(/[%,\s]/g, "");
    if (s === "" || s === "-" ) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseCountry(country: unknown, currency: string): string {
  if (typeof country === "string") {
    const c = country.trim();
    if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
    const byName = COUNTRY_NAME[c.toLowerCase()];
    if (byName) return byName;
  }
  return CURRENCY_COUNTRY[currency] ?? "";
}

/* ───────────── category and unit by event name ───────────── */

const CATEGORY_RULES: [CalCategory, RegExp][] = [
  ["centralbank", /interest rate|rate decision|fomc|\becb\b|\bboe\b|\bboj\b|\bsnb\b|\brba\b|\bboc\b|central bank|monetary policy|policy rate|\bminutes\b|press conference|\bspeaks\b|\bspeech\b|governor|\bpowell\b|lagarde|bailey|ueda|key rate/i],
  ["auction", /auction/i],
  ["inflation", /\bcpi\b|\bppi\b|inflation|price index|deflator|\bpce\b|import prices|export prices|\bhicp\b/i],
  ["growth", /\bgdp\b|gross domestic/i],
  ["employment", /unemployment|payroll|jobless|employment|\bjobs\b|claims|\bwages?\b|labou?r|\badp\b|jolts|average earnings|job (cuts|openings|vacancies)/i],
  ["energy", /crude|\boil\b|natural gas|\beia\b|gasoline|distillate|rig count|stockpile|cushing|\bopec\b/i],
  ["manufacturing", /\bpmi\b|\bism\b|industrial|manufactur|factory|durable goods|capacity utili[sz]ation|\bproduction\b|\bphilly fed\b|empire state|\bifo\b|\bzew\b|tankan|business (confidence|climate|activity)/i],
  ["housing", /housing|\bhome\b|building permits|construction|mortgage|house price|\bnahb\b|existing home|new home/i],
  ["trade", /trade balance|\bexports\b|\bimports\b|current account|balance of|reserves|capital flows|\btic\b/i],
  ["consumer", /retail|consumer|confidence|sentiment|spending|household|personal income/i],
];

export function categoryOf(event: string): CalCategory {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(event)) return cat;
  return "other";
}

const PERCENT_RE = /%|\brate\b|\byoy\b|\bmom\b|\bqoq\b|\bpercent|inflation|yield|auction|\bcpi\b|\bppi\b|\bpce\b|growth|unemployment|\bratio\b|margin|\bgdp\b|utili[sz]ation|participation|savings/i;
const NOT_PERCENT_RE = /claims|payrolls?|jobs added|employment change|unemployment change|balance|\bindex\b|\bpmi\b|\bism\b|confidence|sentiment|reserves|inventories|stocks|rig count|change in|permits|starts|\bsales\b|\borders\b|\bminutes\b|speaks|speech/i;

/** Unit given by the source, else a guess from the name ("%" for rates / changes, else none). */
export function inferUnit(event: string, given: unknown): string | null {
  if (typeof given === "string" && given.trim()) return given.trim().slice(0, 12);
  if (/\b(mom|yoy|qoq)\b|%/i.test(event)) return "%";
  if (NOT_PERCENT_RE.test(event)) return null;
  return PERCENT_RE.test(event) ? "%" : null;
}

/* ───────────── rows -> events ───────────── */

function fill(e: CalEvent): number {
  return (e.actual !== null ? 4 : 0) + (e.forecast !== null ? 1 : 0) + (e.previous !== null ? 1 : 0) + (e.change !== null ? 1 : 0);
}

/** Raw FMP rows -> normalised, de-duplicated events sorted by time. Never throws: bad rows are skipped. */
export function normalizeFmpRows(rows: unknown): CalEvent[] {
  if (!Array.isArray(rows)) return [];
  const byId = new Map<string, CalEvent>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const name = typeof row.event === "string" ? row.event.replace(/\s+/g, " ").trim() : "";
    if (!name) continue;
    const when = parseCalDate(row.date);
    if (!when) continue;
    const currency = typeof row.currency === "string" ? row.currency.trim().toUpperCase().slice(0, 4) : "";
    const country = parseCountry(row.country, currency);
    const ev: CalEvent = {
      id: eventId(when.ts, country, name),
      ts: when.ts,
      allDay: when.allDay,
      country,
      currency,
      event: name.slice(0, 200),
      category: categoryOf(name),
      impact: parseImpact(row.impact),
      actual: parseNum(row.actual),
      forecast: parseNum(row.estimate ?? row.forecast),
      previous: parseNum(row.previous),
      unit: inferUnit(name, row.unit),
      change: parseNum(row.change),
      changePercentage: parseNum(row.changePercentage),
    };
    const prev = byId.get(ev.id);
    if (!prev) byId.set(ev.id, ev);
    else if (fill(ev) > fill(prev) || (fill(ev) === fill(prev) && ev.impact > prev.impact)) byId.set(ev.id, ev);
  }
  return [...byId.values()].sort((a, b) => a.ts - b.ts || b.impact - a.impact || a.event.localeCompare(b.event));
}

export function filterEvents(events: readonly CalEvent[], f: CalFilter): CalEvent[] {
  const q = f.q?.trim().toLowerCase() ?? "";
  const countries = f.countries && f.countries.size > 0 ? f.countries : null;
  const impacts = f.impacts && f.impacts.size > 0 ? f.impacts : null;
  if (!q && !countries && !impacts) return events.slice();
  return events.filter((e) => {
    if (countries && !countries.has(e.country)) return false;
    if (impacts && !impacts.has(e.impact)) return false;
    if (q && !(e.event.toLowerCase().includes(q) || e.country.toLowerCase() === q || e.currency.toLowerCase() === q)) return false;
    return true;
  });
}

/** Merge several lists (cache blocks) removing duplicates by id. */
export function mergeEvents(lists: readonly (readonly CalEvent[])[]): CalEvent[] {
  const m = new Map<string, CalEvent>();
  for (const l of lists) for (const e of l) if (!m.has(e.id)) m.set(e.id, e);
  return [...m.values()].sort((a, b) => a.ts - b.ts || b.impact - a.impact || a.event.localeCompare(b.event));
}
