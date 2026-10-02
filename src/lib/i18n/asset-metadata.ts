import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getT } from "./server";
import { seoAlternates } from "./locale-url";
import { ogLocales } from "./seo-metadata";
import { assetName } from "./asset-names";

// Per-asset pages need their own canonical: inheriting the section's
// (/instruments, /feed) marked every asset page as a duplicate of the list.
export async function assetMetadata(kind: "instrument" | "feed", slug: string): Promise<Metadata> {
  const { locale, t } = await getT();
  const path = kind === "instrument" ? `/instruments/${slug}` : `/feed/${slug}`;
  const asset = await prisma.asset
    .findUnique({ where: { slug }, select: { slug: true, name: true, instruments: { select: { ticker: true }, take: 1 } } })
    .catch(() => null);
  if (!asset) return { alternates: seoAlternates(locale, path), robots: { index: false } };

  const ticker = asset.instruments[0]?.ticker;
  // Asset names are stored in Russian; en/zh pages use the translated name (ticker when there is none).
  const base = assetName(asset, locale);
  const name = locale === "ru" || !ticker || base === ticker ? base : `${base} (${ticker})`;
  const title = t(`seo.${kind}Page.title`, { name });
  const description = t(`seo.${kind}Page.description`, { name });
  const alternates = seoAlternates(locale, path);
  return { title, description, alternates, openGraph: { title, description, url: alternates.canonical, ...ogLocales(locale) } };
}

export async function categoryMetadata(slug: string): Promise<Metadata> {
  const { locale, t } = await getT();
  const path = `/instruments/category/${slug}`;
  const cat = await prisma.instrumentCategory.findUnique({ where: { slug }, select: { name: true } }).catch(() => null);
  if (!cat) return { alternates: seoAlternates(locale, path), robots: { index: false } };
  const translated = t(`cat.${slug}`);
  const name = translated === `cat.${slug}` ? cat.name : translated;
  const title = t("seo.categoryPage.title", { name });
  const description = t("seo.categoryPage.description", { name });
  const alternates = seoAlternates(locale, path);
  return { title, description, alternates, openGraph: { title, description, url: alternates.canonical, ...ogLocales(locale) } };
}
