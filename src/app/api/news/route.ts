import { NextRequest, NextResponse } from "next/server";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

// Category-specific RSS feeds
const FEEDS_BY_CATEGORY: Record<string, { url: string; source: string }[]> = {
  crypto: [
    { url: "https://www.finam.ru/crypto/rsspoint/", source: "Финам Крипто" },
    { url: "https://bits.media/rss2/", source: "Bits.media" },
    { url: "https://ru.cointelegraph.com/rss", source: "CoinTelegraph RU" },
    { url: "https://forklog.com/feed/", source: "ForkLog" },
  ],
  stocks_ru: [
    { url: "https://www.finam.ru/analysis/marketnews/rsspoint/", source: "Финам" },
    { url: "https://www.profinance.ru/rss/", source: "ProFinance" },
  ],
  stocks_us: [
    { url: "https://www.finam.ru/international/advanced/rsspoint/", source: "Финам" },
    { url: "https://www.profinance.ru/rss/", source: "ProFinance" },
  ],
  commodities: [
    { url: "https://www.profinance.ru/rss/", source: "ProFinance" },
    { url: "https://www.finam.ru/analysis/marketnews/rsspoint/", source: "Финам" },
  ],
  general: [
    { url: "https://www.finam.ru/international/advanced/rsspoint/", source: "Финам" },
    { url: "https://www.profinance.ru/rss/", source: "ProFinance" },
  ],
};

// Keywords per asset for filtering
const ASSET_KEYWORDS: Record<string, string[]> = {
  bitcoin: ["биткоин", "bitcoin", "btc", "крипт"],
  ethereum: ["эфир", "ethereum", "eth", "эфириум"],
  solana: ["solana", "sol", "солана"],
  xrp: ["xrp", "ripple", "риппл"],
  bnb: ["bnb", "binance", "бинанс"],
  dogecoin: ["doge", "dogecoin", "дож"],
  oil: ["нефт", "brent", "wti", "crude", "oil"],
  gold: ["золот", "gold", "драгмет"],
  gas: ["газ", "gas", "природн"],
  sberbank: ["сбер", "sber"],
  gazprom: ["газпром", "gazp"],
  lukoil: ["лукойл", "lukoil", "lkoh"],
  yandex: ["яндекс", "yandex", "ydex"],
  rosneft: ["роснефть", "rosn"],
  apple: ["apple", "aapl", "эпл"],
  tesla: ["tesla", "tsla", "тесла"],
  nvidia: ["nvidia", "nvda", "нвидиа"],
};

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

// Cache per category+slug
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

  await Promise.allSettled(
    feeds.map(async ({ url, source }) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; FomoBroker/1.0)" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        allNews.push(...parseRSS(xml, source));
      } catch {
        // skip failed feeds
      }
    })
  );

  // Sort by date descending
  allNews.sort((a, b) => {
    const da = new Date(a.pubDate).getTime() || 0;
    const db = new Date(b.pubDate).getTime() || 0;
    return db - da;
  });

  // Filter by asset keywords if slug provided
  let filtered = allNews;
  const keywords = slug ? ASSET_KEYWORDS[slug] : null;
  if (keywords && keywords.length > 0) {
    const kw = keywords.map(k => k.toLowerCase());
    const matched = allNews.filter(n => {
      const t = n.title.toLowerCase();
      return kw.some(k => t.includes(k));
    });
    // If we found at least 3 relevant — show them, otherwise show all from category
    if (matched.length >= 3) {
      filtered = matched;
    }
  }

  const result = filtered.slice(0, 20);
  cache.set(cacheKey, { data: result, fetchedAt: now });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
