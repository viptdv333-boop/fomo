import { NextRequest, NextResponse } from "next/server";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

// ─── RSS feeds by category ───
const FEEDS_BY_CATEGORY: Record<string, { url: string; source: string }[]> = {
  crypto: [
    // Биржи
    { url: "https://announcements.bybit.com/en/rss/", source: "Bybit" },
    // Free Crypto News API (RSS)
    { url: "https://news.treeofalpha.com/api/news?limit=30", source: "TreeOfAlpha" },
    // Русские крипто
    { url: "https://forklog.com/feed/", source: "ForkLog" },
    { url: "https://ru.cointelegraph.com/rss", source: "CoinTelegraph RU" },
    { url: "https://bits.media/rss2/", source: "Bits.media" },
    { url: "https://www.finam.ru/crypto/rsspoint/", source: "Финам Крипто" },
  ],
  stocks_ru: [
    // MOEX — прямо с биржи
    { url: "https://www.moex.com/export/news.aspx?cat=100", source: "MOEX" },
    // Русские аналитики
    { url: "https://www.finam.ru/analysis/marketnews/rsspoint/", source: "Финам" },
    { url: "https://www.profinance.ru/rss/", source: "ProFinance" },
  ],
  stocks_us: [
    // Nasdaq — прямо с биржи
    { url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", source: "Nasdaq" },
    { url: "https://www.nasdaq.com/feed/rssoutbound?category=Stocks", source: "Nasdaq Stocks" },
    // Аналитики
    { url: "https://www.finam.ru/international/advanced/rsspoint/", source: "Финам" },
    { url: "https://www.profinance.ru/rss/", source: "ProFinance" },
  ],
  commodities: [
    // MOEX товарные
    { url: "https://www.moex.com/export/news.aspx?cat=100", source: "MOEX" },
    { url: "https://www.profinance.ru/rss/", source: "ProFinance" },
    { url: "https://www.finam.ru/analysis/marketnews/rsspoint/", source: "Финам" },
  ],
  general: [
    { url: "https://www.moex.com/export/news.aspx?cat=100", source: "MOEX" },
    { url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets", source: "Nasdaq" },
    { url: "https://www.finam.ru/international/advanced/rsspoint/", source: "Финам" },
    { url: "https://www.profinance.ru/rss/", source: "ProFinance" },
  ],
};

// ─── MOEX ISS: новости по конкретному эмитенту ───
async function fetchMoexEmitentNews(ticker: string): Promise<NewsItem[]> {
  try {
    const url = `https://iss.moex.com/iss/sitenews.json?start=0&limit=10&q=${encodeURIComponent(ticker)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FomoBroker/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const cols = json.sitenews?.columns as string[] | undefined;
    const data = json.sitenews?.data as any[][] | undefined;
    if (!cols || !data) return [];

    const iTitle = cols.indexOf("title");
    const iDate = cols.indexOf("published_at");
    const iId = cols.indexOf("id");

    return data.map((row) => ({
      title: String(row[iTitle] || ""),
      link: `https://www.moex.com/n${row[iId]}`,
      pubDate: String(row[iDate] || ""),
      source: "MOEX",
    })).filter(n => n.title);
  } catch {
    return [];
  }
}

