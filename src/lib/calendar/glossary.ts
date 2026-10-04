import { GENERIC_BRIEFS, HOLIDAY_BRIEF, SPEECH_BRIEF, briefForCountry, briefFromTags } from "./glossary-briefs";
import { COUNTRY_ORG, RULES, type Tag } from "./glossary-rules";
import type { CalCategory, CalEvent } from "./types";

/*
 * Glossary of the economic calendar: Russian titles, a plain-language «что это» / «на что влияет» for every well-known
 * TradingView event, and market tags. Pure (no React, no I/O): used by the API route (titles, tags, key, impact) and by the
 * event popup on the client (about / affects looked up by key, so the texts never travel in the list payload).
 *
 * localizeEvent(ev, lang):
 *   1. holidays / speeches have their own handlers;
 *   2. the trailing MoM / YoY / QoQ / Final / Prel / Flash / Adv / s.a tokens are split off the name, the rest is matched against
 *      the hand-written RULES (glossary-rules.ts); the tokens are rendered in Russian after the title («, г/г, финальная оценка»);
 *   3. unknown names fall back to a word-by-word translation and a generic text for the category (result.fallback = true).
 * lang "en" / "cn" keep the original title (only key / tags / impact are filled), the texts are Russian only.
 */

export type GlossaryLang = "ru" | "en" | "cn";
export type { Tag };

export const TAGS: Record<Exclude<Tag, "ccy">, { ru: string; en: string; cn: string }> = {
  usd: { ru: "Доллар США", en: "US dollar", cn: "美元" },
  eur: { ru: "Евро", en: "Euro", cn: "欧元" },
  gbp: { ru: "Фунт", en: "Pound", cn: "英镑" },
  jpy: { ru: "Иена", en: "Yen", cn: "日元" },
  cny: { ru: "Юань", en: "Yuan", cn: "人民币" },
  rub: { ru: "Рубль", en: "Ruble", cn: "卢布" },
  cad: { ru: "Канадский доллар", en: "CAD", cn: "加元" },
  aud: { ru: "Австралийский доллар", en: "AUD", cn: "澳元" },
  nzd: { ru: "Новозеландский доллар", en: "NZD", cn: "纽元" },
  chf: { ru: "Франк", en: "Franc", cn: "瑞郎" },
  stocks: { ru: "Акции", en: "Stocks", cn: "股票" },
  bonds: { ru: "Облигации", en: "Bonds", cn: "债券" },
  gold: { ru: "Золото", en: "Gold", cn: "黄金" },
  oil: { ru: "Нефть", en: "Oil", cn: "原油" },
  gas: { ru: "Газ", en: "Gas", cn: "天然气" },
  crypto: { ru: "Крипто", en: "Crypto", cn: "加密货币" },
  agro: { ru: "Агросырьё", en: "Agro", cn: "农产品" },
  cocoa: { ru: "Какао", en: "Cocoa", cn: "可可" },
  coffee: { ru: "Кофе", en: "Coffee", cn: "咖啡" },
  sugar: { ru: "Сахар", en: "Sugar", cn: "糖" },
  wheat: { ru: "Пшеница", en: "Wheat", cn: "小麦" },
  corn: { ru: "Кукуруза", en: "Corn", cn: "玉米" },
  soy: { ru: "Соя", en: "Soybeans", cn: "大豆" },
  palm: { ru: "Пальмовое масло", en: "Palm oil", cn: "棕榈油" },
  cotton: { ru: "Хлопок", en: "Cotton", cn: "棉花" },
  cattle: { ru: "Скот", en: "Cattle", cn: "牲畜" },
  div: { ru: "Дивиденды", en: "Dividends", cn: "股息" },
  coupon: { ru: "Купоны", en: "Coupons", cn: "票息" },
  earnings: { ru: "Отчётность", en: "Earnings", cn: "财报" },
  ofz: { ru: "ОФЗ", en: "OFZ (RU gov bonds)", cn: "俄联邦债券" },
};

export function tagLabel(tag: string, lang: GlossaryLang | string): string {
  const t = (TAGS as Record<string, { ru: string; en: string; cn: string }>)[tag];
  if (!t) return tag;
  return t[lang === "en" || lang === "cn" ? lang : "ru"];
}

const COUNTRY_CCY: Record<string, Tag> = {
  US: "usd", GB: "gbp", JP: "jpy", CN: "cny", RU: "rub", CA: "cad", AU: "aud", NZ: "nzd", CH: "chf",
  EU: "eur", DE: "eur", FR: "eur", IT: "eur", ES: "eur", NL: "eur", AT: "eur", BE: "eur", IE: "eur", FI: "eur", PT: "eur", GR: "eur",
  LU: "eur", SK: "eur", SI: "eur", EE: "eur", LV: "eur", LT: "eur", HR: "eur", CY: "eur", MT: "eur",
};

