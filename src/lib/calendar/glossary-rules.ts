import type { CalCategory } from "./types";
import { BRIEFS, briefFromTags } from "./glossary-briefs";

/*
 * The hand-written part of the economic-calendar glossary: one rule per indicator (or family of indicators).
 * Matching is done on the "base" of the TradingView event name (the trailing MoM / YoY / QoQ / Final / Prel / Flash / Adv / s.a
 * tokens are stripped by glossary.ts and rendered as «м/м», «г/г» ... after the title), first matching rule wins, so the
 * specific rules go before the general ones.
 * Titles carry no country prefix (the row shows the flag) but keep the agency in brackets when it matters.
 * NOTE: no named groups / lookbehind / flag "s" in the regexes: tsconfig targets ES2017.
 */

export type Tag =
  | "usd" | "eur" | "gbp" | "jpy" | "cny" | "rub" | "cad" | "aud" | "nzd" | "chf"
  | "stocks" | "bonds" | "gold" | "oil" | "gas" | "crypto" | "agro"
  /** commodity layer (lib/calendar/commodities.ts) */
  | "cocoa" | "coffee" | "sugar" | "wheat" | "corn" | "soy" | "palm" | "cotton" | "cattle"
  /** corporate layer (lib/calendar/corporate.ts) */
  | "div" | "coupon" | "earnings"
  /** placeholder: replaced by the currency tag of the event's country (or dropped when there is none) */
  | "ccy";

export interface Rule {
  key: string;
  re: RegExp;
  title: string | ((m: RegExpExecArray, country: string) => string);
  about: string;
  affects: string;
  /** one line (<= 90 characters) for the event row: which assets react and how (see glossary-briefs.ts) */
  brief: string;
  tags: Tag[];
  /** energy and similar events must stay visible with the default filters */
  minImpact?: 2 | 3;
  /** TradingView's name misleads the generic category rules (e.g. "Non-Oil Exports") */
  category?: CalCategory;
  /** do not append «м/м», «г/г», «финальная оценка» ... to the title */
  noMods?: boolean;
}

/** Central banks by the short name used in event titles (genitive: «решение ФРС»). */
export const ORG_GEN: Record<string, string> = {
  fed: "ФРС", fomc: "ФРС", ecb: "ЕЦБ", boe: "Банка Англии", boj: "Банка Японии", boc: "Банка Канады", rba: "Резервного банка Австралии",
  rbnz: "Резервного банка Новой Зеландии", snb: "Нацбанка Швейцарии", riksbank: "Риксбанка (Швеция)", "norges bank": "Банка Норвегии",
  rbi: "Резервного банка Индии", tcmb: "ЦБ Турции", cnb: "ЦБ Чехии", pboc: "Народного банка Китая", cbr: "Банка России", "bank of russia": "Банка России",
  bcb: "ЦБ Бразилии", banxico: "Банка Мексики", bundesbank: "Бундесбанка", nbp: "ЦБ Польши", mnb: "ЦБ Венгрии", sarb: "ЦБ ЮАР", bok: "Банка Кореи",
  bi: "Банка Индонезии", bsp: "ЦБ Филиппин", "bank indonesia": "Банка Индонезии", mas: "Денежного управления Сингапура", cbrt: "ЦБ Турции", nbu: "Нацбанка Украины",
  "bank of israel": "Банка Израиля", "bank of korea": "Банка Кореи", "bank of canada": "Банка Канады", "bank of england": "Банка Англии", "bank of japan": "Банка Японии",
};

/** Event country -> its central bank key of ORG_GEN (for «MPC Meeting Minutes», plain «Interest Rate Decision»). */
export const COUNTRY_ORG: Record<string, string> = {
  US: "fed", EU: "ecb", GB: "boe", JP: "boj", CA: "boc", AU: "rba", NZ: "rbnz", CH: "snb", SE: "riksbank", NO: "norges bank", IN: "rbi", TR: "tcmb",
  CZ: "cnb", CN: "pboc", RU: "cbr", BR: "bcb", MX: "banxico", PL: "nbp", HU: "mnb", ZA: "sarb", KR: "bok", ID: "bi", PH: "bsp", SG: "mas", UA: "nbu", IL: "bank of israel",
};

const ORGS = "Fed|FOMC|ECB|BoE|BoJ|BOJ|BoC|RBA|RBNZ|SNB|Riksbank|Norges Bank|RBI|TCMB|CNB|PBoC|CBR|Bank of Russia|BCB|Banxico|Bundesbank|NBP|MNB|SARB|BoK|BI|BSP|MAS|NBU|Bank Indonesia|Bank of Israel|Bank of Korea";

export const orgGen = (org: string | undefined, country: string): string => {
  const k = (org || COUNTRY_ORG[country] || "").toLowerCase();
  return ORG_GEN[k] ?? "центробанка";
};

export const RULES: Rule[] = [];
function R(key: string, re: RegExp, title: Rule["title"], about: string, affects: string, tags: Tag[], opts: Partial<Pick<Rule, "minImpact" | "category" | "noMods">> = {}) {
  RULES.push({ key, re, title, about, affects, brief: BRIEFS[key] ?? briefFromTags(tags), tags, ...opts });
}

/* common "how it moves the market" phrases */
const INF_AFF = "Выше прогноза — рынок ждёт более жёсткой политики центробанка: валюта обычно крепнет, облигации и акции слабеют, золото под давлением. Ниже прогноза — наоборот.";
const JOB_AFF = "Сильнее прогноза — экономика «горячая», снижение ставок откладывается: валюта растёт, облигации дешевеют. Слабее — растут шансы на смягчение политики, валюта слабеет.";
const GROWTH_AFF = "Выше прогноза — укрепление валюты страны и поддержка акций (кроме случаев, когда рынок боится перегрева и роста ставок). Ниже — рост опасений рецессии и ожиданий снижения ставок.";
const PMI_AFF = "Значение выше 50 — рост активности, ниже 50 — спад. Выше прогноза поддерживает валюту страны и акции, ниже — давит; для сырьевых рынков (нефть, металлы) это ещё и сигнал спроса.";
const SENT_AFF = "Выше прогноза — оптимизм, поддержка валюты страны и акций; ниже — осторожность и спрос на защитные активы (облигации, золото).";
const CB_AFF = "Решение и риторика центробанка двигают валюту, облигации и акции сильнее почти любых данных: более жёсткий тон, чем ждали, — валюта растёт, акции и золото слабеют; более мягкий — наоборот.";

/* ───────────────────────── central banks ───────────────────────── */