// ─── Free Crypto News API (JSON) ───
async function fetchFreeCryptoNews(keyword?: string): Promise<NewsItem[]> {
  try {
    const q = keyword ? `&q=${encodeURIComponent(keyword)}` : "";
    const url = `https://api.free-crypto-news.com/v1/news?limit=15${q}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FomoBroker/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const articles = json.articles || json.data || json;
    if (!Array.isArray(articles)) return [];
    return articles.slice(0, 15).map((a: any) => ({
      title: a.title || a.headline || "",
      link: a.url || a.link || "",
      pubDate: a.published_at || a.pubDate || a.date || "",
      source: a.source?.name || a.source || "Crypto News",
    })).filter((n: NewsItem) => n.title && n.link);
  } catch {
    return [];
  }
}

// ─── Keywords per asset for filtering ───
const ASSET_KEYWORDS: Record<string, string[]> = {
  bitcoin: ["биткоин", "bitcoin", "btc", "крипт"],
  ethereum: ["эфир", "ethereum", "eth", "эфириум"],
  solana: ["solana", "sol", "солана"],
  xrp: ["xrp", "ripple", "риппл"],
  bnb: ["bnb", "binance", "бинанс"],
  dogecoin: ["doge", "dogecoin", "дож"],
  cardano: ["cardano", "ada", "кардано"],
  avalanche: ["avalanche", "avax", "аваланч"],
  polkadot: ["polkadot", "dot", "полкадот"],
  chainlink: ["chainlink", "link", "чейнлинк"],
  litecoin: ["litecoin", "ltc", "лайткоин"],
  polygon: ["polygon", "matic", "полигон"],
  toncoin: ["toncoin", "ton", "тон"],
  oil: ["нефт", "brent", "wti", "crude", "oil"],
  gold: ["золот", "gold", "драгмет"],
  gas: ["газ", "gas", "природн"],
  silver: ["серебр", "silver"],
  copper: ["медь", "copper"],
  wheat: ["пшениц", "wheat"],
  sberbank: ["сбер", "sber", "сбербанк"],
  gazprom: ["газпром", "gazp"],
  lukoil: ["лукойл", "lukoil", "lkoh"],
  yandex: ["яндекс", "yandex", "ydex"],
  rosneft: ["роснефть", "rosn"],
  "norilsk-nickel": ["норникель", "норильск", "gmkn", "никель"],
  novatek: ["новатэк", "novatek", "nvtk"],
  polyus: ["полюс", "polyus", "plzl"],
  magnit: ["магнит", "magnit", "mgnt"],
  vtb: ["втб", "vtb"],
  tinkoff: ["тинькофф", "тинькоф", "tcsg", "т-банк"],
  mts: ["мтс", "mts", "mtss"],
  aeroflot: ["аэрофлот", "aeroflot", "aflt"],
  alrosa: ["алроса", "alrosa", "alrs"],
  nlmk: ["нлмк", "nlmk"],
  apple: ["apple", "aapl", "эпл"],
  tesla: ["tesla", "tsla", "тесла"],
  nvidia: ["nvidia", "nvda", "нвидиа"],
  microsoft: ["microsoft", "msft", "майкрософт"],
  google: ["google", "goog", "alphabet", "гугл"],
  amazon: ["amazon", "amzn", "амазон"],
  meta: ["meta", "facebook", "мета"],
};

// Ticker mapping for MOEX ISS search
const ASSET_MOEX_TICKER: Record<string, string> = {
  sberbank: "SBER", gazprom: "GAZP", lukoil: "LKOH", yandex: "YDEX",
  rosneft: "ROSN", "norilsk-nickel": "GMKN", novatek: "NVTK",
  polyus: "PLZL", magnit: "MGNT", vtb: "VTBR", tinkoff: "TCSG",
  mts: "MTSS", aeroflot: "AFLT", alrosa: "ALRS", nlmk: "NLMK",
};

// ─── RSS parser ───
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  return (m?.[1] || m?.[2] || "").trim();
}

function parseRSS(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemBlocks = xml.split(/<item[\s>]/);
  for (let i = 1; i < itemBlocks.length && items.length < 30; i++) {
    const block = itemBlocks[i];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    if (title && link) {
      items.push({ title, link, pubDate, source });
    }
  }
  return items;
}

// ─── MOEX XML news parser ───
function parseMoexXml(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const docBlocks = xml.split(/<document[\s>]/);
  for (let i = 1; i < docBlocks.length && items.length < 20; i++) {
    const block = docBlocks[i];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractTag(block, "url");
    const pubDate = extractTag(block, "published_at") || extractTag(block, "date");
    if (title) {
      items.push({
        title,
        link: link || "https://www.moex.com",
        pubDate,
        source: "MOEX",
      });
    }
  }
  // Fallback — try RSS format
  if (items.length === 0) {
    return parseRSS(xml, "MOEX");
  }
  return items;
}

// ─── Cache ───
const cache = new Map<string, { data: NewsItem[]; fetchedAt: number }>();
const CACHE_TTL = 5 * 60_000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "general";
  const slug = searchParams.get("slug") || "";
  const cacheKey = `${category}:${slug}`;

  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  }

  const feeds = FEEDS_BY_CATEGORY[category] || FEEDS_BY_CATEGORY.general;
  const allNews: NewsItem[] = [];

  // Parallel: RSS feeds + MOEX ISS emitent news + Free Crypto News
  const tasks: Promise<void>[] = [];

  // RSS feeds
  for (const { url, source } of feeds) {
    tasks.push(
      (async () => {
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; FomoBroker/1.0)" },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) return;
          const text = await res.text();
          if (source === "MOEX") {
            allNews.push(...parseMoexXml(text));
          } else {
            allNews.push(...parseRSS(text, source));
          }
        } catch { /* skip */ }
      })()
    );
  }

  // MOEX ISS — per-emitent news for RU stocks
  if (category === "stocks_ru" && slug && ASSET_MOEX_TICKER[slug]) {
    tasks.push(
      (async () => {
        const items = await fetchMoexEmitentNews(ASSET_MOEX_TICKER[slug]);
        allNews.push(...items);
      })()
    );
  }

  // Free Crypto News API for crypto
  if (category === "crypto" && slug) {
    tasks.push(
      (async () => {
        const keyword = slug === "bitcoin" ? "BTC" : slug === "ethereum" ? "ETH" : slug.toUpperCase();
        const items = await fetchFreeCryptoNews(keyword);
        allNews.push(...items);
      })()
    );
  }

  await Promise.allSettled(tasks);

  // Deduplicate by title similarity
  const seen = new Set<string>();
  const deduped = allNews.filter(n => {
    const key = n.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date descending
  deduped.sort((a, b) => {
    const da = new Date(a.pubDate).getTime() || 0;
    const db = new Date(b.pubDate).getTime() || 0;
    return db - da;
  });

  // Filter by asset keywords if slug provided
  let filtered = deduped;
  const keywords = slug ? ASSET_KEYWORDS[slug] : null;
  if (keywords && keywords.length > 0) {
    const kw = keywords.map(k => k.toLowerCase());
    const matched = deduped.filter(n => {
      const t = n.title.toLowerCase();
      return kw.some(k => t.includes(k));
    });
    // If found at least 3 relevant — show them, otherwise show all from category
    if (matched.length >= 3) {
      filtered = matched;
    }
  }

  const result = filtered.slice(0, 25);
  cache.set(cacheKey, { data: result, fetchedAt: now });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
