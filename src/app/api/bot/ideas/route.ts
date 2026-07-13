import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { recalculateRating } from "@/lib/rating";
import { notifyFollowers } from "@/lib/notifications";

// Публикация от внешних торговых терминалов (Босс, 13.07.2026): сервер-к-серверу,
// без браузерной NextAuth-сессии. Только БЕСПЛАТНЫЕ идеи от заранее известного
// автора — эндпоинт намеренно не даёт управлять isPaid/price/authorId извне.
const MIKHAIL_USER_ID = "cmmteunjn0004csaotp2lnb4a"; // аккаунт «Михаил», /profile/cmmteunjn0004csaotp2lnb4a

function checkToken(request: NextRequest): boolean {
  const expected = process.env.FOMO_BOT_TOKEN;
  if (!expected) return false;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const createBotIdeaSchema = z.object({
  title: z.string().min(1).max(300),
  preview: z.string().min(1).max(1000),
  content: z.string().min(1),
  instrumentSlugs: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  if (!checkToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createBotIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { title, preview, content, instrumentSlugs } = parsed.data;

  const instruments = instrumentSlugs?.length
    ? await prisma.instrument.findMany({
        where: { slug: { in: instrumentSlugs } },
        select: { id: true },
      })
    : [];

  const idea = await prisma.idea.create({
    data: {
      title,
      preview,
      content,
      isPaid: false,
      acceptDonations: false,
      authorId: MIKHAIL_USER_ID,
      instruments: {
        create: instruments.map((i) => ({ instrumentId: i.id })),
      },
    },
    select: { id: true, title: true, createdAt: true },
  });

  await prisma.user.update({
    where: { id: MIKHAIL_USER_ID },
    data: { lastPublishedAt: new Date() },
  });
  await recalculateRating(MIKHAIL_USER_ID);

  const author = await prisma.user.findUnique({
    where: { id: MIKHAIL_USER_ID },
    select: { displayName: true },
  });
  if (author) {
    await notifyFollowers(
      MIKHAIL_USER_ID,
      "new_idea",
      `${author.displayName} опубликовал новую идею`,
      title,
      `/ideas/${idea.id}`
    );
  }

  return NextResponse.json(
    { ...idea, matchedInstruments: instruments.length, url: `/ideas/${idea.id}` },
    { status: 201 }
  );
}