R("fed.rate", /^Fed Interest Rate Decision$/i, "Решение ФРС по ставке", "Заседание Комитета по открытым рынкам (FOMC): решает, оставить ли ключевую ставку США или изменить её. Самое важное событие недели для мировых рынков.", "Повышение или «ястребиный» тон — доллар растёт, акции, золото и крипто падают. Снижение или «голубиный» тон — доллар слабее, акции, золото и биткоин растут. Важнее всего отклонение от ожиданий рынка.", ["usd", "stocks", "bonds", "gold", "crypto", "rub"]);
R("fed.proj", /^FOMC Economic Projections$/i, "Прогнозы ФРС (экономические проекции FOMC)", "Квартальные прогнозы членов ФРС по ставке («точечный график»), инфляции, безработице и росту ВВП на ближайшие годы.", "Если «точки» показывают меньше снижений ставки, чем ждал рынок, доллар растёт, а акции и золото падают. Больше снижений — наоборот.", ["usd", "stocks", "bonds", "gold", "crypto"]);
R("fomc.minutes", /^FOMC Minutes$/i, "Протокол заседания ФРС (FOMC)", "Подробный отчёт о прошлом заседании ФРС: о чём спорили, как голосовали, какие риски обсуждали. Выходит через три недели после решения.", "Рынок ищет намёки на будущие шаги. Более «ястребиный» протокол, чем ждали, поддерживает доллар и давит на акции и золото; «голубиный» — наоборот.", ["usd", "stocks", "bonds", "gold"]);
R("fed.presser", /^Fed Press Conference$/i, "Пресс-конференция главы ФРС", "Глава ФРС объясняет решение по ставке и отвечает на вопросы журналистов сразу после заседания.", "Тон и отдельные фразы могут развернуть рынок: волатильность в долларе, золоте, акциях и крипто обычно выше всего в эти минуты.", ["usd", "stocks", "bonds", "gold", "crypto"]);
R("fed.beige", /^Fed Beige Book$/i, "Бежевая книга ФРС", "Обзор состояния экономики США по 12 округам ФРС: рынок труда, цены, потребление. Выходит за две недели до заседания ФРС.", "Сильные оценки и рост цен укрепляют доллар и ожидания жёсткой политики; признаки охлаждения — ослабляют.", ["usd", "stocks", "bonds"]);
R("fed.bs", /^Fed Balance Sheet$/i, "Баланс ФРС", "Недельные данные об активах ФРС: сколько облигаций и других бумаг сейчас на балансе центробанка.", "Рост баланса — больше ликвидности (поддержка акций, золота, крипто); сокращение — наоборот.", ["usd", "stocks", "bonds", "crypto"]);
R("fed.bills", /^NY Fed Bill Purchases (.+)$/i, (m) => `Покупки казначейских векселей ФРС Нью-Йорка (${m[1].replace(/\s*to\s*/i, "–").replace(/months/i, "мес.")})`, "Операции ФРС Нью-Йорка по выкупу краткосрочных векселей Казначейства США для поддержания ликвидности на денежном рынке.", "Рост выкупа добавляет ликвидности и слегка поддерживает облигации и рисковые активы.", ["usd", "bonds"]);
R("cb.dots", /^Interest Rate Projection - (.+)$/i, (m) => {
  const w = m[1].toLowerCase();
  const y = /1st/.test(w) ? "1-й год" : /2nd/.test(w) ? "2-й год" : /3rd/.test(w) ? "3-й год" : /longer/.test(w) ? "долгосрочная" : /current/.test(w) ? "текущий год" : m[1];
  return `Прогноз ставки ФРС (точечный график): ${y}`;
}, "Медианный прогноз членов ФРС по уровню ключевой ставки на выбранный горизонт — часть «точечного графика».", "Если прогноз выше ожиданий рынка — доллар дорожает, акции и золото слабеют; ниже — наоборот.", ["usd", "stocks", "bonds", "gold"], { noMods: true });
R("ecb.rate", /^ECB Interest Rate Decision$/i, "Решение ЕЦБ по ставке", "Совет управляющих ЕЦБ решает, изменить ли ключевые ставки еврозоны (ставка по депозитам, основная ставка рефинансирования).", "Неожиданное повышение или жёсткий тон — евро растёт, европейские акции и облигации слабеют. Снижение или мягкий тон — евро слабеет, акции растут.", ["eur", "stocks", "bonds", "gold"]);
R("ecb.presser", /^ECB Press Conference$/i, "Пресс-конференция ЕЦБ", "Глава ЕЦБ комментирует решение по ставке и перспективы экономики еврозоны, отвечает на вопросы.", "Намёки на будущие шаги двигают евро и европейские облигации и акции — волатильность выше обычной.", ["eur", "stocks", "bonds"]);
R("ecb.accounts", /^ECB Monetary Policy Meeting Accounts$/i, "Отчёт о заседании ЕЦБ по денежно-кредитной политике", "Подробное описание обсуждения на прошлом заседании ЕЦБ: аргументы, оценки инфляции и риски.", "Более жёсткий тон, чем ждали, — поддержка евро и давление на акции и облигации; мягкий — наоборот.", ["eur", "stocks", "bonds"]);
R("ecb.council", /^ECB (General Council|Non-Monetary Policy) Meeting$/i, (m) => (/general/i.test(m[1]) ? "Генеральный совет ЕЦБ" : "Заседание ЕЦБ (не по денежно-кредитной политике)"), "Служебное заседание ЕЦБ: решений по ставке на нём нет, но возможны комментарии руководства.", "Обычно слабое влияние на рынок, если не прозвучало заявлений о политике.", ["eur"]);
R("ecb.cie", /^ECB Consumer Inflation Expectations$/i, "Инфляционные ожидания потребителей (ЕЦБ)", "Опрос ЕЦБ: какую инфляцию ждут домохозяйства в ближайший год и дальше.", "Рост ожиданий усиливает шансы на жёсткую политику ЕЦБ и поддерживает евро; снижение — ослабляет.", ["eur", "bonds"]);
R("boe.vote", /^BoE MPC Vote (Cut|Hike|Unchanged)$/i, (m) => `Голоса комитета Банка Англии: ${/cut/i.test(m[1]) ? "за снижение ставки" : /hike/i.test(m[1]) ? "за повышение ставки" : "за сохранение ставки"}`, "Сколько членов Комитета по денежной политике Банка Англии проголосовали за конкретное решение. Публикуется вместе с решением по ставке.", "Раскол голосов показывает, куда склоняется комитет: больше голосов за повышение — фунт растёт, за снижение — слабеет.", ["gbp", "bonds", "stocks"], { noMods: true });
R("boe.fpc", /^BoE Financial Policy Committee Record$/i, "Протокол Комитета по финансовой политике Банка Англии", "Оценка рисков для финансовой системы Великобритании: банки, кредиты, рынок недвижимости.", "Обычно слабое влияние на рынок; предупреждения о рисках могут давить на банки и фунт.", ["gbp", "stocks"]);
R("boe.credit", /^BoE Consumer Credit$/i, "Потребительское кредитование (Банк Англии)", "Месячное изменение потребительских кредитов в Великобритании: ипотека не входит.", "Рост кредитования говорит об уверенном потребителе и немного поддерживает фунт; спад — о слабом спросе.", ["gbp"], { category: "consumer" });
R("cb.rate", new RegExp(`^(?:(${ORGS})\\s+)?(?:Interest\\s+)?Rate\\s+Decision$`, "i"), (m, c) => `Решение ${orgGen(m[1], c)} по ставке`, "Заседание центробанка, на котором принимается решение по ключевой процентной ставке. Ставка определяет стоимость кредитов и доходность вложений в валюте страны.", "Повышение или более жёсткий тон, чем ждали, — валюта страны растёт, акции и облигации слабеют. Снижение — валюта слабеет, акции получают поддержку. Важно отклонение от ожиданий.", ["ccy", "bonds", "stocks"]);
R("cb.presser", new RegExp(`^(${ORGS})\\s+(?:Governor\\s+)?Press\\s+Conference$`, "i"), (m, c) => `Пресс-конференция ${orgGen(m[1], c)}`, "Руководство центробанка объясняет принятое решение и отвечает на вопросы журналистов.", CB_AFF, ["ccy", "bonds", "stocks"]);
R("cb.minutes", new RegExp(`^(?:(${ORGS})\\s+)?(?:MPC\\s+|Monetary\\s+Policy\\s+|Copom\\s+)?Meeting\\s+(?:Minutes|Summary)$`, "i"), (m, c) => `Протокол заседания ${orgGen(m[1], c)}`, "Подробный отчёт о прошедшем заседании центробанка: аргументы членов комитета и их голосование.", "Рынок ищет намёки на будущие решения по ставке. Более жёсткий тон, чем ждали, поддерживает валюту страны и давит на акции и облигации.", ["ccy", "bonds"]);
R("cb.minutes2", new RegExp(`^(${ORGS})\\s+(?:Monetary Policy )?(?:Meeting )?(?:Accounts|Minutes)$`, "i"), (m, c) => `Протокол заседания ${orgGen(m[1], c)}`, "Подробный отчёт о прошедшем заседании центробанка: аргументы членов комитета.", "Рынок ищет намёки на будущие решения по ставке. Более жёсткий тон поддерживает валюту страны и давит на акции и облигации.", ["ccy", "bonds"]);
R("cb.report", new RegExp(`^(?:(${ORGS})\\s+)?Monetary\\s+Policy\\s+(Report|Statement)$`, "i"), (m, c) => `${/report/i.test(m[2]) ? "Доклад" : "Заявление"} по денежно-кредитной политике ${orgGen(m[1], c)}`, "Официальный документ центробанка: оценка экономики и инфляции, прогнозы и планы по ставке.", CB_AFF, ["ccy", "bonds", "stocks"]);
R("cb.outlook", /^BoJ Quarterly Outlook Report$/i, "Квартальный доклад Банка Японии (прогнозы экономики)", "Банк Японии пересматривает прогнозы роста и инфляции — на их основе судят о сроках отказа от сверхмягкой политики.", "Более высокие прогнозы инфляции — иена растёт, японские акции слабеют; низкие — наоборот.", ["jpy", "stocks", "bonds"]);
R("boj.summary", /^BoJ Summary of Opinions$/i, "Сводка мнений членов Банка Японии", "Анонимные мнения членов совета Банка Японии о политике и экономике с последнего заседания.", "Если звучит склонность к повышению ставки — иена укрепляется, акции Японии слабеют.", ["jpy", "stocks", "bonds"]);
R("boj.jgb", /^BoJ JGB Purchase$/i, "Покупки облигаций Банком Японии (JGB)", "Объём операций Банка Японии по выкупу государственных облигаций Японии.", "Сокращение выкупа — доходности растут, иена укрепляется; увеличение — иена слабеет.", ["jpy", "bonds"]);
R("boc.deliber", /^BoC Summary of Deliberations$/i, "Краткий отчёт об обсуждении Банка Канады", "Описание того, как совет Банка Канады пришёл к решению по ставке.", "Жёсткие формулировки поддерживают канадский доллар; мягкие — давят на него.", ["cad", "bonds"]);
R("boc.bos", /^BoC Business Outlook Survey$/i, "Опрос бизнеса Банка Канады", "Квартальный опрос компаний о продажах, инвестициях, наймe и ценах — важный вводный фактор для решения по ставке.", "Оптимизм и рост цен поддерживают канадский доллар и ожидания повышения ставки; пессимизм — давят.", ["cad", "bonds"]);
R("boc.sce", /^BoC Survey of Consumer Expectations$/i, "Опрос потребителей Банка Канады (ожидания)", "Ожидания домохозяйств Канады по инфляции, ценам на жильё и доходам.", "Рост инфляционных ожиданий делает более вероятной жёсткую политику Банка Канады — канадский доллар крепнет.", ["cad", "bonds"]);
R("bcb.focus", /^BCB Focus Market Readout$/i, "Опрос аналитиков «Фокус» (ЦБ Бразилии)", "Еженедельный консенсус-прогноз аналитиков по инфляции, ставке Selic, курсу и росту экономики Бразилии.", "Повышение прогнозов инфляции и ставки поддерживает реал; снижение — ослабляет.", ["ccy"]);
R("bcb.cmn", /^BCB National Monetary Council Meeting$/i, "Заседание Национального валютного совета Бразилии", "Совет определяет целевой уровень инфляции и рамки денежной политики Бразилии.", "Изменение цели по инфляции может сильно двигать реал и бразильские облигации.", ["ccy", "bonds"]);
R("cbr.keyrate", /^Summary of the Key Rate Discussion$/i, "Резюме обсуждения ключевой ставки (Банк России)", "Банк России публикует итоги дискуссии совета директоров о ключевой ставке: какие варианты рассматривали и какие аргументы называли.", "Сигналы о возможном снижении ставки поддерживают облигации и акции РФ и слегка давят на рубль; жёсткий тон — наоборот.", ["rub", "bonds", "stocks"]);
R("snb.bulletin", /^SNB Quarterly Bulletin$/i, "Квартальный бюллетень Нацбанка Швейцарии", "Обзор экономики Швейцарии и политики ШНБ по итогам квартала.", "Намёки на интервенции или смену ставки двигают швейцарский франк.", ["chf"]);
R("seco", /^SECO Economic Forecasts$/i, "Прогнозы экономики Швейцарии (SECO)", "Государственный секретариат по экономике обновляет прогноз роста ВВП, инфляции и безработицы Швейцарии.", "Улучшение прогнозов поддерживает франк; ухудшение — ослабляет.", ["chf"]);
R("cb.facility", /^(Deposit Facility Rate|Marginal Lending Rate|Lending Facility Rate|Overnight Lending Rate|Overnight Borrowing Rate|Prime Overdraft Rate|Deposit Interest Rate)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("deposit facility")) return "Ставка по депозитам центробанка";
  if (k.startsWith("marginal") || k.startsWith("lending")) return "Ставка предельного кредитования центробанка";
  if (k.startsWith("overnight lending")) return "Ставка овернайт (кредитование)";
  if (k.startsWith("overnight borrowing")) return "Ставка овернайт (заимствование)";
  if (k.startsWith("prime")) return "Базовая ставка кредитования (prime rate)";
  return "Ставка по депозитам";
}, "Одна из процентных ставок центробанка, которая задаёт «коридор» стоимости денег в экономике. Часто объявляется вместе с решением по ключевой ставке.", "Повышение ставки поддерживает валюту страны, но давит на акции и облигации; снижение — наоборот.", ["ccy", "bonds"], { noMods: true });
R("cb.crr", /^Cash Reserve Ratio$/i, "Норма обязательных резервов банков", "Доля депозитов, которую банки обязаны держать в резерве у центробанка.", "Повышение нормы изымает ликвидность из банков и поддерживает валюту, но тормозит кредит и акции банков.", ["ccy", "stocks"]);
R("cn.lpr", /^Loan Prime Rate (1Y|5Y)$/i, (m) => `Базовая ставка по кредитам Китая (LPR), ${m[1].toUpperCase() === "1Y" ? "1 год" : "5 лет"}`, "Ориентир для ставок по кредитам в Китае: 1-летняя ставка влияет на кредиты бизнесу, 5-летняя — на ипотеку. Объявляется раз в месяц Народным банком Китая.", "Снижение ставки стимулирует экономику Китая — поддерживает сырьё (нефть, металлы) и азиатские акции, юань слегка слабеет. Сохранение ставки — нейтрально.", ["cny", "stocks"], { noMods: true });
R("tankan.big", /^Tankan (?:Large )?(Manufacturers|Manufacturing|Non-Manufacturing)( Index| Outlook)?$/i, (m) => `Танкан: настроения крупных ${/^non/i.test(m[1]) ? "компаний сферы услуг" : "производителей"}${/outlook/i.test(m[2] ?? "") || /outlook/i.test(m[0]) ? " (ожидания)" : ""}`, "Квартальный опрос Банка Японии о деловых настроениях: показывает, как крупные компании оценивают условия и перспективы. Одно из главных событий для иены.", "Значение выше прогноза — иена и акции Японии растут, ожидания повышения ставки усиливаются; ниже — наоборот.", ["jpy", "stocks"], { category: "manufacturing", noMods: true });
R("tankan.small", /^Tankan Small Manufacturers Index$/i, "Танкан: настроения малых производителей", "Квартальный опрос Банка Японии о настроениях малого бизнеса в промышленности.", "Выше прогноза — поддержка иены и акций Японии; ниже — давление.", ["jpy", "stocks"], { category: "manufacturing" });
R("tankan.capex", /^Tankan Large All Industry Capex$/i, "Танкан: капитальные затраты крупных компаний", "План инвестиций крупных японских компаний по опросу Банка Японии.", "Рост планов инвестиций — признак уверенности бизнеса, поддержка иены и акций Японии.", ["jpy", "stocks"], { category: "manufacturing" });
R("tankan.reuters", /^Reuters Tankan Index$/i, "Индекс Reuters Tankan", "Ежемесячный опрос компаний Японии, предвосхищающий квартальный Танкан Банка Японии.", "Выше прогноза — иена и акции Японии растут; ниже — давление.", ["jpy", "stocks"], { category: "manufacturing" });
R("jp.ecowatch", /^Eco Watchers Survey (Current|Outlook)$/i, (m) => `Опрос «Эко-вотчерс» Японии: ${/current/i.test(m[1]) ? "текущие условия" : "ожидания"}`, "Опрос работников розницы, ресторанов, перевозчиков — тех, кто первым чувствует настроения потребителей Японии.", "Выше прогноза — потребитель уверен, иена и акции Японии укрепляются.", ["jpy", "stocks"], { category: "consumer", noMods: true });

/* ───────────────────────── inflation ───────────────────────── */

