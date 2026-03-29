import { NextRequest, NextResponse } from "next/server";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

// RSS feeds for Russian financial news
const RSS_FEEDS = [
  { url: "https://www.finam.ru/international/advanced/rsspoint/", source: "Финам" },
  { url: "https://www.profinance.ru/rss/", source: "ProFinance" },
];

// Simple XML tag extraction (no dependency needed)
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  return (m?.[1] || m?.[2] || "").trim();
}

function parseRSS(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemBlocks = xml.split(/<item[\s>]/);
  // Skip first block (before first <item>)
  for (let i = 1; i < itemBlocks.length && items.length < 15; i++) {
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

// Cache: { data, fetchedAt }
let cache: { data: NewsItem[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60_000; // 5 minutes

export async function GET(request: NextRequest) {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  }

  const allNews: NewsItem[] = [];

  await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, source }) => {
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

  const result = allNews.slice(0, 20);
  cache = { data: result, fetchedAt: now };

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