/** Tags of the oil-and-gas quick filter. */
export const ENERGY_TAGS: readonly string[] = ["oil", "gas"];

export interface LocalizedEvent {
  title: string;
  about?: string;
  affects?: string;
  /** one-line impact summary for the event row (Russian only) */
  brief?: string;
  tags?: string[];
  /** glossary key: rule id, "cb.speech", "holiday" or "~<category>" for the generic fallbacks */
  key?: string;
  impact: number;
  /** TradingView's name misleads the generic category rules: the glossary knows better */
  category?: string;
  /** true when no hand-written rule matched (word-by-word title + generic text) */
  fallback?: boolean;
}

/* ───────────────────────── name parsing ───────────────────────── */

type ModId = "mom" | "yoy" | "qoq" | "final" | "prel" | "flash" | "adv" | "est2" | "est3" | "sa" | "nsa";
const MOD_RES: [RegExp, ModId][] = [
  [/\s+MoM$/i, "mom"], [/\s+YoY$/i, "yoy"], [/\s+QoQ$/i, "qoq"], [/\s+Final$/i, "final"], [/\s+Prel$/i, "prel"], [/\s+Flash$/i, "flash"],
  [/\s+Adv$/i, "adv"], [/\s+2nd Est$/i, "est2"], [/\s+3rd Est$/i, "est3"], [/\s+s\.a\.?$/i, "sa"], [/\s+n\.s\.a\.?$/i, "nsa"],
];
const MOD_RU: Record<ModId, string> = {
  mom: "м/м", yoy: "г/г", qoq: "кв/кв", final: "финальная оценка", prel: "предварительная оценка", flash: "экспресс-оценка", adv: "первая оценка",
  est2: "вторая оценка", est3: "третья оценка", sa: "с сезонной корректировкой", nsa: "без сезонной корректировки",
};
const MOD_ORDER: ModId[] = ["mom", "yoy", "qoq", "adv", "flash", "prel", "est2", "est3", "final", "sa", "nsa"];
const PERIODIC: ModId[] = ["mom", "yoy", "qoq"];

function norm(name: string): string {
  return name.replace(/\s+/g, " ").replace(/[‘’]/g, "'").trim();
}

