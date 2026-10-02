import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import AuthorContent from "./AuthorContent";
import { getT } from "@/lib/i18n/server";
import { HTML_LANG, seoAlternates } from "@/lib/i18n/locale-url";
import { absoluteUrl, ogLocales } from "@/lib/i18n/seo-metadata";

type PageProps = { params: Promise<{ fomoId: string }> };

async function fetchAuthor(fomoId: string) {
  try {
    return await prisma.user.findUnique({
      where: { fomoId },
      select: {
        id: true,
        displayName: true,
        fomoId: true,
        bio: true,
        avatarUrl: true,
        rating: true,
        specializations: true,
        workplace: true,
        city: true,
        exchangeExperience: true,
        status: true,
        _count: { select: { ideas: true } },
      },
    });
  } catch {
    return null;
  }
}

function trimText(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trimEnd() + "…";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { fomoId } = await params;
  const user = await fetchAuthor(fomoId);
  const { locale, t } = await getT();
  if (!user || user.status !== "APPROVED") {
    return {
      title: t("seo.author.notFound"),
      robots: { index: false, follow: false },
    };
  }

  // Display names and bios are the author's own text: only the ru URL is indexed, en/zh are noindex.
  const full = seoAlternates(locale, `/authors/${user.fomoId}`);
  const alternates = { canonical: full.canonical };
  const url = alternates.canonical;
  // `name` goes last so a display name containing "{count}" is not substituted.
  const title = t("seo.author.title", { name: user.displayName });
  const bioText = trimText(user.bio, 160);
  const description =
    bioText ||
    t("seo.author.description", {
      count: user._count.ideas,
      rating: Number(user.rating).toFixed(1),
      name: user.displayName,
    });
  const image = user.avatarUrl || "/logo-fomo.png";

  return {
    title,
    description,
    alternates,
    robots: locale === "ru" ? undefined : { index: false, follow: true },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: "FOMO",
      ...ogLocales(locale),
      images: [{ url: image, alt: user.displayName }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [image],
    },
  };
}

export default async function AuthorPage({ params }: PageProps) {
  const { fomoId } = await params;
  const user = await fetchAuthor(fomoId);
  const { locale } = await getT();

  const jsonLd = user && user.status === "APPROVED"
    ? {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        inLanguage: HTML_LANG[locale],
        mainEntity: {
          "@type": "Person",
          name: user.displayName,
          identifier: user.fomoId,
          description: trimText(user.bio, 300) || undefined,
          image: user.avatarUrl || undefined,
          url: absoluteUrl(locale, `/authors/${user.fomoId}`),
          ...(user.workplace && { worksFor: { "@type": "Organization", name: user.workplace } }),
          ...(user.city && { address: { "@type": "PostalAddress", addressLocality: user.city } }),
          knowsAbout: user.specializations,
        },
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <AuthorContent />
    </>
  );
}