R("cpi.core", /^(?:Core Inflation Rate|Core CPI|Inflation Rate Ex-Food and Energy|Tokyo (?:Core CPI|CPI Ex Food and Energy)|Mid-month Core Inflation Rate)$/i, (m) => (/tokyo/i.test(m[0]) ? "Базовая инфляция в Токио (без продуктов и энергии)" : /mid/i.test(m[0]) ? "Базовая инфляция (середина месяца)" : "Базовая инфляция (без продуктов и энергии)"), "Рост потребительских цен без самых волатильных составляющих — продуктов и энергоносителей. Центробанки следят именно за ней, потому что она показывает устойчивое давление цен.", INF_AFF, ["ccy", "bonds", "stocks", "gold"]);
R("cpi.tokyo", /^Tokyo CPI$/i, "Инфляция в Токио (CPI)", "Потребительские цены в Токио — первый опережающий сигнал по инфляции в Японии, выходит раньше общенациональных данных.", "Рост выше прогноза усиливает ожидания повышения ставки Банка Японии: иена растёт, акции Японии слабеют.", ["jpy", "bonds", "stocks"]);
R("cpi.tokyo2", /^Tokyo Core CPI$/i, "Базовая инфляция в Токио (CPI)", "Потребительские цены в Токио без свежих продуктов — ключевой ориентир для Банка Японии.", "Рост выше прогноза — иена растёт; ниже — иена слабеет.", ["jpy", "bonds", "stocks"]);
R("cpi.main", /^(?:Inflation Rate|CPI|Harmonised Inflation Rate|Quarterly Inflation Rate|Mid-month Inflation Rate|IPCA mid-month CPI|CPI Flash)$/i, (m) => (/harmon/i.test(m[0]) ? "Гармонизированная инфляция (HICP)" : /quarterly/i.test(m[0]) ? "Инфляция, квартальные данные" : /mid-month|ipca/i.test(m[0]) ? "Инфляция (оценка на середину месяца)" : "Инфляция (индекс потребительских цен, CPI)"), "Как изменились цены на товары и услуги для потребителей. Главный показатель инфляции: от него зависит политика центробанка.", INF_AFF, ["ccy", "bonds", "stocks", "gold"]);
R("cpi.sub", /^(CPI Common|CPI Median|CPI Trimmed-Mean|CPIF|RBA Trimmed Mean CPI|RBA Weighted Median CPI|Quarterly RBA Trimmed Mean CPI)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.includes("common")) return "Инфляция CPI Common (общая компонента)";
  if (k.includes("median") && !k.includes("rba")) return "Инфляция CPI Median (медианная)";
  if (k.includes("cpif")) return "Инфляция CPIF (с фиксированной ставкой по ипотеке)";
  if (k.includes("weighted")) return "Взвешенная медианная инфляция (РБА)";
  return "Инфляция «усечённое среднее» (РБА)";
}, "Показатель базовой инфляции, который центробанк использует, чтобы отсечь разовые скачки цен и увидеть устойчивую динамику.", INF_AFF, ["ccy", "bonds"]);
R("cpi.state", /^(Baden Wuerttemberg|Bavaria|Brandenburg|Hesse|Saxony|North Rhine Westphalia) CPI$/i, (m) => {
  const n: Record<string, string> = { "baden wuerttemberg": "Баден-Вюртемберге", bavaria: "Баварии", brandenburg: "Бранденбурге", hesse: "Гессене", saxony: "Саксонии", "north rhine westphalia": "Северном Рейне — Вестфалии" };
  return `Инфляция в ${n[m[1].toLowerCase()] ?? m[1]} (CPI, Германия)`;
}, "Предварительные данные по инфляции в одной из земель Германии — публикуются раньше общегерманского индекса.", "Дают подсказку, каким будет общий индекс Германии и еврозоны: выше прогноза поддерживает евро и давит на облигации.", ["eur", "bonds"]);
R("cpi.exp", /^(?:Consumer Inflation Expectations|Inflation Expectations|Michigan (?:5 Year )?Inflation Expectations|DMP 1Y CPI Expectations|DMP 3M Output Price Expectations|Selling Price Expectations)$/i, (m) => {
  const k = m[0].toLowerCase();
  if (k.startsWith("michigan 5")) return "Инфляционные ожидания Мичигана на 5 лет";
  if (k.startsWith("michigan")) return "Инфляционные ожидания Мичигана на год";
  if (k.startsWith("dmp 1y")) return "Инфляционные ожидания на год (опрос DMP, Банк Англии)";
  if (k.startsWith("dmp 3m")) return "Ожидания по ценам производителей на 3 мес. (опрос DMP)";
  if (k.startsWith("selling")) return "Ожидания компаний по отпускным ценам";
  return "Инфляционные ожидания";
}, "Какую инфляцию ждут люди и компании. Если ожидания растут, цены и зарплаты склонны расти ещё быстрее, поэтому центробанки внимательно за ними следят.", "Рост ожиданий усиливает шансы на жёсткую политику: валюта крепнет, облигации и акции слабеют. Снижение — наоборот.", ["ccy", "bonds", "stocks"]);
R("pce.core", /^Core PCE Price Index$|^Core PCE Prices(?: QoQ)?$/i, "Базовый индекс цен расходов на личное потребление (Core PCE)", "Любимый показатель инфляции ФРС: рост цен в потребительской корзине без продуктов и энергии. Выходит вместе с данными по личным доходам и расходам.", "Выше прогноза — ФРС дольше держит ставку высокой: доллар растёт, акции, золото и крипто слабеют. Ниже прогноза — наоборот.", ["usd", "bonds", "stocks", "gold", "crypto"], { minImpact: 3 });
R("pce", /^PCE Price Index$|^PCE Prices(?: QoQ)?$/i, "Индекс цен расходов на личное потребление (PCE)", "Показатель инфляции в США, на который ориентируется ФРС: рост цен на товары и услуги, которые покупают домохозяйства.", "Выше прогноза — ожидания высокой ставки ФРС, доллар крепнет, акции и золото слабеют. Ниже — наоборот.", ["usd", "bonds", "stocks", "gold"]);
R("ppi.core", /^(?:Core PPI|PPI Core Output|PPI Ex Food, Energy and Trade)$/i, (m) => (/trade/i.test(m[0]) ? "Цены производителей без продуктов, энергии и торговли (PPI)" : "Базовые цены производителей (Core PPI)"), "Рост оптовых цен, по которым производители продают товары, без волатильных продуктов и энергии. Опережает потребительскую инфляцию.", "Выше прогноза — риск ускорения инфляции и более жёсткой политики: валюта крепнет, облигации и акции слабеют.", ["ccy", "bonds", "stocks"]);
R("ppi", /^(?:PPI|PPI Input|PPI Output|Producer & Import Prices|Wholesale Prices|Raw Materials Prices|WPI Inflation|WPI Manufacturing|WPI Food Index|WPI Fuel)$/i, (m) => {
  const k = m[0].toLowerCase();
  if (k.includes("input")) return "Цены производителей: затраты (PPI Input)";
  if (k.includes("output")) return "Цены производителей: выпуск (PPI Output)";
  if (k.startsWith("producer")) return "Цены производителей и импорта";
  if (k.startsWith("wholesale")) return "Оптовые цены";
  if (k.startsWith("raw")) return "Цены на сырьё и материалы";
  if (k.startsWith("wpi fuel")) return "Оптовые цены на топливо (WPI, Индия)";
  if (k.startsWith("wpi food")) return "Оптовые цены на продукты (WPI, Индия)";
  if (k.startsWith("wpi man")) return "Оптовые цены на промтовары (WPI, Индия)";
  if (k.startsWith("wpi")) return "Оптовая инфляция (WPI, Индия)";
  return "Цены производителей (PPI)";
}, "Как меняются цены, по которым производители продают товары. Обычно это ранний сигнал: рост оптовых цен позже перетекает в цены для потребителей.", "Выше прогноза — риск ускорения инфляции и более жёсткой политики: валюта крепнет, облигации и акции слабеют.", ["ccy", "bonds", "stocks"]);
R("ppi.trade", /^(Import|Export) Prices$/i, (m) => (/import/i.test(m[1]) ? "Цены импорта" : "Цены экспорта"), "Как меняются цены на ввозимые в страну (или вывозимые из неё) товары. Показывает внешнее давление на инфляцию.", "Рост цен импорта разгоняет инфляцию и поддерживает ожидания жёсткой политики; снижение — наоборот.", ["ccy", "bonds"]);
R("gdp.price", /^GDP Price Index$|^GDP Deflator$/i, "Дефлятор ВВП (индекс цен ВВП)", "Широкий показатель инфляции: изменение цен всех товаров и услуг, произведённых в экономике.", INF_AFF, ["ccy", "bonds"], { category: "inflation" });
R("cpi.misc", /^(Retail Price Index|RPI|BRC Shop Price Inflation|Food Inflation|IGP-10 Inflation|IGP-M Inflation|IPC-Fipe Inflation|FAO Food Price Index|Commodity Prices|Used Car Prices|TD-MI Inflation Gauge|Construction Cost Index|Global Supply Chain Pressure Index)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.includes("retail price")) return "Индекс розничных цен (RPI)";
  if (k.startsWith("brc")) return "Инфляция цен в магазинах (BRC)";
  if (k.startsWith("food inflation")) return "Инфляция цен на продукты";
  if (k.startsWith("igp-10")) return "Индекс общих цен IGP-10 (Бразилия)";
  if (k.startsWith("igp-m")) return "Индекс общих цен IGP-M (Бразилия)";
  if (k.startsWith("ipc")) return "Инфляция IPC-Fipe (Сан-Паулу)";
  if (k.startsWith("fao")) return "Индекс мировых цен на продовольствие (ФАО)";
  if (k.startsWith("commodity")) return "Цены на сырьевые товары";
  if (k.startsWith("used")) return "Цены на подержанные автомобили";
  if (k.startsWith("td")) return "Индикатор инфляции TD-MI";
  if (k.startsWith("construction")) return "Индекс стоимости строительства";
  return "Индекс давления на цепочки поставок (ФРБ Нью-Йорка)";
}, "Дополнительный показатель роста цен. Помогает оценить, куда пойдёт основная инфляция.", "Ускорение цен поддерживает ожидания жёсткой политики центробанка и валюту страны; замедление — наоборот.", ["ccy", "bonds"]);

/* ───────────────────────── labour market ───────────────────────── */

R("nfp", /^Non[ -]?Farm Payrolls$/i, "Число новых рабочих мест вне сельского хозяйства (Non-Farm Payrolls)", "Главный отчёт по рынку труда США: сколько рабочих мест создано за месяц (без сельского хозяйства). Выходит в первую пятницу месяца.", "Выше прогноза — доллар растёт, золото и акции чувствительны к ожиданиям по ставке ФРС; ниже — доллар слабеет, золото и крипто часто растут. Один из самых волатильных дней месяца.", ["usd", "stocks", "bonds", "gold", "crypto"], { minImpact: 3 });
R("nfp.sub", /^(Nonfarm Payrolls Private|Private Non Farm Payrolls|Non Farm Payrolls|Government Payrolls|Manufacturing Payrolls|Net Payrolls|HMRC Payrolls Change)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.includes("private")) return "Рабочие места в частном секторе (Non-Farm, частный)";
  if (k.startsWith("government")) return "Рабочие места в госсекторе";
  if (k.startsWith("manufacturing")) return "Рабочие места в промышленности";
  if (k.startsWith("hmrc")) return "Изменение числа занятых по налоговым данным (HMRC)";
  if (k.startsWith("net")) return "Чистое изменение числа занятых";
  return "Рабочие места вне сельского хозяйства (Non-Farm)";
}, "Сколько рабочих мест появилось или исчезло — часть отчёта по занятости.", JOB_AFF, ["ccy", "bonds", "stocks"]);
R("unemp.u6", /^U-6 Unemployment Rate$/i, "Безработица U-6 (расширенная)", "Расширенный показатель безработицы США: учитывает отчаявшихся и работающих неполный день против желания.", JOB_AFF, ["usd", "bonds"]);
R("unemp.rate", /^Unemployment Rate$|^Registered Jobless Rate$/i, (m) => (/registered/i.test(m[0]) ? "Уровень зарегистрированной безработицы" : "Уровень безработицы"), "Доля людей, которые ищут работу и не могут её найти, в общей рабочей силе. Чем ниже, тем сильнее рынок труда.", "Ниже прогноза — рынок труда сильный, ожидания жёсткой политики растут: валюта крепнет, облигации слабеют. Выше — наоборот.", ["ccy", "bonds", "stocks"]);
R("unemp.chg", /^(Unemployment Change|Unemployed Persons|Jobseekers Total|Unemployment Benefit Claims)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.includes("persons")) return "Число безработных";
  if (k.includes("jobseekers")) return "Число ищущих работу";
  if (k.includes("benefit")) return "Заявки на пособие по безработице";
  return "Изменение числа безработных";
}, "Сколько людей осталось без работы или обратилось за пособием. Рост — плохой сигнал для экономики.", "Рост числа безработных выше прогноза давит на валюту страны и акции, но повышает шансы на смягчение политики.", ["ccy", "bonds"]);
R("emp.chg", /^(Employment Change|Full Time Employment Chg|Part Time Employment Chg|Employed Persons|Employment Growth)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("full")) return "Занятость на полный день (изменение)";
  if (k.startsWith("part")) return "Занятость на неполный день (изменение)";
  if (k.includes("persons")) return "Число занятых";
  if (k.includes("growth")) return "Рост занятости";
  return "Изменение числа занятых";
}, "Сколько рабочих мест создано или потеряно по сравнению с прошлым периодом.", JOB_AFF, ["ccy", "bonds", "stocks"]);
R("emp.part", /^Participation Rate$/i, "Уровень участия в рабочей силе", "Доля трудоспособного населения, которое работает или ищет работу.", "Рост участия смягчает дефицит работников и давление на зарплаты; снижение — наоборот.", ["ccy"]);
R("claims.init", /^Initial Jobless Claims$/i, "Первичные заявки на пособие по безработице", "Еженедельное число людей в США, впервые обратившихся за пособием. Самая оперативная оценка состояния рынка труда.", "Заявок меньше прогноза — рынок труда крепкий, доллар растёт, облигации слабеют. Больше — признак охлаждения, доллар слабеет, акции колеблются.", ["usd", "bonds", "stocks"]);
R("claims.cont", /^Continuing Jobless Claims$|^Jobless Claims 4-week Average$/i, (m) => (/4-week/i.test(m[0]) ? "Заявки на пособие по безработице: среднее за 4 недели" : "Продолжающиеся заявки на пособие по безработице"), "Сколько людей в США продолжают получать пособие по безработице — показывает, как быстро находят новую работу.", "Рост — рынок труда слабеет, доллар давит; снижение — поддержка доллара.", ["usd", "bonds"]);
R("claims.uk", /^Claimant Count Change$/i, "Число получателей пособия по безработице (Великобритания)", "Месячное изменение числа людей, подавших заявки на пособие по безработице в Великобритании.", "Рост выше прогноза — рынок труда слабеет, фунт давит; снижение — фунт поддерживается.", ["gbp", "bonds"]);
R("adp.w", /^ADP Employment Change Weekly$/i, "Занятость в частном секторе США по данным ADP (недельная)", "Недельная оценка прироста рабочих мест в частном секторе США по данным платёжной компании ADP — оперативный «предвестник» официального отчёта.", JOB_AFF, ["usd", "bonds", "stocks"]);
R("adp", /^ADP Employment Change$/i, "Занятость в частном секторе США по данным ADP", "Оценка прироста рабочих мест в частном секторе США от компании ADP. Выходит за два дня до официального отчёта Non-Farm Payrolls и намекает на его результат.", JOB_AFF, ["usd", "bonds", "stocks", "gold"]);
R("jolts", /^JOLTs Job (Openings|Quits)$/i, (m) => (/open/i.test(m[1]) ? "Число открытых вакансий в США (JOLTS)" : "Число уволившихся по собственному желанию (JOLTS)"), "Опрос Министерства труда США: сколько открытых вакансий и сколько людей уволились сами. Показывает «накал» рынка труда: много вакансий и увольнений — сильный рынок.", JOB_AFF, ["usd", "bonds", "stocks"]);
R("challenger", /^Challenger Job Cuts$/i, "Планируемые увольнения в США (Challenger)", "Число объявленных компаниями США сокращений персонала за месяц.", "Рост сокращений — рынок труда слабеет, доллар давит, ожидания смягчения ФРС усиливаются.", ["usd", "bonds"]);
R("wages.ahe", /^Average Hourly Earnings$/i, "Средняя почасовая оплата труда", "Как быстро растут зарплаты в США — часть отчёта по занятости. Главный индикатор «зарплатной» инфляции.", "Рост выше прогноза — риск ускорения инфляции и более жёсткой ФРС: доллар растёт, акции и облигации слабеют.", ["usd", "bonds", "stocks", "gold"]);
R("wages.gen", /^(Average Earnings (?:incl|excl)\. Bonus \(3Mo\/Yr\)|Average Cash Earnings|Average Weekly Earnings|Average Hourly Wages|Wage Growth|Real Wage Growth|Gross Wage|Corporate Sector Wages|Overtime Pay|Average Weekly Hours)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("average earnings")) return `Средний заработок ${k.includes("incl") ? "с учётом" : "без учёта"} бонусов (за 3 мес. к прошлому году)`;
  if (k.includes("cash")) return "Средние денежные заработки";
  if (k.includes("weekly earnings")) return "Средние недельные заработки";
  if (k.includes("hourly wages")) return "Средняя почасовая зарплата";
  if (k.startsWith("real")) return "Рост реальных зарплат";
  if (k.startsWith("wage growth")) return "Рост зарплат";
  if (k.startsWith("gross")) return "Средняя брутто-зарплата";
  if (k.startsWith("corporate")) return "Зарплаты в корпоративном секторе";
  if (k.startsWith("overtime")) return "Оплата сверхурочных";
  return "Средняя продолжительность рабочей недели";
}, "Как быстро растут доходы работников. Быстрый рост зарплат разгоняет потребление и инфляцию.", "Рост выше прогноза поддерживает ожидания жёсткой политики: валюта страны крепнет, облигации слабеют. Для реальных зарплат рост — признак здорового спроса.", ["ccy", "bonds"]);
R("eci", /^Employment Cost(?: Index| - Benefits| - Wages)$/i, (m) => (/benefits/i.test(m[0]) ? "Стоимость рабочей силы: льготы и компенсации (США)" : /wages/i.test(m[0]) ? "Стоимость рабочей силы: зарплаты (США)" : "Индекс стоимости рабочей силы (ECI, США)"), "Квартальный показатель того, сколько работодатели тратят на оплату труда и льготы. ФРС использует его для оценки зарплатной инфляции.", "Выше прогноза — давление на инфляцию, шансы жёсткой политики растут: доллар укрепляется, облигации слабеют.", ["usd", "bonds", "stocks"]);
R("labcost", /^Labou?r Costs? Index$|^Labou?r Cost Index$/i, "Индекс стоимости рабочей силы", "Квартальное изменение затрат работодателей на оплату труда.", "Быстрый рост издержек на труд — риск инфляции, поддержка валюты страны на ожиданиях жёсткой политики.", ["ccy", "bonds"]);
R("jobs.misc", /^(Jobs\/applications ratio|ANZ-Indeed Job Ads|Net Lending to Individuals)$/i, (m) => (/jobs/i.test(m[1]) ? "Число вакансий на одного соискателя (Япония)" : /anz/i.test(m[1]) ? "Число вакансий на job-сайтах ANZ-Indeed" : "Чистое кредитование населения"), "Показатель спроса на работников и состояния рынка труда.", "Рост спроса на работников — признак сильной экономики и поддержка валюты страны.", ["ccy"]);