export function splitMods(name: string): { base: string; mods: ModId[] } {
  let base = norm(name);
  const mods: ModId[] = [];
  for (let i = 0; i < 5; i++) {
    let hit = false;
    for (const [re, id] of MOD_RES) {
      if (re.test(base) && base.replace(re, "").length > 1) {
        base = base.replace(re, "");
        mods.push(id);
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  return { base, mods };
}

function modsRu(mods: ModId[]): string {
  const set = new Set(mods);
  const parts = MOD_ORDER.filter((m) => set.has(m)).map((m) => MOD_RU[m]);
  return parts.length ? `, ${parts.join(", ")}` : "";
}

/* ───────────────────────── periods ("Sep", "Q3", "Oct/03") ───────────────────────── */

const MONTH_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTH_KEYS: Record<string, number> = {
  jan: 0, feb: 1, fev: 1, mar: 2, apr: 3, abr: 3, may: 4, mai: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, sept: 8, set: 8, oct: 9, out: 9, nov: 10, dec: 11, dez: 11,
};

export function localizePeriod(period: string | undefined, lang: GlossaryLang | string = "ru"): string | undefined {
  if (!period || lang !== "ru") return period;
  let out = period.trim();
  out = out.replace(/\b([A-Za-z]{3,4})\/(\d{1,2})\b/g, (all, mon: string, day: string) => {
    const i = MONTH_KEYS[mon.toLowerCase()];
    return i === undefined ? all : `${+day} ${MONTH_RU[i]}`;
  });
  out = out.replace(/\b([A-Za-z]{3,4})\b/g, (all, mon: string) => {
    const i = MONTH_KEYS[mon.toLowerCase()];
    return i === undefined ? all : MONTH_RU[i];
  });
  out = out.replace(/\bQ([1-4])\b/g, "$1 кв.").replace(/\bH([12])\b/g, "$1 пол.");
  return out;
}

/* ───────────────────────── speeches ───────────────────────── */

const SPEECH_RE = /^(?:(Fed|FOMC|ECB|BoE|BoJ|BOJ|RBA|RBNZ|BoC|SNB|Riksbank|Norges Bank|Bundesbank|PBoC|RBI|CBR|BCB|Banxico|TCMB|CNB|SARB|BoK|MAS|NBP|MNB)\s+)?((?:(?:Vice|Deputy|Senior|Executive|Chief)\s+)*(?:Chair(?:man|woman)?|Gov(?:ernor)?|President|Chancellor|Prime Minister|Treasury Secretary|Finance Minister|Minister|Secretary)\s+)?(.+?)\s+(Speech|Speaks|Testifies|Testimony|Remarks)$/i;

const ORG_NOM: Record<string, string> = {
  fed: "ФРС", fomc: "ФРС", ecb: "ЕЦБ", boe: "Банк Англии", boj: "Банк Японии", boc: "Банк Канады", rba: "РБА", rbnz: "РБНЗ", snb: "ШНБ", riksbank: "Риксбанк",
  "norges bank": "Банк Норвегии", bundesbank: "Бундесбанк", pboc: "НБК", rbi: "РБИ", cbr: "Банк России", bcb: "ЦБ Бразилии", banxico: "Банк Мексики", tcmb: "ЦБ Турции",
  cnb: "ЦБ Чехии", sarb: "ЦБ ЮАР", bok: "Банк Кореи", mas: "MAS", nbp: "ЦБ Польши", mnb: "ЦБ Венгрии",
};

/** surname (lower case) -> genitive in Russian («выступление Пауэлла»); women's surnames that do not decline stay as they are */
const NAMES: Record<string, string> = {
  powell: "Пауэлла", jefferson: "Джефферсона", williams: "Уильямса", logan: "Логана", waller: "Уоллера", bowman: "Боумен", barr: "Барра", cook: "Кук", musalem: "Мусалема",
  goolsbee: "Гулсби", kashkari: "Кашкари", bostic: "Бостика", collins: "Коллинз", barkin: "Баркина", daly: "Дейли", harker: "Харкера", mester: "Местер", hammack: "Хаммак",
  paulson: "Полсон", schmid: "Шмида", miran: "Мирана", bullard: "Буллард", evans: "Эванса", rosengren: "Розенгрена", george: "Джордж", kaplan: "Каплана", brainard: "Брейнард",
  clarida: "Клариды", quarles: "Куорлса", lagarde: "Лагард", lane: "Лейна", schnabel: "Шнабель", nagel: "Нагеля", buch: "Бух", cipollone: "Чиполлоне", donnery: "Доннери",
  elderson: "Эльдерсона", machado: "Мачадо", montagner: "Монтаньер", "vujčić": "Вуйчича", vujcic: "Вуйчича", "de guindos": "де Гиндоса", guindos: "де Гиндоса", villeroy: "Вильруа",
  knot: "Кнота", rehn: "Рена", kazimir: "Казимира", kazaks: "Казакса", stournaras: "Стурнараса", panetta: "Панетты", "escrivá": "Эскрива", escriva: "Эскрива", wunsch: "Вунша",
  makhlouf: "Махлуфа", muller: "Мюллера", "müller": "Мюллера", holzmann: "Хольцмана", centeno: "Сентено", hernandez: "Эрнандеса", lipponen: "Липпонена",
  bailey: "Бейли", breeden: "Бридена", lombardelli: "Ломбарделли", pill: "Пилла", mann: "Манна", greene: "Грин", dhingra: "Дхингры", haskel: "Хаскела", taylor: "Тейлора",
  bean: "Бина", ramsden: "Рэмсдена", mills: "Миллса", wilkins: "Уилкинса", broadbent: "Бродбента", cunliffe: "Канлиффа", saunders: "Сондерса", tenreyro: "Тенрейро",
  ueda: "Уэды", himino: "Хиино", uchida: "Утиды", noguchi: "Ногути", nakagawa: "Накагавы", takata: "Таката", tamura: "Тамуры", koeda: "Коэды", masu: "Масу", nakamura: "Накамуры",
  adachi: "Адачи", kuroda: "Куроды", macklem: "Макклема", bullock: "Баллок", hauser: "Хаузера", hunter: "Хантера", kohler: "Колера", jones: "Джонса", orr: "Орра", silk: "Силка",
  jordan: "Йордана", schlegel: "Шлегеля", thedeen: "Тедена", ingves: "Ингвеса", breman: "Бремана", wolden: "Вольдена", nabiullina: "Набиуллиной", das: "Даса", malhotra: "Малхотры",
  healey: "Хили", reeves: "Рив", bessent: "Бессента", yellen: "Йеллен", trump: "Трампа", biden: "Байдена", xi: "Си Цзиньпина", putin: "Путина", scholz: "Шольца", merz: "Мерца",
  macron: "Макрона", sunak: "Сунака", starmer: "Стармера", lammy: "Лэмми", carney: "Карни", albanese: "Альбанезе", takaichi: "Такаити", ishiba: "Исиба", kishida: "Кисиды",
};

/** heads of central banks: «выступление главы ФРС Пауэлла» */
const HEADS: Record<string, string> = {
  powell: "главы ФРС", lagarde: "главы ЕЦБ", bailey: "управляющего Банка Англии", ueda: "главы Банка Японии", macklem: "управляющего Банка Канады", bullock: "управляющей РБА",
  orr: "управляющего РБНЗ", jordan: "председателя ШНБ", schlegel: "председателя ШНБ", thedeen: "управляющего Риксбанка", nabiullina: "главы Банка России", nagel: "главы Бундесбанка",
};

const POLITICAL_ROLE: [RegExp, string][] = [
  [/chancellor/i, "канцлера"], [/prime minister/i, "премьер-министра"], [/treasury secretary/i, "министра финансов США"], [/finance minister/i, "министра финансов"], [/president/i, "президента"], [/minister/i, "министра"], [/secretary/i, "министра"],
];

const SPEECH_ABOUT = "Публичное выступление представителя центробанка или правительства. Рынок ищет намёки на будущие решения по ставке и оценку инфляции и экономики.";
const SPEECH_AFFECTS = "Тон жёстче ожиданий (ставка дольше останется высокой) — валюта страны крепнет, акции и золото слабеют; мягче — наоборот. Чем выше пост выступающего, тем сильнее реакция; рядовые выступления часто почти не двигают рынок.";

function speechTitle(name: string, country: string): { title: string; head: boolean } | null {
  const m = SPEECH_RE.exec(name);
  if (!m) return null;
  const orgKey = (m[1] || "").toLowerCase();
  const role = (m[2] || "").trim();
  const person = m[3].trim();
  const kind = m[4].toLowerCase();
  const surname = person.replace(/\s+(Jr\.?|Sr\.?|III|II)$/i, "").split(" ").pop() || person;
  const sk = surname.toLowerCase();
  const gen = NAMES[sk] ?? (person.split(" ").length > 1 && !NAMES[sk] ? person : surname);
  const orgCode = orgKey || (/^(governor|gov|chair|vice chair)/i.test(role) || !role ? COUNTRY_ORG[country] || "" : "");
  const org = ORG_NOM[orgCode];
  const head = HEADS[sk];
  const political = !orgKey ? POLITICAL_ROLE.find(([re]) => re.test(role)) : undefined;
  const noun = kind === "testifies" || kind === "testimony" ? "Показания в Конгрессе" : "Выступление";
  if (head && (orgCode || /gov|chair|president/i.test(role)) && !political) return { title: `${noun} ${head} ${gen}`, head: true };
  if (political && !orgKey) return { title: `${noun} ${political[1]} ${gen}`, head: false };
  return { title: `${noun} ${gen}${org ? ` (${org})` : ""}`, head: false };
}

/* ───────────────────────── holidays ───────────────────────── */

const HOLIDAYS: Record<string, string> = {
  "labor day": "День труда", "labour day": "День труда", "independence day": "День независимости", "national day": "Национальный день", thanksgiving: "День благодарения",
  "thanksgiving day": "День благодарения", "columbus day": "День Колумба", "german unity day": "День германского единства", "armed forces day": "День вооружённых сил",
  "armed force day": "День вооружённых сил", "army day": "День армии", "all saints' day": "День всех святых", "all souls' day": "День всех усопших", "all soul's day": "День всех усопших",
  "mid-autumn festival": "Праздник середины осени", "day following the mid-autumn festival": "День после праздника середины осени", "autumnal equinox day": "День осеннего равноденствия",
  "health and sports day": "День здоровья и спорта", "respect for the aged day": "День почитания старших", "culture day": "День культуры",
  "national day of the people's republic of china": "Национальный день КНР", "national day golden week": "Национальный день КНР (Золотая неделя)", "national day/double tenth day": "Национальный день (День двойной десятки)",
  "constitution day": "День Конституции", "victory day": "День Победы", "republic day": "День Республики", "reformation day": "День Реформации", "mother's day": "День матери",
  "heritage day": "День наследия", "rosh hashanah": "Рош ха-Шана", "eve of rosh hashanah": "Канун Рош ха-Шана", "yom kippur": "Йом-Кипур", "sukkot i": "Суккот", "shmini atzeret/simchat torah": "Шмини Ацерет / Симхат Тора",
  "hispanic day": "День испанской культуры", "dia de la raza": "День расы (Испаноамерика)", "day of indigenous resistance": "День сопротивления коренных народов", "ochi day": "День «Охи» (Греция)",
  "liberation day": "День освобождения", "revolution day": "День революции", "malaysia day": "День Малайзии", "botswana day": "День Ботсваны", "cyprus independence day": "День независимости Кипра",
  "mahatma gandhi's birthday": "День рождения Махатмы Ганди", "dashain holiday": "Дашайн (Непал)", "ganesh chathurthi": "Ганеша-чатуртхи", "shree krishna janmastami": "Кришна-джанмаштами",
  "meskel": "Маскал (Эфиопия)", "ethiopian new year": "Эфиопский Новый год", "october bank holiday": "Октябрьский банковский выходной", "martyr's day": "День мучеников", "saudi national day": "Национальный день Саудовской Аравии",
  "chung yeung festival": "Праздник Чунъян (Гонконг)", "hangeul proclamation day": "День провозглашения хангыля", "earthquake remembrance day": "День памяти о землетрясении",
  "national heroes' day": "День национальных героев", "founders' day": "День основателей", "armistice day": "День перемирия", "remembrance day": "День памяти", "veterans day": "День ветеранов", "halloween": "Хэллоуин",
  "christmas day": "Рождество", "boxing day": "День подарков", "new year's day": "Новый год", "good friday": "Страстная пятница", "easter monday": "Пасхальный понедельник", "ascension day": "Вознесение",
  "whit monday": "Духов день", "corpus christi": "Тело Христово", "assumption day": "Успение Богородицы", "epiphany": "Богоявление", "unification day": "День объединения", "evacuation day": "День эвакуации",
  "day of the virgin mary of the seven sorrows": "День Богоматери Семи скорбей (Словакия)", "independent czechoslovak state day": "День образования Чехословакии", "st. wenceslas day": "День святого Вацлава (Чехия)",
  "national day for truth and reconciliation": "Национальный день правды и примирения (Канада)", "day of the first president of the republic of kazakhstan": "День Первого Президента Казахстана", "chulalongkorn day": "День Чулалонгкорна (Таиланд)",
  "mashujaa day": "День героев (Кения)", "heroes' day": "День героев", "teachers' day": "День учителя", "children's day": "День защиты детей", "midsummer": "Иванов день",
};
const HOLIDAY_ABOUT = "Праздничный или нерабочий день в стране: банки и биржи могут быть закрыты или работать по сокращённому графику.";
const HOLIDAY_AFFECTS = "Торги на местных площадках встают или идут при низкой ликвидности, выход статистики откладывается. Для вашей позиции важны только инструменты этой страны.";

/* ───────────────────────── fallback: word-by-word translation ───────────────────────── */

const PHRASES: [RegExp, string][] = [
  [/\(YTD\)/gi, "(с начала года)"], [/\bConsumer Confidence\b/gi, "потребительское доверие"], [/\bBusiness Confidence\b/gi, "деловое доверие"], [/\bHome Sales\b/gi, "продажи жилья"],
  [/\bHouse Prices?\b/gi, "цены на жильё"], [/\bHousing Prices?\b/gi, "цены на жильё"], [/\bMoney Supply\b/gi, "денежная масса"], [/\bTrade Balance\b/gi, "торговый баланс"],
  [/\bBalance of Trade\b/gi, "торговый баланс"], [/\bCurrent Account\b/gi, "текущий счёт"], [/\bCapacity Utili[sz]ation\b/gi, "загрузка мощностей"], [/\bRetail Sales\b/gi, "розничные продажи"],
  [/\bIndustrial Production\b/gi, "промышленное производство"], [/\bUnemployment Rate\b/gi, "уровень безработицы"], [/\bInterest Rate\b/gi, "процентная ставка"], [/\bInflation Rate\b/gi, "инфляция"],
  [/\bPrice Index\b/gi, "индекс цен"], [/\bJob Openings\b/gi, "открытые вакансии"], [/\bJob Cuts\b/gi, "сокращения персонала"], [/\bPurchasing Managers'? Index\b/gi, "индекс PMI"],
  [/\bExports\b/gi, "экспорт"], [/\bImports\b/gi, "импорт"], [/\bInventories\b/gi, "запасы"], [/\bStocks\b/gi, "запасы"], [/\bSales\b/gi, "продажи"], [/\bOrders\b/gi, "заказы"],
  [/\bProduction\b/gi, "производство"], [/\bOutput\b/gi, "выпуск"], [/\bSurvey\b/gi, "опрос"], [/\bSentiment\b/gi, "настроения"], [/\bConfidence\b/gi, "доверие"], [/\bBalance\b/gi, "баланс"],
  [/\bBudget\b/gi, "бюджет"], [/\bPrices\b/gi, "цены"], [/\bPrice\b/gi, "цена"], [/\bGrowth\b/gi, "рост"], [/\bSpending\b/gi, "расходы"], [/\bIncome\b/gi, "доходы"], [/\bInvestment\b/gi, "инвестиции"],
  [/\bLoans\b/gi, "кредиты"], [/\bCredit\b/gi, "кредит"], [/\bEmployment\b/gi, "занятость"], [/\bUnemployment\b/gi, "безработица"], [/\bJobs\b/gi, "рабочие места"], [/\bWages\b/gi, "зарплаты"],
  [/\bEarnings\b/gi, "заработки"], [/\bManufacturing\b/gi, "промышленность"], [/\bServices\b/gi, "услуги"], [/\bConstruction\b/gi, "строительство"], [/\bHousing\b/gi, "жильё"], [/\bInflation\b/gi, "инфляция"],
  [/\bIndex\b/gi, "индекс"], [/\bChange\b/gi, "изменение"], [/\bChg\b/gi, "изменение"], [/\bRate\b/gi, "ставка"], [/\bTotal\b/gi, "всего"], [/\bAverage\b/gi, "среднее"], [/\bWeekly\b/gi, "недельные"],
  [/\bMonthly\b/gi, "месячные"], [/\bQuarterly\b/gi, "квартальные"], [/\bAnnual\b/gi, "годовые"], [/\bGovernment\b/gi, "государственные"], [/\bPrivate\b/gi, "частные"], [/\bForeign\b/gi, "иностранные"],
  [/\bDomestic\b/gi, "внутренние"], [/\bRetail\b/gi, "розничные"], [/\bWholesale\b/gi, "оптовые"], [/\bIndustrial\b/gi, "промышленные"], [/\bConsumer\b/gi, "потребительские"], [/\bBusiness\b/gi, "деловые"],
  [/\bEconomic\b/gi, "экономические"], [/\bCentral Bank\b/gi, "центробанк"], [/\bReserves\b/gi, "резервы"], [/\bDebt\b/gi, "долг"], [/\bTax\b/gi, "налоги"], [/\bRevenues?\b/gi, "доходы"],
  [/\bDeficit\b/gi, "дефицит"], [/\bSurplus\b/gi, "профицит"], [/\bLeading\b/gi, "опережающий"], [/\bActivity\b/gi, "активность"], [/\bExpectations\b/gi, "ожидания"], [/\bCurrent\b/gi, "текущие"],
  [/\bConditions\b/gi, "условия"], [/\bOutlook\b/gi, "прогноз"], [/\bForecasts?\b/gi, "прогноз"], [/\bReport\b/gi, "отчёт"], [/\bMeeting\b/gi, "заседание"], [/\bSpeech\b/gi, "выступление"],
  [/\bDecision\b/gi, "решение"], [/\bMinutes\b/gi, "протокол"], [/\bStatement\b/gi, "заявление"], [/\bAuction\b/gi, "аукцион"], [/\bBonds?\b/gi, "облигации"], [/\bYield\b/gi, "доходность"],
  [/\bHoliday\b/gi, "выходной"], [/\bElections?\b/gi, "выборы"], [/\bOil\b/gi, "нефть"], [/\bGas\b/gi, "газ"], [/\bCrude\b/gi, "сырая нефть"], [/\bEnergy\b/gi, "энергоносители"], [/\bFood\b/gi, "продукты"],
  [/\bCore\b/gi, "базовый"], [/\bNew\b/gi, "новые"], [/\bExisting\b/gi, "вторичные"], [/\bOverall\b/gi, "общий"], [/\bAnd\b/gi, "и"], [/\bof\b/gi, "—"], [/\bYTD\b/gi, "с начала года"],
];

function translateFallback(base: string): string {
  let s = base;
  for (const [re, ru] of PHRASES) s = s.replace(re, ru);
  s = s.replace(/\s*—\s*/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : base;
}

interface Generic { about: string; affects: string; tags: Tag[] }

/** brief of a generic fallback category: hand-written, else derived from the category's tags */
function genericBrief(cat: string): string {
  const g = GENERIC[cat];
  return GENERIC_BRIEFS[cat] || briefFromTags(g ? g.tags.map((t) => (t === "ccy" ? "usd" : t)) : []);
}
const GENERIC: Record<string, Generic> = {
  centralbank: { about: "Событие центробанка: решение, протокол, отчёт или выступление, из которого рынок делает выводы о будущей ставке.", affects: "Более жёсткий тон, чем ждали, — валюта страны крепнет, акции и золото слабеют; более мягкий — наоборот.", tags: ["ccy", "bonds", "stocks"] },
  inflation: { about: "Показатель роста цен. Центробанки меняют ставки в зависимости от инфляции, поэтому такие данные важны для рынка.", affects: "Выше прогноза — ожидания более жёсткой политики: валюта крепнет, облигации и акции слабеют. Ниже прогноза — наоборот.", tags: ["ccy", "bonds", "stocks"] },
  employment: { about: "Показатель рынка труда: занятость, безработица или зарплаты. Сильный рынок труда поддерживает потребление и инфляцию.", affects: "Сильнее прогноза — валюта страны растёт, ставки дольше остаются высокими; слабее — шансы на смягчение политики растут.", tags: ["ccy", "bonds", "stocks"] },
  growth: { about: "Показатель роста экономики страны: объём производства и доходов.", affects: "Выше прогноза — укрепление валюты и поддержка акций; ниже — опасения рецессии и давление на рынок.", tags: ["ccy", "stocks"] },
  manufacturing: { about: "Показатель состояния промышленности или деловых настроений: заказы, выпуск или опрос компаний.", affects: "Выше прогноза — подъём деловой активности: поддержка валюты, акций и спроса на сырьё. Ниже — давление.", tags: ["ccy", "stocks"] },
  consumer: { about: "Показатель потребительского спроса: расходы, доверие или кредиты домохозяйств. Потребление — основа большинства экономик.", affects: "Выше прогноза — потребитель сильный, валюта и акции растут; ниже — давление.", tags: ["ccy", "stocks"] },
  housing: { about: "Показатель рынка жилья: строительство, продажи, цены или ипотека. Рынок жилья чувствителен к ставкам.", affects: "Выше прогноза — признак подъёма: поддержка валюты и акций строителей; ниже — давление.", tags: ["ccy", "stocks"] },
  trade: { about: "Показатель внешней торговли и потоков капитала: экспорт, импорт, баланс, резервы или государственные финансы.", affects: "Профицит или приток капитала выше прогноза поддерживает национальную валюту; дефицит или отток — давит.", tags: ["ccy"] },
  energy: { about: "Показатель рынка нефти, газа или нефтепродуктов.", affects: "Влияет на цены энергоносителей, рубль, валюты-экспортёры сырья (CAD, NOK) и акции нефтегазового сектора.", tags: ["oil", "gas", "rub", "stocks"] },
  auction: { about: "Размещение государственных долговых бумаг: узнаём, по какой доходности рынок готов их купить.", affects: "Слабый спрос и рост доходности давят на облигации и могут тянуть вверх ставки; сильный спрос — поддерживает их.", tags: ["ccy", "bonds"] },
  holiday: { about: HOLIDAY_ABOUT, affects: HOLIDAY_AFFECTS, tags: [] },
  other: { about: "Запланированное событие или публикация данных. Подробности — в оригинальном описании ниже, если оно есть.", affects: "Влияние зависит от результата и от того, насколько он отличается от ожиданий рынка.", tags: ["ccy"] },
};

/* ───────────────────────── main entry ───────────────────────── */

interface Resolved {
  title: string;
  key: string;
  about: string;
  affects: string;
  brief: string;
  tags: string[];
  minImpact: number;
  category?: string;
  fallback: boolean;
  periodic: boolean;
}

const cache = new Map<string, Resolved>();
const CACHE_MAX = 6000;

function resolveTags(tags: Tag[], country: string): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const v = t === "ccy" ? COUNTRY_CCY[country] : t;
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 6);
}

function resolve(nameRaw: string, categoryIn: string, country: string): Resolved {
  const name = norm(nameRaw);
  if (categoryIn === "holiday") {
    const ru = HOLIDAYS[name.toLowerCase().replace(/\s+$/, "")];
    return { title: ru ?? name, key: "holiday", about: HOLIDAY_ABOUT, affects: HOLIDAY_AFFECTS, brief: HOLIDAY_BRIEF, tags: [], minImpact: 0, fallback: !ru, periodic: false };
  }
  const sp = speechTitle(name, country);
  if (sp) return { title: sp.title, key: "cb.speech", about: SPEECH_ABOUT, affects: SPEECH_AFFECTS, brief: briefForCountry("cb.speech", SPEECH_BRIEF, country), tags: resolveTags(["ccy", "bonds", "stocks"], country), minImpact: 0, fallback: false, periodic: false };
  const { base, mods } = splitMods(name);
  const periodic = mods.some((m) => PERIODIC.includes(m));
  for (const r of RULES) {
    const m = r.re.exec(base);
    if (!m) continue;
    const t = typeof r.title === "function" ? r.title(m, country) : r.title;
    return {
      title: r.noMods ? t : t + modsRu(mods),
      key: r.key,
      about: r.about,
      affects: r.affects,
      brief: briefForCountry(r.key, r.brief, country),
      tags: resolveTags(r.tags, country),
      minImpact: r.minImpact ?? 0,
      category: r.category,
      fallback: false,
      periodic,
    };
  }
  const cat = GENERIC[categoryIn] ? categoryIn : "other";
  const g = GENERIC[cat];
  return { title: translateFallback(base) + modsRu(mods), key: `~${cat}`, about: g.about, affects: g.affects, brief: briefForCountry(`~${cat}`, genericBrief(cat), country), tags: resolveTags(g.tags, country), minImpact: 0, fallback: true, periodic };
}

export function localizeEvent(ev: { event: string; category?: string; country?: string; impact: number }, lang: GlossaryLang = "ru"): LocalizedEvent {
  const name = typeof ev.event === "string" ? ev.event : "";
  if (!name.trim() || ev.category === "moex" || ev.category === "commodity" || ev.category === "ru" || ev.category === "corp") return { title: name, impact: ev.impact };
  const country = ev.country ?? "";
  const ck = `${country}|${ev.category ?? ""}|${name}`;
  let r = cache.get(ck);
  if (!r) {
    r = resolve(name, ev.category ?? "other", country);
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(ck, r);
  }
  const impact = r.minImpact > ev.impact && !r.periodic ? r.minImpact : ev.impact;
  const out: LocalizedEvent = { title: lang === "ru" ? r.title : name, key: r.key, impact, tags: r.tags.length ? r.tags : undefined, fallback: r.fallback };
  if (r.category && r.category !== ev.category) out.category = r.category;
  if (lang === "ru") {
    out.about = r.about;
    out.affects = r.affects;
    out.brief = r.brief;
  }
  return out;
}

/**
 * The one-line impact summary of a glossary key (Russian only): shown right in the event rows. The client looks it up by `gk`
 * (or `~<category>` for the generic fallbacks), so it never travels in the list payload. `country` "RU" gives the wording with
 * the ruble / OFZ / Russian stocks named instead of «валюта страны».
 */
export function glossaryBrief(key: string | undefined, lang: GlossaryLang | string = "ru", country?: string): string | null {
  if (!key || lang !== "ru") return null;
  if (key === "cb.speech") return briefForCountry(key, SPEECH_BRIEF, country);
  if (key === "holiday") return HOLIDAY_BRIEF;
  if (key.startsWith("~")) {
    const cat = key.slice(1);
    const base = GENERIC[cat] ? genericBrief(cat) : GENERIC_BRIEFS[cat];
    return base ? briefForCountry(key, base, country) : null;
  }
  const r = RULES.find((x) => x.key === key);
  return r ? briefForCountry(key, r.brief, country) : null;
}

/** The texts of a glossary key (Russian only): for the event popup on the client. */
export function glossaryText(key: string | undefined, lang: GlossaryLang | string = "ru", country?: string): { about: string; affects: string; brief: string } | null {
  if (!key || lang !== "ru") return null;
  if (key === "cb.speech") return { about: SPEECH_ABOUT, affects: SPEECH_AFFECTS, brief: briefForCountry(key, SPEECH_BRIEF, country) };
  if (key === "holiday") return { about: HOLIDAY_ABOUT, affects: HOLIDAY_AFFECTS, brief: HOLIDAY_BRIEF };
  if (key.startsWith("~")) {
    const g = GENERIC[key.slice(1)];
    return g ? { about: g.about, affects: g.affects, brief: briefForCountry(key, genericBrief(key.slice(1)), country) } : null;
  }
  const r = RULES.find((x) => x.key === key);
  return r ? { about: r.about, affects: r.affects, brief: briefForCountry(key, r.brief, country) } : null;
}

/** For the check script: the hand-written rule behind a name, if any (speeches and holidays included). */
export function explicitKey(name: string, category = "other", country = ""): string | null {
  const r = resolve(name, category, country);
  return r.fallback ? null : r.key;
}

/**
 * Minimum importance of the Russian rows of the feed (raw English names): the feed marks almost all of them "low", so with the default
 * filter (medium and high) the country «Россия» looked empty. The scheduled Russia layer (russia.ts) has the same figures for the future.
 */
const RU_FEED_IMPACT: [RegExp, 2 | 3][] = [
  [/^Interest Rate Decision$/i, 3],
  [/^Inflation Rate (YoY|MoM)\b/i, 3],
  [/^GDP Growth Rate\b/i, 3],
  [/^(CBR Press Conference|Summary of the Key Rate Discussion|PPI|Industrial Production|Unemployment Rate|Retail Sales|Real Wage Growth|Balance of Trade|GDP YoY|Current Account)\b/i, 2],
];
export function ruFeedImpact(name: string): 0 | 2 | 3 {
  const n = name.trim();
  for (const [re, v] of RU_FEED_IMPACT) if (re.test(n)) return v;
  return 0;
}

const memo = new WeakMap<CalEvent, Partial<Record<GlossaryLang, CalEvent>>>();

/**
 * The calendar event as the API serves it: Russian title (the English one moves to `eventEn`), glossary key, market tags, the
 * importance raised for energy events, the period in Russian. The about / affects texts are NOT copied (size): the client looks
 * them up by `gk` (the one-line brief too). Never mutates its argument (the source blocks are shared between requests).
 */
export function localizeCalEvent(e: CalEvent, lang: GlossaryLang = "ru"): CalEvent {
  // the Moscow Exchange, commodity and corporate layers are built already titled / keyed / tagged (lib/calendar/moex.ts, commodities.ts, corporate.ts)
  if (e.category === "moex" || e.category === "commodity" || e.category === "ru" || e.category === "corp") return e;
  let per = memo.get(e);
  if (!per) memo.set(e, (per = {}));
  const hit = per[lang];
  if (hit) return hit;
  const l = localizeEvent(e, lang);
  // Russian rows of the feed carry the lowest importance (TradingView marks nearly all of them -1): raise the ones that move the ruble
  const imp = e.country === "RU" ? Math.max(l.impact, ruFeedImpact(e.event)) : l.impact;
  const out: CalEvent = { ...e, impact: (imp >= 3 ? 3 : imp >= 2 ? 2 : 1) as 1 | 2 | 3 };
  if (l.title && l.title !== e.event) {
    out.event = l.title;
    out.eventEn = e.event;
  }
  if (l.key && !l.key.startsWith("~")) out.gk = l.key;
  if (l.tags) out.tags = l.tags;
  if (l.category) out.category = l.category as CalCategory;
  if (e.period) out.period = localizePeriod(e.period, lang);
  per[lang] = out;
  return out;
}
