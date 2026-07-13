import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import AuthorContent from "./AuthorContent";

const SITE_URL = "https://fomo.spot";

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
  if (!user || user.status !== "APPROVED") {
    return {
      title: "Автор не найден",
      robots: { index: false, follow: false },
    };
  }

  const url = `${SITE_URL}/authors/${user.fomoId}`;
  const title = `${user.displayName} — трейдер на FOMO`;
  const bioText = trimText(user.bio, 160);
  const description =
    bioText ||
    `${user.displayName}: ${user._count.ideas} идей на FOMO, рейтинг ${Number(user.rating).toFixed(1)}. Читайте аналитику и подпишитесь на автора.`;
  const image = user.avatarUrl || "/logo-fomo.png";

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: "FOMO",
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

  const jsonLd = user && user.status === "APPROVED"
    ? {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        mainEntity: {
          "@type": "Person",
          name: user.displayName,
          identifier: user.fomoId,
          description: trimText(user.bio, 300) || undefined,
          image: user.avatarUrl || undefined,
          url: `${SITE_URL}/authors/${user.fomoId}`,
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