/* ───────────────────────── growth ───────────────────────── */

R("gdp", /^(?:GDP Growth Rate|GDP Growth Annualized|GDP|GNP|GDP 3-Month Avg|NIESR Monthly GDP Tracker)$/i, (m) => {
  const k = m[0].toLowerCase();
  if (k.includes("annualized")) return "Рост ВВП в пересчёте на год";
  if (k.includes("3-month")) return "ВВП, среднее за 3 месяца";
  if (k.startsWith("gnp")) return "Валовый национальный продукт (ВНП)";
  if (k.startsWith("niesr")) return "Месячная оценка ВВП (NIESR)";
  return "Рост ВВП";
}, "Изменение стоимости всех товаров и услуг, произведённых в стране, — главный показатель размера и роста экономики. Первая оценка (Adv/Prel/Flash) обычно двигает рынок сильнее, чем последующие уточнения.", GROWTH_AFF, ["ccy", "stocks", "bonds"]);
R("gdp.comp", /^GDP (Capital Expenditure|External Demand|Private Consumption|Sales)$/i, (m) => {
  const k = m[1].toLowerCase();
  return k.startsWith("capital") ? "ВВП: инвестиции" : k.startsWith("external") ? "ВВП: внешний спрос" : k.startsWith("private") ? "ВВП: частное потребление" : "ВВП: конечные продажи";
}, "Составная часть ВВП: показывает, за счёт чего растёт или падает экономика.", GROWTH_AFF, ["ccy", "stocks"]);
R("gdp.spend", /^(Real Consumer Spending|Private Spending|Private Consumption|Household Consumption|Private Investment|Business Investment|Gross Fixed Investment|Aggregate Demand)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("real")) return "Реальные потребительские расходы";
  if (k.startsWith("private spending")) return "Частные расходы";
  if (k.startsWith("private cons")) return "Частное потребление";
  if (k.startsWith("household")) return "Потребление домохозяйств";
  if (k.startsWith("private inv")) return "Частные инвестиции";
  if (k.startsWith("business")) return "Инвестиции бизнеса";
  if (k.startsWith("gross")) return "Валовые инвестиции в основной капитал";
  return "Совокупный спрос";
}, "Расходы потребителей и компаний — основной двигатель роста экономики.", GROWTH_AFF, ["ccy", "stocks"], { category: "growth" });
R("act.idx", /^(Economic Activity|IBC-BR Economic Activity|IMACEC Economic Activity|ISE Economic Activity|Tertiary Industry Index|Coincident Index|Leading Index|Leading Indicator|Leading Economic Index|Leading Business Cycle Indicator|CB Leading Index|Westpac Leading Index|Chicago Fed National Activity Index)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("tertiary")) return "Индекс сферы услуг (Япония)";
  if (k.startsWith("coincident")) return "Совпадающий индекс деловой активности";
  if (k.startsWith("westpac")) return "Опережающий индекс Westpac";
  if (k.startsWith("cb leading") || k.startsWith("leading economic")) return "Индекс опережающих индикаторов (Conference Board)";
  if (k.startsWith("chicago")) return "Национальный индекс деловой активности (ФРБ Чикаго)";
  if (k.startsWith("leading")) return "Опережающий индикатор экономики";
  return "Индекс экономической активности";
}, "Сводный индекс, который объединяет несколько показателей и даёт оценку состояния экономики. Предупреждает о развороте раньше, чем это покажет ВВП.", GROWTH_AFF, ["ccy", "stocks"], { category: "growth" });

/* ───────────────────────── manufacturing, PMI, surveys ───────────────────────── */

