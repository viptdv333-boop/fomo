import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import IdeaContent from "./IdeaContent";

const SITE_URL = "https://fomo.spot";

type PageProps = { params: Promise<{ id: string }> };

async function fetchIdea(id: string) {
  try {
    return await prisma.idea.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        preview: true,
        isPaid: true,
        price: true,
        moderationStatus: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            displayName: true,
            fomoId: true,
            avatarUrl: true,
          },
        },
        instruments: {
          select: { instrument: { select: { name: true, slug: true } } },
        },
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
  const { id } = await params;
  const idea = await fetchIdea(id);
  if (!idea || idea.moderationStatus !== "published") {
    return {
      title: "Идея не найдена",
      robots: { index: false, follow: false },
    };
  }

  const url = `${SITE_URL}/ideas/${idea.id}`;
  const title = trimText(idea.title, 70);
  const description = trimText(idea.preview, 200);
  const author = idea.author.displayName;
  const image = idea.author.avatarUrl || "/logo-fomo.png";

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      siteName: "FOMO",
      publishedTime: idea.createdAt.toISOString(),
      modifiedTime: idea.updatedAt.toISOString(),
      authors: [author],
      images: [{ url: image, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function IdeaPage({ params }: PageProps) {
  const { id } = await params;
  const idea = await fetchIdea(id);

  // JSON-LD Article schema — helps Yandex/Google display rich snippets
  const jsonLd = idea && idea.moderationStatus === "published"
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: idea.title,
        description: trimText(idea.preview, 300),
        datePublished: idea.createdAt.toISOString(),
        dateModified: idea.updatedAt.toISOString(),
        author: {
          "@type": "Person",
          name: idea.author.displayName,
          ...(idea.author.fomoId && {
            url: `${SITE_URL}/authors/${idea.author.fomoId}`,
          }),
        },
        publisher: {
          "@type": "Organization",
          name: "FOMO",
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/logo-fomo.png`,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${SITE_URL}/ideas/${idea.id}`,
        },
        ...(idea.isPaid && idea.price && {
          isAccessibleForFree: false,
          hasPart: {
            "@type": "WebPageElement",
            isAccessibleForFree: false,
            cssSelector: ".paid-content",
          },
        }),
        about: idea.instruments.map((i) => ({
          "@type": "Thing",
          name: i.instrument.name,
          url: `${SITE_URL}/instruments/${i.instrument.slug}`,
        })),
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          // Escape "<" so no user-controlled field (title, preview, name) can inject
          // a closing </script> and break out of the JSON-LD block.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <IdeaContent />
    </>
  );
}
