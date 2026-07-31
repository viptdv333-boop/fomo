import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const BASE = "https://fomo.spot";

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/feed", priority: 0.9, changeFrequency: "hourly" },
  { path: "/authors", priority: 0.7, changeFrequency: "daily" },
  { path: "/channels", priority: 0.7, changeFrequency: "daily" },
  { path: "/instruments", priority: 0.7, changeFrequency: "daily" },
  { path: "/terminal", priority: 0.6, changeFrequency: "daily" },
  { path: "/chat", priority: 0.5, changeFrequency: "weekly" },
  // Knowledge base: answers the "how do I sell forecasts" queries and carries
  // FAQPage markup, so it earns a high priority despite rarely changing.
  { path: "/help", priority: 0.8, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    // Home is emitted without a trailing slash so it matches the canonical
    // Next renders from metadataBase ("https://fomo.spot").
    url: r.path === "/" ? BASE : `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

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
      entries.push({
        url: `${BASE}/ideas/${idea.id}`,
        lastModified: idea.updatedAt ?? now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    for (const a of assets) {
      entries.push({
        url: `${BASE}/instruments/${a.slug}`,
        lastModified: a.createdAt ?? now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
      entries.push({
        url: `${BASE}/feed/${a.slug}`,
        lastModified: a.createdAt ?? now,
        changeFrequency: "daily",
        priority: 0.5,
      });
    }
    for (const u of authors) {
      if (!u.fomoId) continue;
      entries.push({
        url: `${BASE}/authors/${u.fomoId}`,
        lastModified: u.updatedAt ?? now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch (err) {
    console.error("[sitemap] DB query failed, returning static routes only", err);
  }

  return entries;
}