R("pmi.ism.sub", /^ISM (Manufacturing|Services) (Employment|New Orders|Prices|Business Activity)$/i, (m) => `ISM ${/manuf/i.test(m[1]) ? "в промышленности" : "в сфере услуг"}: ${({ employment: "занятость", "new orders": "новые заказы", prices: "цены", "business activity": "деловая активность" } as Record<string, string>)[m[2].toLowerCase()] ?? m[2]}`, "Составляющая индекса менеджеров по закупкам ISM: по ней видно, что именно тянет общий индекс вверх или вниз.", PMI_AFF, ["usd", "stocks", "bonds"]);
R("pmi.ism", /^ISM (Manufacturing|Services) PMI$/i, (m) => `Индекс деловой активности ISM ${/manuf/i.test(m[1]) ? "в промышленности" : "в сфере услуг"} (PMI)`, "Опрос менеджеров по закупкам США: активность, новые заказы, занятость, цены. Выше 50 — рост, ниже 50 — спад. Один из главных индикаторов состояния американской экономики.", PMI_AFF, ["usd", "stocks", "bonds", "gold"]);
R("pmi.pmi", /^(.*?)\s*(Manufacturing|Services|Composite|Construction|General|Non Manufacturing|Non-Manufacturing)?\s*PMI$/i, (m) => {
  const kind = (m[2] ?? "").toLowerCase();
  const t = kind.startsWith("manuf") ? " в промышленности" : kind.startsWith("serv") ? " в сфере услуг" : kind.startsWith("comp") ? " (композитный)" : kind.startsWith("constr") ? " в строительстве" : kind.startsWith("non") ? " в непроизводственном секторе" : kind.startsWith("gen") ? " (общий)" : "";
  const src = (m[1] ?? "").trim();
  return `Индекс деловой активности (PMI)${t}${src ? ` — ${src}` : ""}`;
}, "Опрос менеджеров по закупкам: растёт или падает активность в отрасли. Значение выше 50 — рост, ниже 50 — спад. Показывает состояние экономики раньше, чем ВВП.", PMI_AFF, ["ccy", "stocks", "bonds"], { category: "manufacturing" });
R("pmi.reg", /^(NY Empire State Manufacturing Index|Philadelphia Fed Manufacturing Index|Richmond Fed Manufacturing Index|Richmond Fed Manufacturing Shipments Index|Richmond Fed Services Revenues Index|Dallas Fed Manufacturing Index|Dallas Fed Services Index|Dallas Fed Services Revenues Index|Kansas Fed Manufacturing Index|Kansas Fed Composite Index|NY Fed Services Activity Index|Chicago PMI|Philly Fed (?:Business Conditions|CAPEX Index|Employment|New Orders|Prices Paid))$/i, (m) => {
  const k = m[1].toLowerCase();
  const reg = k.includes("empire") ? "Нью-Йорк (Empire State)" : k.includes("phil") ? "Филадельфия" : k.includes("richmond") ? "Ричмонд" : k.includes("dallas") ? "Даллас" : k.includes("kansas") ? "Канзас-Сити" : k.includes("ny fed") ? "Нью-Йорк" : "Чикаго";
  if (k.startsWith("chicago")) return "Индекс деловой активности Чикаго (Chicago PMI)";
  const sub = k.includes("shipments") ? ": отгрузки" : k.includes("revenues") ? ": выручка в услугах" : k.includes("services") ? ": сфера услуг" : k.includes("business conditions") ? ": условия бизнеса" : k.includes("capex") ? ": капвложения" : k.includes("employment") ? ": занятость" : k.includes("new orders") ? ": новые заказы" : k.includes("prices paid") ? ": цены закупок" : k.includes("composite") ? ": композитный" : k.includes("manufacturing") ? ": промышленность" : "";
  return `Опрос ФРС региона ${reg}${sub}`;
}, "Региональный опрос предприятий одного из округов ФРС США. Выходит раньше общенациональных индексов и даёт подсказку об их результате. Выше 0 — рост активности, ниже 0 — спад.", "Выше прогноза — поддержка доллара и акций США, подтверждение сильной промышленности; ниже — давление.", ["usd", "stocks"], { category: "manufacturing" });
R("ip", /^(Industrial Production|Manufacturing Production|Mining Production|Industrial Sales|Manufacturing Sales|Infrastructure Output|Construction Output|Construction Orders|Cement Production|Car Production|Auto Production|Capacity Utilization|Industrial Capacity Utilization|NZIER Capacity Utilization|Machinery Orders|Machine Tool Orders|Factory Orders|Factory Orders ex Transportation|Durable Goods Orders|Durable Goods Orders ex Defense|Durable Goods Orders Ex Transp|Non Defense Goods Orders Ex Air|Export Orders|New Orders|Copper Production|Gold Production|Business Inventories|Wholesale Inventories|Retail Inventories Ex Autos|Wholesale Sales)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k === "industrial production") return "Промышленное производство";
  if (k === "manufacturing production") return "Обрабатывающая промышленность: выпуск";
  if (k.startsWith("mining")) return "Добыча полезных ископаемых";
  if (k.startsWith("industrial sales")) return "Промышленные продажи";
  if (k.startsWith("manufacturing sales")) return "Продажи обрабатывающей промышленности";
  if (k.startsWith("infrastructure")) return "Выпуск инфраструктурных отраслей";
  if (k.startsWith("construction output")) return "Объём строительных работ";
  if (k.startsWith("construction orders")) return "Заказы в строительстве";
  if (k.startsWith("cement")) return "Производство цемента";
  if (k.startsWith("car prod") || k.startsWith("auto prod")) return "Производство автомобилей";
  if (k.includes("capacity")) return "Загрузка производственных мощностей";
  if (k.startsWith("machinery")) return "Заказы на машины и оборудование";
  if (k.startsWith("machine tool")) return "Заказы на станки";
  if (k.startsWith("factory orders ex")) return "Заказы промышленности без транспорта";
  if (k.startsWith("factory")) return "Заказы промышленности";
  if (k.startsWith("durable goods orders ex") || k.startsWith("non defense")) return "Заказы на товары длительного пользования без транспорта/оборонки";
  if (k.startsWith("durable")) return "Заказы на товары длительного пользования";
  if (k.startsWith("export orders")) return "Экспортные заказы";
  if (k.startsWith("new orders")) return "Новые заказы";
  if (k.startsWith("copper")) return "Добыча меди";
  if (k.startsWith("gold")) return "Добыча золота";
  if (k.startsWith("business inv")) return "Товарно-материальные запасы бизнеса";
  if (k.startsWith("wholesale inv")) return "Запасы оптовой торговли";
  if (k.startsWith("retail inv")) return "Запасы розничной торговли без автомобилей";
  return "Оптовые продажи";
}, "Показывает, сколько производит и продаёт промышленность, насколько загружены заводы и растут ли заказы. Промышленность — чувствительный индикатор делового цикла.", "Выше прогноза — признак подъёма: поддержка валюты страны и акций, рост спроса на сырьё (нефть, металлы). Ниже — давление на них.", ["ccy", "stocks"], { category: "manufacturing" });
R("fdi.fai", /^(Fixed Asset Investment \(YTD\)|Industrial Profits \(YTD\)|FDI \(YTD\))$/i, (m) => (/fixed/i.test(m[1]) ? "Инвестиции в основной капитал Китая (с начала года)" : /profit/i.test(m[1]) ? "Прибыль промышленных предприятий Китая (с начала года)" : "Прямые иностранные инвестиции в Китай (с начала года)"), "Накопленный за год показатель экономики Китая: инвестиции, прибыль или приток иностранного капитала.", "Выше прогноза — поддержка юаня, азиатских акций и сырьевых рынков (нефть, медь, железная руда); ниже — давление.", ["cny", "stocks"]);
R("profit", /^(Corporate Profits|Industrial Profits)$/i, "Корпоративные прибыли", "Прибыль компаний страны за период — основа для оценки справедливой стоимости акций.", "Выше прогноза — поддержка акций и валюты; ниже — давление на фондовый рынок.", ["ccy", "stocks"]);
R("ifo", /^Ifo (Business Climate|Current Conditions|Expectations)$/i, (m) => `Индекс деловых настроений Ifo (Германия): ${/climate/i.test(m[1]) ? "общий" : /current/i.test(m[1]) ? "текущая оценка" : "ожидания"}`, "Опрос примерно 9 тыс. немецких компаний о текущем положении и ожиданиях. Главный опережающий индикатор крупнейшей экономики еврозоны.", "Выше прогноза — евро и акции Германии растут; ниже — давление на них.", ["eur", "stocks"], { category: "manufacturing" });
R("zew", /^ZEW (Economic Sentiment Index|Current Conditions)$/i, (m) => `Индекс ZEW (Германия): ${/sentiment/i.test(m[1]) ? "ожидания экономики" : "текущая ситуация"}`, "Опрос финансовых аналитиков и инвесторов: чего они ждут от экономики Германии в ближайшие 6 месяцев.", "Выше прогноза — оптимизм, поддержка евро и акций Германии; ниже — давление.", ["eur", "stocks"], { category: "manufacturing" });
R("sentix", /^Sentix Investor Confidence$/i, "Индекс доверия инвесторов Sentix (еврозона)", "Опрос частных и институциональных инвесторов еврозоны о перспективах рынков и экономики.", SENT_AFF, ["eur", "stocks"]);
R("biz.conf", /^(NAB Business Confidence|ANZ Business Confidence|NZIER Business Confidence|CBI Business Optimism Index|CBI Distributive Trades|CBI Industrial Trends Orders|CFIB Business Barometer|KOF Leading Indicators|SACCI Business Confidence|Ai Group (?:Industry|Construction|Manufacturing) Index|NFIB Business Optimism Index|RCM\/TIPP Economic Optimism Index|Business Confidence|Business Climate Indicator|Industrial Confidence|Industrial Sentiment|Services Sentiment|Economic Sentiment|Economic Sentiment Index|Economic Confidence Index|Economic Tendency Indicator|BSI Large Manufacturing|Consumer Confidence Flash)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("nab")) return "Деловое доверие NAB (Австралия)";
  if (k.startsWith("anz business")) return "Деловое доверие ANZ (Новая Зеландия)";
  if (k.startsWith("nzier")) return "Деловое доверие NZIER (Новая Зеландия)";
  if (k.startsWith("cbi business")) return "Индекс делового оптимизма CBI (Великобритания)";
  if (k.startsWith("cbi distributive")) return "Розничная и оптовая торговля CBI (Великобритания)";
  if (k.startsWith("cbi industrial")) return "Промышленные тенденции CBI: заказы (Великобритания)";
  if (k.startsWith("cfib")) return "Барометр малого бизнеса CFIB (Канада)";
  if (k.startsWith("kof")) return "Опережающий индикатор KOF (Швейцария)";
  if (k.startsWith("sacci")) return "Деловое доверие SACCI (ЮАР)";
  if (k.startsWith("ai group")) return `Индекс Ai Group (Австралия): ${k.includes("construction") ? "строительство" : k.includes("manufacturing") ? "промышленность" : "отрасли"}`;
  if (k.startsWith("nfib")) return "Индекс оптимизма малого бизнеса NFIB (США)";
  if (k.startsWith("rcm")) return "Индекс экономического оптимизма RCM/TIPP (США)";
  if (k.startsWith("business climate")) return "Индикатор делового климата";
  if (k.startsWith("industrial conf")) return "Доверие в промышленности";
  if (k.startsWith("industrial sent")) return "Настроения в промышленности";
  if (k.startsWith("services")) return "Настроения в сфере услуг";
  if (k.startsWith("economic sentiment")) return "Индекс экономических настроений (ESI)";
  if (k.startsWith("economic conf")) return "Индекс экономического доверия";
  if (k.startsWith("economic tend")) return "Индикатор экономических тенденций";
  if (k.startsWith("bsi")) return "Индекс деловых настроений BSI (производители)";
  if (k.startsWith("consumer")) return "Доверие потребителей";
  return "Деловое доверие";
}, "Опрос руководителей компаний о текущих условиях и ожиданиях. Помогает предсказать динамику инвестиций, найма и роста экономики.", SENT_AFF, ["ccy", "stocks"], { category: "manufacturing" });
/* WASDE: the same glossary entry serves TradingView's "WASDE Report" and the official layer (lib/calendar/commodities.ts, category "commodity") */
R("agro.wasde", /^(?:USDA )?WASDE Report$/i, "Отчёт USDA WASDE (мировой баланс зерна и масличных)", "Ежемесячный отчёт Минсельхоза США: прогноз производства, потребления, экспорта и запасов пшеницы, кукурузы, сои, риса, хлопка, сахара и мяса в США и в мире. Выходит около 10-го числа в 12:00 по Нью-Йорку, вместе с Crop Production.", "Запасы и урожай ниже ожиданий — зерно, соя и хлопок дорожают, выше — дешевеют. Самое сильное событие для аграрных фьючерсов: рывок цены в первые минуты после выхода.", ["wheat", "corn", "soy", "cotton", "sugar", "usd"], { category: "other", noMods: true });
R("misc.lmi", /^(LMI Logistics Managers Index|Global Dairy Trade Price Index|NOPA Crush Report|Quarterly Grain Stocks - (?:Corn|Soy|Wheat)|Auto Sales|Car Sales|Motorbike Sales|Passenger Vehicles Sales|Total Vehicle Sales|Total New Vehicle Sales|Vehicle Sales|New Car Registrations|New Car Sales|New Motor Vehicle Sales|Used Car Prices|Redbook)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("lmi")) return "Индекс менеджеров по логистике (LMI)";
  if (k.startsWith("global dairy")) return "Аукцион молочной продукции Global Dairy Trade (индекс цен)";
  if (k.startsWith("nopa")) return "Отчёт NOPA о переработке сои (США)";
  if (k.startsWith("quarterly grain")) return `Квартальные запасы зерна США: ${k.includes("corn") ? "кукуруза" : k.includes("soy") ? "соя" : "пшеница"}`;
  if (k.startsWith("auto exports")) return "Экспорт автомобилей";
  if (k.startsWith("motorbike")) return "Продажи мотоциклов";
  if (k.startsWith("passenger")) return "Продажи легковых автомобилей";
  if (k.startsWith("new car reg")) return "Регистрации новых автомобилей";
  if (k.startsWith("redbook")) return "Продажи розничных сетей США (Redbook)";
  if (k.startsWith("used")) return "Цены на подержанные автомобили";
  return "Продажи автомобилей";
}, "Отраслевой показатель: спрос, запасы или цены в конкретной отрасли.", "Влияет в основном на соответствующую отрасль и сырьевые рынки; для широкого рынка эффект умеренный.", ["ccy"], { category: "other" });

/* ───────────────────────── consumers ───────────────────────── */

R("retail.core", /^(Retail Sales Control Group|Retail Sales Ex Autos|Retail Sales ex Fuel|Retail Sales Ex Gas\/Autos)$/i, (m) => (/control/i.test(m[1]) ? "Розничные продажи: контрольная группа (США)" : /fuel/i.test(m[1]) ? "Розничные продажи без топлива" : /gas/i.test(m[1]) ? "Розничные продажи без бензина и автомобилей" : "Розничные продажи без автомобилей"), "Расходы потребителей в магазинах за вычетом самых волатильных статей — автомобилей и топлива. Лучше показывает реальный спрос.", "Выше прогноза — потребитель сильный, валюта страны и акции розницы растут, ожидания жёсткой политики усиливаются. Ниже — давление.", ["ccy", "stocks"], { category: "consumer" });
R("retail", /^Retail Sales$/i, "Розничные продажи", "Расходы потребителей в магазинах — главный показатель потребительского спроса, а потребление составляет большую часть экономики.", "Выше прогноза — потребитель сильный: валюта страны крепнет, акции растут, облигации слабеют на ожиданиях жёсткой политики. Ниже — давление.", ["ccy", "stocks", "bonds"]);
R("retail.monitor", /^(BRC Retail Sales Monitor|Electronic Retail Card Spending|Credit Card Spending)$/i, (m) => (/brc/i.test(m[1]) ? "Монитор розничных продаж BRC (Великобритания)" : /electronic/i.test(m[1]) ? "Расходы по картам в рознице" : "Расходы по кредитным картам"), "Оперативные данные о расходах покупателей, которые выходят раньше официальной статистики.", "Выше прогноза — спрос растёт, поддержка валюты страны; ниже — давление.", ["ccy"], { category: "consumer" });
R("conf.cb", /^(CB Consumer Confidence|Consumer Confidence|GfK Consumer Confidence|Westpac Consumer Confidence(?: Index| Change)?|ANZ Roy Morgan Consumer Confidence|FGV Consumer Confidence|Composite NZ PCI|Consumer Confidence Final)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("cb")) return "Индекс потребительского доверия Conference Board (США)";
  if (k.startsWith("gfk")) return "Потребительское доверие GfK";
  if (k.startsWith("westpac")) return "Потребительское доверие Westpac (Австралия)";
  if (k.startsWith("anz")) return "Потребительское доверие ANZ–Roy Morgan (Австралия)";
  if (k.startsWith("fgv")) return "Потребительское доверие FGV (Бразилия)";
  if (k.startsWith("composite nz")) return "Индекс потребительских настроений (Новая Зеландия)";
  return "Потребительское доверие";
}, "Опрос домохозяйств: как они оценивают своё финансовое положение и экономику. Уверенные потребители больше тратят, а траты — основа роста.", SENT_AFF, ["ccy", "stocks"], { category: "consumer" });
R("conf.mich", /^Michigan (Consumer Sentiment|Consumer Expectations|Current Conditions)$/i, (m) => `Потребительские настроения Мичигана${/expect/i.test(m[1]) ? ": ожидания" : /current/i.test(m[1]) ? ": текущие условия" : ""}`, "Опрос Мичиганского университета: как американцы оценивают экономику и свои финансы. Вместе с индексом выходят инфляционные ожидания, которые внимательно изучает ФРС.", "Выше прогноза — доллар и акции укрепляются; ниже — давление. Отдельно смотрят инфляционные ожидания.", ["usd", "stocks", "bonds"], { category: "consumer" });
R("income", /^(Personal Income|Personal Spending|Real Personal Spending)$/i, (m) => (/income/i.test(m[1]) ? "Личные доходы населения (США)" : /real/i.test(m[1]) ? "Реальные личные расходы (США)" : "Личные расходы населения (США)"), "Доходы и расходы американских домохозяйств. Выходят вместе с индексом цен PCE — любимым инфляционным показателем ФРС.", "Рост расходов выше прогноза — потребитель сильный, доллар растёт; слабые данные повышают шансы на снижение ставки.", ["usd", "stocks", "bonds"], { category: "consumer" });
R("household", /^(Household Spending|Consumer Credit Change|Consumer Credit|Total Household Debt)$/i, (m) => (/spending/i.test(m[1]) ? "Расходы домохозяйств" : /debt/i.test(m[1]) ? "Общая задолженность домохозяйств" : "Потребительское кредитование"), "Сколько тратят и занимают домохозяйства. Растущие расходы — признак здорового спроса.", "Выше прогноза — спрос сильный, валюта страны укрепляется; ниже — давление.", ["ccy"], { category: "consumer" });
R("tourism", /^(Tourist Arrivals|Visitor Arrivals|Tourism Revenues|Cash Remittances)$/i, (m) => (/tourist|visitor/i.test(m[1]) ? "Число приезжающих туристов" : /revenue/i.test(m[1]) ? "Доходы от туризма" : "Денежные переводы из-за рубежа"), "Приток туристов или денежных переводов — важная статья доходов экономики, особенно для небольших стран.", "Рост поддерживает платёжный баланс и национальную валюту.", ["ccy"], { category: "consumer" });

/* ───────────────────────── housing ───────────────────────── */

