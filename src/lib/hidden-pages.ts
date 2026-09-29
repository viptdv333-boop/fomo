import { prisma } from "@/lib/prisma";

// Pages the admin switched off in Admin → Site settings → navigation. The checkbox used to
// hide only the menu link; it now also closes the page itself (404) and drops it from the sitemap.
let cache: { at: number; pages: string[] } | null = null;

export async function getHiddenPages(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.pages;
  try {
    const s = await prisma.siteSettings.findUnique({ where: { id: "singleton" }, select: { hiddenPages: true } });
    cache = { at: Date.now(), pages: s?.hiddenPages ?? [] };
  } catch {
    // DB hiccup: keep the last known answer instead of hiding or exposing pages by accident.
    cache = { at: Date.now(), pages: cache?.pages ?? [] };
  }
  return cache.pages;
}

export async function isPageHidden(slug: string): Promise<boolean> {
  return (await getHiddenPages()).includes(slug);
}
