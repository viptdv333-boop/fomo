import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getHiddenPages } from "@/lib/hidden-pages";
import { HREFLANG, LOCALES } from "@/lib/i18n/locale-url";
import { absoluteUrl } from "@/lib/i18n/seo-metadata";
import { isTerminalSite } from "@/lib/site-mode";
import { TERMINAL_STATIC_LASTMOD } from "@/lib/terminal-seo";

// Protocol cap per sitemap file. Every page is emitted in 3 languages, so
// pages are added in whole groups and dropped (lowest priority last) once full.
const MAX_URLS = 50000;

type Entry = MetadataRoute.Sitemap[number];

/**
 * One entry per language (ru at the root, /en/..., /zh/...) for a path given
 * without locale prefix, each carrying the full hreflang set incl. x-default.
 * Home has no trailing slash, matching the canonical Next renders.
 */
function localizedEntries(path: string, rest: Omit<Entry, "url" | "alternates">): Entry[] {
  const languages = {
    [HREFLANG.ru]: absoluteUrl("ru", path),
    [HREFLANG.en]: absoluteUrl("en", path),
    [HREFLANG.cn]: absoluteUrl("cn", path),
    "x-default": absoluteUrl("ru", path),
  };
  return LOCALES.map((l) => ({ url: absoluteUrl(l, path), ...rest, alternates: { languages } }));
}

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/feed", priority: 0.9, changeFrequency: "hourly" },
  { path: "/authors", priority: 0.7, changeFrequency: "daily" },
  { path: "/channels", priority: 0.7, changeFrequency: "daily" },
  { path: "/instruments", priority: 0.7, changeFrequency: "daily" },
  { path: "/terminal", priority: 0.7, changeFrequency: "daily" },
  { path: "/terminal/features", priority: 0.7, changeFrequency: "weekly" },
  { path: "/calendar", priority: 0.7, changeFrequency: "daily" },
  { path: "/chat", priority: 0.5, changeFrequency: "weekly" },
  // Knowledge base: answers the "how do I sell forecasts" queries and carries
  // FAQPage markup, so it earns a high priority despite rarely changing.
  { path: "/help", priority: 0.8, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

// terminal.fomo.spot: the public pages of the terminal site only (no ideas, authors, instruments, no database queries).
// `static`: lastmod is the date of the last copy change (TERMINAL_STATIC_LASTMOD), not "now"; the live pages (chart, calendar) change daily.
const TERMINAL_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; static?: boolean }[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly", static: true },
  { path: "/terminal", priority: 0.9, changeFrequency: "daily" },
  { path: "/terminal/features", priority: 0.7, changeFrequency: "weekly", static: true },
  { path: "/calendar", priority: 0.8, changeFrequency: "daily" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly", static: true },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly", static: true },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  if (isTerminalSite()) {
    const staticDate = new Date(TERMINAL_STATIC_LASTMOD);
    return TERMINAL_ROUTES.flatMap((r) => localizedEntries(r.path, { lastModified: r.static ? staticDate : now, changeFrequency: r.changeFrequency, priority: r.priority }));
  }
  const hidden = await getHiddenPages();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.filter((r) => !hidden.includes(r.path.slice(1).split("/")[0])).flatMap((r) =>
    localizedEntries(r.path, {
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    }),
  );
  const add = (path: string, rest: Omit<Entry, "url" | "alternates">) => {
    if (entries.length + LOCALES.length > MAX_URLS) return;
    entries.push(...localizedEntries(path, rest));
  };
  // Pages whose text is user-written Russian: only the ru URL is indexed (en/zh are noindex), so only it is listed.
  const addRuOnly = (path: string, rest: Omit<Entry, "url" | "alternates">) => {
    if (entries.length + 1 > MAX_URLS) return;
    entries.push({ url: absoluteUrl("ru", path), ...rest });
  };

  // Dynamic content — fail-soft so the sitemap still serves if DB is unreachable
  try {
    const [ideas, assets, authors] = await Promise.all([
      prisma.idea.findMany({
        where: { moderationStatus: "published" },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
      prisma.asset.findMany({
        select: { slug: true, createdAt: true },
        take: 5000,
      }),
      prisma.user.findMany({
        where: { fomoId: { not: null }, status: "APPROVED" },
        select: { fomoId: true, updatedAt: true },
        take: 5000,
      }),
    ]);

    for (const idea of ideas) {
      addRuOnly(`/ideas/${idea.id}`, {
        lastModified: idea.updatedAt ?? now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    for (const u of authors) {
      if (!u.fomoId) continue;
      addRuOnly(`/authors/${u.fomoId}`, {
        lastModified: u.updatedAt ?? now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
    for (const a of assets) {
      add(`/instruments/${a.slug}`, {
        lastModified: a.createdAt ?? now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
    for (const a of assets) {
      add(`/feed/${a.slug}`, {
        lastModified: a.createdAt ?? now,
        changeFrequency: "daily",
        priority: 0.5,
      });
    }
  } catch (err) {
    console.error("[sitemap] DB query failed, returning static routes only", err);
  }

  return entries;
}