R("hous.starts", /^Housing Starts$/i, "Начатое жилищное строительство", "Сколько новых домов начали строить за месяц. Строительство чувствительно к ставкам и показывает здоровье рынка жилья.", "Выше прогноза — признак подъёма: валюта страны и акции строителей растут. Ниже — давление.", ["ccy", "stocks"]);
R("hous.permits", /^(Building Permits|Private House Approvals)$/i, (m) => (/permits/i.test(m[1]) ? "Разрешения на строительство" : "Разрешения на частное жилищное строительство"), "Сколько разрешений на новое строительство выдано. Опережает фактические стройки на 1–2 месяца.", "Выше прогноза — признак подъёма жилищного рынка, поддержка валюты и акций строителей.", ["ccy", "stocks"]);
R("hous.sales", /^(Existing Home Sales|New Home Sales|Pending Home Sales)$/i, (m) => (/existing/i.test(m[1]) ? "Продажи домов на вторичном рынке" : /new/i.test(m[1]) ? "Продажи новых домов" : "Незавершённые продажи домов (контракты)"), "Сколько жилья куплено (или законтрактовано) за месяц. Показывает, как рынок недвижимости реагирует на ставки по ипотеке.", "Выше прогноза — спрос сильный: доллар и акции строителей растут. Ниже — давление, особенно если ставки по ипотеке высокие.", ["usd", "stocks"], { category: "housing" });
R("hous.nahb", /^NAHB Housing Market Index$/i, "Индекс настроений строителей жилья (NAHB)", "Опрос американских строителей: оценка продаж новых домов сейчас и в ближайшие 6 месяцев. Выше 50 — преобладает оптимизм.", "Выше прогноза — поддержка доллара и акций строителей; ниже — давление.", ["usd", "stocks"]);
R("hous.mba", /^MBA (30-Year Mortgage Rate|Mortgage Applications|Mortgage Market Index|Mortgage Refinance Index|Purchase Index)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("30")) return "Ставка по 30-летней ипотеке (MBA)";
  if (k.includes("refinance")) return "Индекс заявок на рефинансирование ипотеки (MBA)";
  if (k.includes("purchase")) return "Индекс заявок на покупку жилья в ипотеку (MBA)";
  if (k.includes("market")) return "Индекс рынка ипотеки (MBA)";
  return "Заявки на ипотеку (MBA)";
}, "Еженедельный опрос Ассоциации ипотечных банкиров США: сколько заявок на ипотеку и по какой ставке. Ставки по ипотеке следуют за доходностью 10-летних облигаций США.", "Рост ставки — давление на рынок жилья и акции строителей; рост заявок — спрос на жильё крепнет.", ["usd", "bonds"], { category: "housing" });
R("hous.rate", /^(15|30)-Year Mortgage Rate$|^BBA Mortgage Rate$/i, (m) => (m[1] ? `Ставка по ${m[1]}-летней ипотеке (Freddie Mac)` : "Ставка по ипотеке (BBA)"), "Средняя ставка по ипотеке. Следует за доходностью облигаций и определяет доступность жилья.", "Рост ставок охлаждает рынок жилья и давит на акции строителей; снижение — поддерживает.", ["usd", "bonds"], { category: "housing" });
R("hous.price", /^(S&P\/Case-Shiller Home Price|House Price Index|Lloyds House Price Index|Nationwide Housing Prices|RICS House Price Balance|Residential Property Prices|Real Estate Price Index|Cotality Dwelling Prices|New Housing Price Index|URA Property Index)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("s&p")) return "Цены на жильё (S&P/Case-Shiller, США)";
  if (k.startsWith("lloyds")) return "Цены на жильё по данным Lloyds (Великобритания)";
  if (k.startsWith("nationwide")) return "Цены на жильё по данным Nationwide (Великобритания)";
  if (k.startsWith("rics")) return "Баланс оценок цен на жильё RICS (Великобритания)";
  if (k.startsWith("cotality")) return "Цены на жильё (Cotality, Австралия)";
  if (k.startsWith("new housing")) return "Цены на новое жильё";
  if (k.startsWith("ura")) return "Индекс цен недвижимости URA (Сингапур)";
  if (k.startsWith("residential")) return "Цены на жилую недвижимость";
  if (k.startsWith("real estate")) return "Индекс цен на недвижимость";
  return "Индекс цен на жильё";
}, "Как меняются цены на дома и квартиры. Недвижимость — главное богатство домохозяйств, поэтому цены влияют и на потребление.", "Быстрый рост цен подталкивает инфляцию и ожидания высоких ставок; падение — признак охлаждения и давление на банки и строителей.", ["ccy", "stocks"], { category: "housing" });
R("hous.mort", /^(Mortgage Approvals|Mortgage Lending|Housing Credit)$/i, (m) => (/approvals/i.test(m[1]) ? "Одобренные ипотечные кредиты" : /lending/i.test(m[1]) ? "Объём ипотечного кредитования" : "Кредиты на жильё"), "Сколько ипотечных кредитов выдано или одобрено — прямой индикатор спроса на жильё.", "Выше прогноза — рынок жилья сильный: валюта страны поддерживается; ниже — давление.", ["ccy"], { category: "housing" });
R("constr", /^(Construction Spending|Construction PMI|S&P Global Construction PMI)$/i, (m) => (/pmi/i.test(m[1]) ? "Индекс деловой активности в строительстве (PMI)" : "Расходы на строительство"), "Объём работ в строительной отрасли — часть экономики, сильно зависящая от ставок.", "Выше прогноза — подъём, поддержка валюты и акций; ниже — давление.", ["ccy", "stocks"], { category: "housing" });

/* ───────────────────────── trade, capital flows, fiscal ───────────────────────── */

R("trade.bal", /^(Balance of Trade|Trade Balance|Goods Trade Balance|Goods Trade Balance Non-EU|Balance of Trade Yuan|Current Account|Current Account s\.a)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("current")) return "Баланс текущего счёта";
  if (k.includes("non-eu")) return "Торговый баланс товаров (вне ЕС)";
  if (k.startsWith("goods")) return "Торговый баланс товаров";
  if (k.includes("yuan")) return "Торговый баланс (в юанях)";
  return "Торговый баланс";
}, "Разница между экспортом и импортом (текущий счёт — ещё и доходы, переводы). Профицит означает приток валюты в страну, дефицит — отток.", "Профицит выше прогноза поддерживает национальную валюту, дефицит — давит. Для стран-экспортёров нефти важны цены на сырьё.", ["ccy"]);
R("trade.flows", /^(Exports|Imports|Non-Oil Exports|Auto Exports)$/i, (m) => (/non-oil/i.test(m[1]) ? "Экспорт без нефти" : /auto/i.test(m[1]) ? "Экспорт автомобилей" : /exports/i.test(m[1]) ? "Экспорт" : "Импорт"), "Стоимость товаров, которые страна продала за границу (экспорт) или купила (импорт). Показывает внешний спрос и внутреннее потребление.", "Рост экспорта выше прогноза поддерживает валюту страны; рост импорта показывает сильный внутренний спрос, но давит на торговый баланс.", ["ccy"], { category: "trade" });
R("fx.res", /^Foreign Exchange Reserves$/i, "Валютные резервы", "Запасы иностранной валюты и золота у центробанка. Позволяют поддерживать курс национальной валюты и гасить внешние долги.", "Рост резервов — устойчивость валюты; быстрое падение — признак интервенций и давления на курс. Для РФ резервы важны в связке с курсом рубля.", ["ccy", "gold"]);
R("tic", /^(Net Long-term TIC Flows|Foreign Bond Investment|Foreign Securities Purchases(?: by Canadians)?|Stock Investment by Foreigners|Overall Net Capital Flows|Foreign Direct Investment|FDI)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.includes("tic")) return "Чистый приток долгосрочного капитала в США (TIC)";
  if (k.startsWith("foreign bond")) return "Иностранные инвестиции в облигации";
  if (k.includes("canadians")) return "Покупки иностранных ценных бумаг канадцами";
  if (k.startsWith("foreign sec")) return "Покупки иностранных ценных бумаг";
  if (k.startsWith("stock")) return "Покупки акций иностранными инвесторами";
  if (k.startsWith("overall")) return "Чистые потоки капитала";
  return "Прямые иностранные инвестиции";
}, "Сколько иностранного капитала приходит в страну или уходит из неё. Приток поддерживает национальную валюту и рынок облигаций.", "Приток выше прогноза укрепляет валюту страны и поддерживает облигации; отток — давит.", ["ccy", "bonds"], { category: "trade" });
R("debt", /^(External Debt|Central Government Debt|Gross Debt to GDP|Treasury Cash Balance|Public Sector Net Borrowing Ex Banks)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("external")) return "Внешний долг";
  if (k.startsWith("central")) return "Долг центрального правительства";
  if (k.startsWith("gross")) return "Госдолг к ВВП";
  if (k.startsWith("treasury cash")) return "Остатки на счетах Казначейства";
  return "Чистые заимствования госсектора (без банков)";
}, "Состояние государственных финансов: растущий долг и дефицит повышают риски для валюты и облигаций страны.", "Рост долга и заимствований выше прогноза давит на облигации и национальную валюту; сокращение — поддерживает.", ["ccy", "bonds"], { category: "trade" });
R("budget", /^(Budget Balance|Government Budget Value|Monthly Budget Statement|Fiscal Balance|Nominal Budget Balance|Tax Revenue|Autumn Budget \d{4}|Spring Statement|Budget)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("autumn")) return `Осенний бюджет ${m[1].slice(-4)} (Великобритания)`;
  if (k.startsWith("spring")) return "Весеннее заявление по бюджету";
  if (k.startsWith("tax")) return "Налоговые поступления";
  if (k.startsWith("monthly")) return "Ежемесячный отчёт об исполнении бюджета (США)";
  if (k.startsWith("fiscal") || k.startsWith("nominal")) return "Баланс бюджета";
  if (k.startsWith("government")) return "Бюджет правительства: доходы и расходы";
  return "Баланс бюджета";
}, "Разница между доходами и расходами государства. Дефицит финансируется долгом, поэтому влияет на облигации и валюту. Большие бюджетные объявления (например, налоги) двигают рынок.", "Дефицит больше прогноза — давление на облигации и валюту страны; профицит — поддержка.", ["ccy", "bonds"], { category: "trade" });
R("treasury", /^Treasury Refunding (Announcement|Financing Estimates)$/i, (m) => (/announce/i.test(m[1]) ? "Объявление о размещении госдолга США (Treasury Refunding)" : "Оценки заимствований Казначейства США"), "Казначейство США сообщает, сколько и каких облигаций планирует продавать в ближайшие кварталы.", "Рост объёмов длинных облигаций толкает доходности вверх, давит на акции и поддерживает доллар.", ["usd", "bonds", "stocks"], { category: "auction" });

/* ───────────────────────── money and credit ───────────────────────── */

R("money", /^(M2 Money Supply|M3 Money Supply|M4 Money Supply|Money Supply|Monetary Base|Total Social Financing|New Yuan Loans)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("m2")) return "Денежная масса M2";
  if (k.startsWith("m3")) return "Денежная масса M3";
  if (k.startsWith("m4")) return "Денежная масса M4";
  if (k.startsWith("monetary")) return "Денежная база";
  if (k.startsWith("total")) return "Совокупное социальное финансирование (Китай)";
  if (k.startsWith("new yuan")) return "Новые кредиты в юанях (Китай)";
  return "Денежная масса";
}, "Сколько денег и кредитов в экономике. Быстрый рост предвещает ускорение экономики и инфляции; медленный — охлаждение.", "Рост кредитов и денежной массы выше прогноза — поддержка рискованных активов и сырья, но риск инфляции.", ["ccy", "stocks"]);
R("credit", /^(Bank Lending|Bank Loan Growth|Loan Growth|Loans to Companies|Loans to Households|Private Bank Lending|Private Sector Credit|Total Credit|Outstanding Loan Growth|Deposit Growth|Household Lending Growth)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.startsWith("loans to comp")) return "Кредиты компаниям";
  if (k.startsWith("loans to house") || k.startsWith("household")) return "Кредиты населению";
  if (k.startsWith("deposit")) return "Рост банковских депозитов";
  if (k.startsWith("private sector")) return "Кредиты частному сектору";
  if (k.startsWith("private bank")) return "Банковские кредиты частному сектору";
  if (k.startsWith("total")) return "Общий объём кредитов";
  if (k.startsWith("outstanding") || k.includes("growth")) return "Рост банковских кредитов";
  return "Банковское кредитование";
}, "Как растут кредиты банков компаниям и населению, а также депозиты. Показывает спрос на деньги и состояние банковской системы.", "Ускорение кредитования — признак роста экономики и спроса; резкое падение — признак стресса.", ["ccy"]);
R("nz.psi", /^Services NZ PSI$/i, "Индекс сферы услуг Новой Зеландии (PSI)", "Опрос компаний сферы услуг Новой Зеландии: выше 50 — рост активности, ниже 50 — спад.", PMI_AFF, ["nzd", "stocks"], { category: "manufacturing" });

/* ───────────────────────── energy (impact >= 2 is mandatory) ───────────────────────── */

const OIL_AFF_STOCKS = "Рост запасов сырой нефти сильнее прогноза — давление на нефть (Brent, WTI): спрос слабее предложения. Падение запасов — поддержка нефти. Нефть двигает рубль, акции нефтегаза (Лукойл, Роснефть, Exxon) и валюты-экспортёры (USD/CAD, NOK).";
R("oil.eia.crude", /^EIA Crude Oil Stocks Change$/i, "Запасы сырой нефти в США (EIA)", "Недельное изменение коммерческих запасов нефти в США по данным Управления энергетической информации (EIA). Выходит по средам в 17:30 мск. Рост запасов — давление на цену нефти, падение — поддержка.", OIL_AFF_STOCKS, ["oil", "rub", "stocks", "cad", "usd"], { minImpact: 3, category: "energy" });
R("oil.api.crude", /^API Crude Oil Stock Change$/i, "Запасы сырой нефти в США (API)", "Предварительная оценка недельного изменения запасов нефти США от Американского института нефти (API). Выходит во вторник вечером, за сутки до официальных данных EIA.", "Двигает нефть заранее: рост запасов давит на цену, падение поддерживает. Подтверждается или опровергается данными EIA в среду.", ["oil", "rub", "stocks", "cad"], { minImpact: 2, category: "energy" });
R("oil.eia.gasoline", /^EIA Gasoline Stocks Change$/i, "Запасы бензина в США (EIA)", "Недельное изменение запасов автомобильного бензина в США. Показывает спрос на топливо — особенно в летний сезон поездок.", "Падение запасов — сильный спрос на топливо, поддержка нефти и нефтепереработчиков; рост — давление на бензин и нефть.", ["oil", "stocks", "rub"], { minImpact: 2, category: "energy" });
R("oil.eia.distillate", /^EIA Distillate Stocks Change$/i, "Запасы дистиллятов в США (EIA)", "Недельное изменение запасов дизельного топлива и печного мазута в США. Отражает спрос промышленности и грузоперевозок.", "Падение запасов поддерживает цены на дизель и нефть; рост — давит.", ["oil", "stocks", "rub"], { minImpact: 2, category: "energy" });
R("oil.eia.cushing", /^EIA Cushing Crude Oil Stocks Change$/i, "Запасы нефти в Кушинге (EIA)", "Недельное изменение запасов нефти в хранилищах Кушинга (Оклахома) — точке поставки фьючерсов WTI.", "Рост запасов в Кушинге давит на WTI, падение — поддерживает: цена фьючерса напрямую зависит от наличия нефти в хранилище.", ["oil", "rub", "cad"], { minImpact: 2, category: "energy" });
R("oil.eia.imports", /^EIA Crude Oil Imports Change$/i, "Импорт сырой нефти в США (EIA)", "Недельное изменение объёма нефти, которую США завозят из-за рубежа.", "Рост импорта — увеличивает предложение и давит на запасы и цену; падение — поддерживает WTI.", ["oil", "rub"], { minImpact: 2, category: "energy" });
R("oil.eia.refinery", /^EIA (Refinery Crude Runs|Distillate Fuel Production|Gasoline Production) Change$/i, (m) => (/refinery/i.test(m[1]) ? "Переработка нефти на заводах США (EIA)" : /distillate/i.test(m[1]) ? "Производство дистиллятов в США (EIA)" : "Производство бензина в США (EIA)"), "Недельные данные об уровне загрузки нефтеперерабатывающих заводов и выпуске топлива в США.", "Высокая переработка — заводы много покупают нефти, это поддерживает цену сырой нефти; снижение — ослабляет спрос на нефть.", ["oil", "stocks"], { minImpact: 2, category: "energy" });
R("oil.eia.heating", /^EIA Heating Oil Stocks Change$/i, "Запасы печного топлива в США (EIA)", "Недельное изменение запасов мазута для отопления — важно в холодный сезон.", "Падение запасов поддерживает цены на мазут и нефть; рост — давит.", ["oil"], { minImpact: 2, category: "energy" });
R("gas.eia.storage", /^EIA Natural Gas Stocks Change$|^Natural Gas (?:Storage|Stocks|Inventories)(?: Change)?$|^EIA Natural Gas Storage Change$/i, "Запасы природного газа в США (EIA)", "Недельное изменение запасов газа в подземных хранилищах США. Выходит по четвергам. Показывает баланс спроса (отопление, электроэнергия) и предложения.", "Закачка меньше прогноза (или отбор больше) — дефицит, газ дорожает. Закачка больше прогноза — избыток, газ дешевеет. Влияет на Henry Hub, а также на цены газа в Европе и акции газовых компаний (в том числе российских).", ["gas", "stocks", "usd"], { minImpact: 3, category: "energy" });
R("oil.baker", /^Baker Hughes (Oil|Gas|Total) Rigs? Count$/i, (m) => `Число буровых установок в США (Baker Hughes): ${/oil/i.test(m[1]) ? "нефтяные" : /gas/i.test(m[1]) ? "газовые" : "всего"}`, "Еженедельный подсчёт действующих буровых установок в США — опережающий индикатор добычи. Выходит по пятницам вечером.", "Рост числа установок — предвестник роста добычи и давления на нефть/газ в будущем; сокращение — поддержка цен.", ["oil", "gas", "rub", "stocks"], { minImpact: 2, category: "energy", noMods: true });
R("oil.opec", /^OPEC(?:\+)? (?:Monthly )?(?:Oil )?(?:Market )?(?:Report|Meeting|Conference)$|^OPEC(?:\+)? .*$/i, (m) => (/meeting|conference/i.test(m[0]) ? "Заседание ОПЕК+" : /report/i.test(m[0]) ? "Ежемесячный доклад ОПЕК" : "Событие ОПЕК+"), "Решения ОПЕК+ определяют квоты добычи нефти странами-экспортёрами, включая Россию и Саудовскую Аравию. Ежемесячный доклад содержит прогноз спроса и предложения.", "Сокращение добычи — нефть дорожает, рубль и акции нефтегаза растут; рост добычи — давление на цены. Для России решения ОПЕК+ напрямую влияют на бюджет и курс рубля.", ["oil", "rub", "stocks", "cad"], { minImpact: 3, category: "energy" });
R("oil.iea", /^IEA Oil Market Report$/i, "Ежемесячный доклад МЭА по рынку нефти", "Международное энергетическое агентство оценивает мировой спрос, предложение и запасы нефти и публикует прогнозы на ближайший год.", "Повышение прогноза спроса или оценка дефицита — нефть дорожает; прогноз избытка — давит на цену и на рубль.", ["oil", "rub", "stocks"], { minImpact: 2, category: "energy" });
R("oil.eia.steo", /^EIA (?:Short-Term Energy Outlook|STEO)$/i, "Краткосрочный прогноз энергетики США (EIA STEO)", "Ежемесячный прогноз Управления энергетической информации США по добыче, спросу и ценам на нефть и газ.", "Пересмотр прогнозов цены и добычи двигает ожидания по нефти и газу, влияет на рубль и акции нефтегаза.", ["oil", "gas", "rub", "stocks"], { minImpact: 2, category: "energy" });
R("oil.eia.misc", /^EIA .*(?:Crude|Oil|Gasoline|Distillate|Gas|Refinery|Fuel).*$/i, "Данные Управления энергетической информации США (EIA)", "Недельный или месячный показатель рынка нефти, нефтепродуктов или газа в США от EIA.", "Влияет на цены нефти и газа и, через них, на рубль, валюты-экспортёры и акции нефтегазового сектора.", ["oil", "gas", "rub", "stocks"], { minImpact: 2, category: "energy" });
R("oil.api.misc", /^API .*(?:Crude|Oil|Gasoline|Distillate|Cushing).*$/i, "Данные Американского института нефти (API)", "Предварительные недельные данные по запасам нефти и нефтепродуктов США.", "Намекают на данные EIA, которые выходят на следующий день, и двигают нефть.", ["oil", "rub", "stocks"], { minImpact: 2, category: "energy" });
R("oil.cftc", /^CFTC (.+?) Speculative Net Positions$/i, (m) => {
  const a = m[1].toLowerCase();
  const n = a.includes("crude") ? "нефть" : a.includes("gold") ? "золото" : a.includes("natural gas") ? "природный газ" : a.includes("silver") ? "серебро" : a.includes("copper") ? "медь" : a.includes("s&p") ? "S&P 500" : a.includes("nasdaq") ? "Nasdaq" : a.includes("aud") ? "австралийский доллар" : a.includes("eur") ? "евро" : a.includes("gbp") ? "фунт" : a.includes("jpy") ? "иена" : a.includes("cad") ? "канадский доллар" : a.includes("chf") ? "франк" : a.includes("nzd") ? "новозеландский доллар" : a.includes("bitcoin") ? "биткоин" : m[1];
  return `Позиции спекулянтов CFTC: ${n}`;
}, "Еженедельный отчёт Комиссии по товарным фьючерсам США: сколько крупные спекулянты держат длинных и коротких позиций по активу. Показывает настроение «крупных игроков».", "Рост чистых длинных позиций — крупные игроки ждут роста цены; экстремальные значения иногда предшествуют развороту.", ["usd"], { category: "other" });
R("energy.misc", /^(Natural Gas|Crude Oil|Oil|Gasoline|Brent|Urals|Fuel|Gas|Electricity|Coal)\b.*$/i, "Данные рынка энергоносителей", "Показатель рынка нефти, газа или топлива.", "Влияет на цены энергоносителей, рубль, валюты-экспортёры сырья и акции нефтегазового сектора.", ["oil", "gas", "rub", "stocks"], { minImpact: 2, category: "energy" });

/* ───────────────────────── auctions (government debt placements) ───────────────────────── */

const AUCTION_ABOUT = "Государство размещает долговые бумаги и узнаёт, по какой доходности их готов купить рынок. Главное — спрос (bid-to-cover) и доходность относительно прогноза.";
const AUCTION_AFF = "Слабый спрос и более высокая доходность давят на цены облигаций и могут тянуть вверх ставки по всей кривой; сильный спрос — поддерживают облигации и национальную валюту.";
R("auction", /^.*(?:Auction|Gilt|Syndication|\bTender\b).*$/i, (m) => aucTitle(m[0]), AUCTION_ABOUT, AUCTION_AFF, ["ccy", "bonds"], { category: "auction", noMods: true });

const INSTR: [RegExp, string][] = [
  [/TIPS/i, "облигаций с защитой от инфляции США (TIPS)"], [/\bnote\b/i, "нот Казначейства США"], [/Bund\/g|Bund(?!l)/i, "облигаций Германии (Bund)"], [/Bobl/i, "облигаций Германии (Bobl)"],
  [/Schatz/i, "облигаций Германии (Schatz)"], [/Bubill/i, "краткосрочных векселей Германии (Bubill)"], [/DTB/i, "краткосрочных векселей Нидерландов (DTB)"],
  [/BTP/i, "облигаций Италии (BTP)"], [/OAT/i, "облигаций Франции (OAT)"], [/BTF/i, "краткосрочных векселей Франции (BTF)"], [/OLO/i, "облигаций Бельгии (OLO)"],
  [/Obligacion|Bonos/i, "облигаций Испании"], [/Letras/i, "векселей Испании (Letras)"], [/JGB/i, "облигаций Японии (JGB)"], [/KTB/i, "облигаций Кореи (KTB)"], [/RFGB/i, "облигаций Финляндии (RFGB)"],
  [/RAGB/i, "облигаций Австрии (RAGB)"], [/SGB/i, "облигаций Швеции (SGB)"], [/DGB/i, "облигаций Дании (DGB)"], [/NGB/i, "облигаций Норвегии (NGB)"], [/GGB/i, "облигаций Греции (GGB)"],
  [/NTB/i, "казначейских векселей Норвегии (NTB)"], [/ATB/i, "казначейских векселей Австралии (ATB)"], [/EU-Bonds/i, "облигаций ЕС"], [/RFTB/i, "векселей Таиланда (RFTB)"], [/BOT/i, "векселей Таиланда (BOT)"],
  [/FRN/i, "облигаций с плавающей ставкой (FRN)"], [/Gilt/i, "гособлигаций Великобритании (Gilt)"], [/T-Bill|Bill/i, "краткосрочных казначейских векселей"], [/Bond/i, "государственных облигаций"],
];
function tenorRu(n: number, unit: string): string {
  const u = unit.toLowerCase();
  const f = (a: string, b: string, c: string) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
  return u.startsWith("year") ? `${n}-${f("летних", "летних", "летних")}` : u.startsWith("month") ? `${n}-месячных` : u.startsWith("week") ? `${n}-недельных` : `${n}-дневных`;
}
function aucTitle(name: string): string {
  const t = /(\d+(?:\/\d+)*)[- ]?(Year|Month|Week|Day)/i.exec(name);
  const inst = INSTR.find(([re]) => re.test(name))?.[1] ?? "государственных облигаций";
  const mat = /\b(20\d{2})\b/.exec(name);
  if (/gilt|tender|syndication/i.test(name) && !t) return mat ? `Размещение гилтов ${mat[1]} (гособлигации Великобритании)` : "Размещение гилтов (гособлигации Великобритании)";
  if (t) {
    const bill = /bill|bubill|btf|dtb|letras|bot|rftb|ntb/i.test(name);
    const nums = t[1].split("/");
    const ten = nums.length > 1 ? `${nums.join("/")}-${t[2].toLowerCase() === "year" ? "летних" : "срочных"}` : tenorRu(+nums[0], t[2]);
    return `Аукцион ${ten} ${bill && t[2].toLowerCase() !== "year" ? inst.replace(/^краткосрочных /, "") : inst}`;
  }
  if (mat) return `Аукцион ${inst} со сроком погашения ${mat[1]}`;
  return `Аукцион ${inst}`;
}

/* ───────────────────────── politics and other scheduled events ───────────────────────── */

R("pol.elections", /^(?:Snap )?(General|Legislative|Parliamentary|Presidential|Midterm|Local|Regional|Municipal) Elections?$/i, (m) => {
  const k = m[1].toLowerCase();
  const t = k === "general" ? "Всеобщие выборы" : k === "legislative" ? "Выборы в законодательный орган" : k === "parliamentary" ? "Парламентские выборы" : k === "presidential" ? "Президентские выборы" : k === "midterm" ? "Промежуточные выборы в Конгресс США" : k === "local" ? "Местные выборы" : k === "regional" ? "Региональные выборы" : "Муниципальные выборы";
  return /^snap/i.test(m[0]) ? `Внеочередные ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
}, "День голосования. Итоги выборов могут изменить экономическую политику и налоговую нагрузку, поэтому рынки заранее закладывают ожидания.", "Неожиданный результат повышает волатильность национальной валюты, облигаций и акций; для США промежуточные выборы влияют на возможности президента принимать законы.", ["ccy", "stocks"], { category: "other", noMods: true });
R("pol.summit", /^(.*Summit|UN General Assembly|Communist Party .*Plenum|ECOFIN Meeting|Eurogroup Meeting)$/i, (m) => {
  const k = m[1].toLowerCase();
  if (k.includes("trump") && k.includes("xi")) return "Саммит Трамп — Си Цзиньпин";
  if (k.startsWith("brics")) return "Саммит БРИКС";
  if (k.startsWith("un general")) return "Генеральная Ассамблея ООН";
  if (k.startsWith("communist")) return "Пленум ЦК Компартии Китая";
  if (k.startsWith("ecofin")) return "Совет ЕС по экономике и финансам (ЭКОФИН)";
  if (k.startsWith("eurogroup")) return "Заседание Еврогруппы (министры финансов еврозоны)";
  return `Саммит ${m[1].replace(/\s*Summit\s*/i, "").trim()}`.trim();
}, "Политическая или дипломатическая встреча, исход которой может повлиять на торговлю, санкции и экономическую политику.", "Рынки реагируют на заявления: торговые соглашения и смягчение напряжённости поддерживают акции и сырьё, эскалация — наоборот. Для рубля и российских активов важны санкционные новости.", ["stocks", "ccy"], { category: "other", noMods: true });
R("misc.treasury", /^(Early Close Bond Market|Bank Holiday - .*)$/i, (m) => (/early/i.test(m[1]) ? "Сокращённый день на рынке облигаций" : "Банковский выходной"), "Банки или рынки работают по сокращённому графику или закрыты — ликвидность ниже обычной.", "При низкой ликвидности цены могут двигаться резче на небольших объёмах.", ["bonds"], { category: "holiday", noMods: true });

/* ───────────────────────── commodities and agriculture (layer of lib/calendar/commodities.ts; the English names are the layer's own titles) ───────────────────────── */

R("agro.cropprogress", /^USDA Crop Progress$/i, "Отчёт USDA Crop Progress (состояние посевов)", "Еженедельный отчёт Минсельхоза США (по понедельникам в 16:00 по Нью-Йорку, с апреля по ноябрь): доля засеянных и убранных площадей и оценка состояния посевов кукурузы, сои, пшеницы и хлопка.", "Рост доли посевов в хорошем состоянии — урожай будет больше, цены на кукурузу и сою давит вниз; ухудшение (засуха, жара) — цены растут. Особенно важен в июне–августе.", ["corn", "soy", "wheat", "cotton"], { category: "other", noMods: true });
R("agro.exportsales", /^USDA Export Sales$/i, "Экспортные продажи США (USDA Export Sales)", "Еженедельный отчёт Минсельхоза США (обычно по четвергам в 08:30 по Нью-Йорку): сколько зерна, сои, хлопка и мяса продано и отгружено за границу за прошлую неделю.", "Продажи выше ожиданий — признак сильного спроса, поддержка цен на пшеницу, кукурузу, сою и хлопок; слабые продажи давят. Для рынка это второстепенное событие.", ["wheat", "corn", "soy", "cotton"], { category: "other", noMods: true });
R("agro.grainstocks", /^USDA Grain Stocks$/i, "Отчёт USDA Grain Stocks (запасы зерна и сои)", "Квартальный отчёт Статистической службы Минсельхоза США (NASS): сколько кукурузы, сои и пшеницы лежит на фермах и в хранилищах на 1 декабря, 1 марта, 1 июня и 1 сентября. Январский выпуск идёт вместе с итоговой оценкой урожая.", "Запасы ниже ожиданий — зерно и соя дорожают, выше — дешевеют. Возможен резкий скачок цен на CBOT в момент выхода.", ["corn", "soy", "wheat"], { category: "other", noMods: true });
R("agro.plantings", /^USDA Prospective Plantings$/i, "Отчёт USDA Prospective Plantings (планы посевов)", "Мартовский отчёт NASS (Минсельхоз США): опрос фермеров о том, какие площади они собираются засеять кукурузой, соей, пшеницей и хлопком в новом сезоне.", "Площадь под культуру меньше ожиданий — цена растёт (урожай будет меньше), больше — падает. Первый крупный ориентир сезона для кукурузы и сои.", ["corn", "soy", "wheat", "cotton"], { category: "other", noMods: true });
R("agro.acreage", /^USDA Acreage$/i, "Отчёт USDA Acreage (фактические посевные площади)", "Июньский отчёт NASS (Минсельхоз США): фактические посевные площади кукурузы, сои, пшеницы и хлопка по итогам весеннего сева. Уточняет мартовские планы фермеров.", "Площади меньше ожиданий — кукуруза, соя и хлопок дорожают, больше — дешевеют. Выходит вместе с квартальными запасами зерна, поэтому скачки волатильности часты.", ["corn", "soy", "wheat", "cotton"], { category: "other", noMods: true });
R("agro.hogs", /^USDA Hogs and Pigs$/i, "Отчёт USDA Hogs and Pigs (поголовье свиней)", "Квартальный отчёт NASS (Минсельхоз США): поголовье свиней и планы по опоросу в США. Выходит в 15:00 по Нью-Йорку.", "Поголовье меньше ожиданий — свинина и фьючерсы на «постную свинину» (Lean Hogs) дорожают, больше — дешевеют; косвенно влияет на спрос на кукурузу и соевый шрот.", ["cattle", "corn", "soy"], { category: "other", noMods: true });
R("agro.cof", /^USDA Cattle on Feed$/i, "Отчёт USDA Cattle on Feed (скот на откорме)", "Ежемесячный отчёт NASS (Минсельхоз США): сколько голов скота стоит на откормочных площадках, сколько поступило и сколько продано на убой. Выходит в 15:00 по Нью-Йорку.", "Поголовье на откорме меньше ожиданий — фьючерсы на живой скот (Live Cattle, Feeder Cattle) дорожают, больше — дешевеют; также влияет на спрос на кукурузу.", ["cattle", "corn"], { category: "other", noMods: true });
R("agro.coldstorage", /^USDA Cold Storage$/i, "Отчёт USDA Cold Storage (запасы мяса и молочных продуктов)", "Ежемесячный отчёт NASS (Минсельхоз США): запасы говядины, свинины, курятины, сыра и масла в холодильных складах США.", "Рост запасов говядины и свинины — давление на цены мяса и скота, снижение запасов — поддержка. Для широкого рынка влияние небольшое.", ["cattle"], { category: "other", noMods: true });
R("agro.cocoa.grind", /^Cocoa Grindings\b/i, "Какао: квартальное перемалывание какао-бобов", "Квартальная статистика переработки какао-бобов: в Европе (ECA), Северной Америке (NCA, публикует ICE) и Азии (CAA). Показывает спрос производителей шоколада и масла какао.", "Перемалывание выше ожиданий — спрос сильный, какао растёт; ниже — спрос слабый, цена падает. Часто вызывает резкие скачки цены на ICE в день публикации.", ["cocoa"], { category: "other", noMods: true });
R("agro.conab.grains", /^CONAB Grain Survey$/i, "Бразилия: оценка урожая зерновых от CONAB", "Ежемесячный обзор бразильского агентства CONAB: прогноз производства, площадей и запасов сои, кукурузы, хлопка, риса и других культур. Бразилия — крупнейший экспортёр сои и один из главных экспортёров кукурузы.", "Прогноз урожая сои или кукурузы выше ожиданий — цены на CBOT снижаются, ниже — растут. Заметно влияет и на реал.", ["soy", "corn", "cotton"], { category: "other", noMods: true });
R("agro.conab.coffee", /^CONAB Coffee Survey$/i, "Бразилия: оценка урожая кофе от CONAB", "Обзор бразильского агентства CONAB: прогноз сбора арабики и робусты в Бразилии — крупнейшем в мире производителе кофе. Выходит четыре раза в год.", "Прогноз урожая выше ожиданий — кофе дешевеет, ниже — дорожает (особенно после заморозков или засухи).", ["coffee"], { category: "other", noMods: true });
R("agro.conab.cane", /^CONAB Sugarcane Survey$/i, "Бразилия: оценка урожая сахарного тростника от CONAB", "Обзор бразильского агентства CONAB: прогноз сбора сахарного тростника, производства сахара и этанола в Бразилии — крупнейшем в мире производителе сахара.", "Прогноз производства сахара выше ожиданий — сахар дешевеет, ниже — дорожает. Влияет и на этанол.", ["sugar"], { category: "other", noMods: true });
R("agro.usda.coffee", /^USDA Coffee: World Markets and Trade$/i, "США: отчёт USDA «Кофе: мировые рынки и торговля»", "Полугодовой отчёт Иностранной сельскохозяйственной службы Минсельхоза США (FAS): прогноз мирового производства, потребления, торговли и запасов кофе на новый сезон.", "Прогноз урожая и запасов выше ожиданий — кофе дешевеет, ниже — дорожает.", ["coffee"], { category: "other", noMods: true });
R("agro.statcan", /^Statistics Canada Crops$/i, "Канада: данные Statistics Canada по зерновым и масличным", "Отчёты канадской статистической службы о посевных площадях, запасах и урожае пшеницы, канолы, ячменя и других культур. Канада — один из крупнейших экспортёров пшеницы и канолы.", "Урожай или площади ниже ожиданий — пшеница и канола дорожают, выше — дешевеют; влияет и на канадский доллар.", ["wheat", "agro", "cad"], { category: "other", noMods: true });
R("agro.mars", /^JRC MARS Bulletin$/i, "ЕС: бюллетень мониторинга посевов JRC MARS", "Ежемесячный бюллетень Объединённого исследовательского центра Еврокомиссии: прогноз урожайности пшеницы, кукурузы, подсолнечника и других культур в странах ЕС на основе погоды и спутников.", "Снижение прогноза урожайности (засуха, жара) поддерживает цены на пшеницу и кукурузу, повышение — давит.", ["wheat", "corn", "eur"], { category: "other", noMods: true });
R("agro.mpob", /^MPOB Palm Oil Data$/i, "Малайзия: данные MPOB по пальмовому маслу", "Ежемесячный отчёт Совета по пальмовому маслу Малайзии (MPOB): производство, экспорт, импорт и запасы пальмового масла. Выходит около 10-го числа в 12:30 по малайзийскому времени.", "Запасы выше ожиданий — пальмовое масло дешевеет, ниже — дорожает; следом реагируют соевое масло и малайзийский ринггит.", ["palm", "soy"], { category: "other", noMods: true });
R("agro.palm.cargo", /^Palm Oil Exports by Surveyors$/i, "Малайзия: экспорт пальмового масла по данным сюрвейеров", "Предварительные данные независимых сюрвейеров об экспорте пальмового масла из Малайзии с начала месяца: обычно 10-го, 15-го, 20-го и 25-го числа. Официального календаря нет.", "Экспорт выше прошлого месяца — спрос сильный, цена на пальмовое масло растёт; слабее — давит. Оценка предварительная.", ["palm"], { category: "other", noMods: true });

/* ───────────────────────── corporate events of Russian issuers (layer of lib/calendar/corporate.ts) ─────────────────────────
   The layer builds its events already titled, keyed (gk) and tagged, so the regexes below never see a real feed name: they are
   placeholders that only keep the rule table and the lookup by key (glossaryText / glossaryBrief) in one place. */

R("corp.div", /^Corporate Dividends \(MOEX\)$/i, "Дивиденды", "Выплата части прибыли акционерам. Право на дивиденд получают те, кто числится в реестре на дату его закрытия; из-за расчётов Т+1 купить акцию нужно не позже последнего дня покупки, а уже на следующий торговый день она торгуется «без дивиденда» (экс-дивидендная дата). Размер и доходность — по данным T-Invest API; решения советов директоров и даты могут уточняться.", "Накануне отсечки спрос на бумагу растёт, после неё цена обычно проседает примерно на размер дивиденда (гэп вниз), затем нередко частично отыгрывается. Дивидендные гэпы тяжёлых бумаг (Сбербанк, Газпром, Лукойл) заметно двигают индекс МосБиржи и фьючерс на него.", ["div", "stocks", "rub"], { category: "other", noMods: true });
R("corp.coupon", /^Corporate Bond Coupons \(MOEX\)$/i, "Купоны облигаций", "Периодическая выплата процентов по облигации. Дата — день выплаты купона держателям; размер — рублей на одну облигацию. Облигаций много, поэтому выплаты одного дня объединены в одну строку, полный список — в описании. Данные — T-Invest API по ОФЗ и самым ликвидным корпоративным выпускам.", "Для держателя это поступление денег и повод реинвестировать. На цену облигации выплата почти не влияет: накопленный купонный доход (НКД) после выплаты обнуляется, а чистая цена остаётся прежней.", ["coupon", "bonds", "rub"], { category: "other", noMods: true });
R("corp.report", /^Corporate Earnings Report \(MOEX\)$/i, "Отчётность компании", "Дата публикации финансовой отчётности эмитента за период (квартал, полугодие или год) по данным T-Invest API. Какой стандарт — МСФО или РСБУ — источник не указывает; даты могут сдвигаться, сверяйтесь с сайтом компании.", "Прибыль, выручка и долг лучше ожиданий рынка — акция растёт, хуже — падает; реакция часто приходит гэпом. У дивидендных бумаг отчётность задаёт и размер будущих выплат, поэтому внимание к ней выше.", ["earnings", "stocks", "rub"], { category: "other", noMods: true });
