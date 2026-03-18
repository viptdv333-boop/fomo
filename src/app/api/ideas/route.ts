import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { recalculateRating } from "@/lib/rating";
import { notifyFollowers } from "@/lib/notifications";

// ---------- GET: List ideas ----------

const ideaSelect = {
  id: true,
  title: true,
  preview: true,
  isPaid: true,
  price: true,
  createdAt: true,
  author: {
    select: {
      id: true,
      displayName: true,
      fomoId: true,
      rating: true,
      avatarUrl: true,
    },
  },
  instruments: {
    select: {
      instrument: {
        select: { id: true, name: true, slug: true },
      },
    },
  },
  votes: {
    select: { value: true, userId: true },
  },
};

export async function GET(request: NextRequest) {
  const session = await auth();
  const { searchParams } = new URL(request.url);

  // Unauthenticated: return 5 most recent ideas, no filters
  if (!session?.user) {
    const ideas = await prisma.idea.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: ideaSelect,
    });

    return NextResponse.json(
      ideas.map((idea) => ({
        id: idea.id,
        title: idea.title,
        preview: idea.preview,
        isPaid: idea.isPaid,
        price: idea.price,
        createdAt: idea.createdAt,
        author: idea.author,
        instruments: idea.instruments.map((ii) => ii.instrument),
        voteScore: idea.votes.reduce((sum, v) => sum + v.value, 0),
        userVote: null,
      }))
    );
  }

  // Authenticated: apply filters and pagination
  const instrumentId = searchParams.get("instrumentId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const search = searchParams.get("search");
  const authorId = searchParams.get("authorId");
  const sortByParam = searchParams.get("sortBy") || "date";
  const sortOrderParam = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  const where: Record<string, unknown> = {};

  if (instrumentId) {
    where.instruments = {
      some: { instrumentId },
    };
  }
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) createdAt.lte = new Date(dateTo);
    where.createdAt = createdAt;
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { preview: { contains: search, mode: "insensitive" } },
    ];
  }
  if (authorId) {
    where.authorId = authorId;
  }

  // Paid/free filter
  const isPaidParam = searchParams.get("isPaid");
  if (isPaidParam === "true") {
    where.isPaid = true;
  } else if (isPaidParam === "false") {
    where.isPaid = false;
  }

  // Dynamic sorting
  let orderBy: Record<string, unknown>;
  switch (sortByParam) {
    case "rating":
      orderBy = { author: { rating: sortOrderParam } };
      break;
    case "alphabet":
      orderBy = { title: sortOrderParam };
      break;
    case "date":
    default:
      orderBy = { createdAt: sortOrderParam };
      break;
  }

  const [ideas, total] = await Promise.all([
    prisma.idea.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: ideaSelect,
    }),
    prisma.idea.count({ where }),
  ]);

  const userId = session.user.id;

  return NextResponse.json({
    data: ideas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      preview: idea.preview,
      isPaid: idea.isPaid,
      price: idea.price,
      createdAt: idea.createdAt,
      author: idea.author,
      instruments: idea.instruments.map((ii) => ii.instrument),
      voteScore: idea.votes.reduce((sum, v) => sum + v.value, 0),
      userVote: idea.votes.find((v) => v.userId === userId)?.value ?? null,
    })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

// ---------- POST: Create idea ----------

const attachmentSchema = z.object({
  url: z.string(),
  name: z.string(),
});

const createIdeaSchema = z.object({
  title: z.string().min(1).max(300),
  preview: z.string().min(1).max(1000),
  content: z.string().min(1),
  isPaid: z.boolean(),
  price: z.number().positive().optional(),
  instrumentIds: z.array(z.string()).min(1),
  attachments: z.array(attachmentSchema).optional(),
});

interface PaidTier {
  min: number;
  max: number;
  maxPaid: number; // -1 means unlimited
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as any).status !== "APPROVED") {
    return NextResponse.json(
      { error: "Only approved users can create ideas" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { title, preview, content, isPaid, price, instrumentIds, attachments } = parsed.data;

  if (isPaid && (price === undefined || price <= 0)) {
    return NextResponse.json(
      { error: "Price is required for paid ideas" },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  // If paid idea, check rating tiers and weekly limit
  if (isPaid) {
    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: { rating: true },
    });

    if (!author) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const config = await prisma.ratingConfig.findFirst({
      where: { id: "singleton" },
    });

    if (!config) {
      return NextResponse.json({ error: "Rating config not found" }, { status: 500 });
    }

    const tiers = config.paidTiers as unknown as PaidTier[];
    const authorRating = Number(author.rating);

    const tier = tiers.find(
      (t) => authorRating >= t.min && authorRating < t.max
    );

    if (!tier || tier.maxPaid === 0) {
      return NextResponse.json(
        { error: "Your rating does not allow publishing paid ideas" },
        { status: 403 }
      );
    }

    // Check weekly limit (maxPaid = -1 means unlimited)
    if (tier.maxPaid > 0) {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const paidCountThisWeek = await prisma.idea.count({
        where: {
          authorId: userId,
          isPaid: true,
          createdAt: { gte: oneWeekAgo },
        },
      });

      if (paidCountThisWeek >= tier.maxPaid) {
        return NextResponse.json(
          { error: `Weekly paid idea limit reached (${tier.maxPaid})` },
          { status: 429 }
        );
      }
    }
  }

  // Validate instruments exist
  const instruments = await prisma.instrument.findMany({
    where: { id: { in: instrumentIds } },
    select: { id: true },
  });

  if (instruments.length !== instrumentIds.length) {
    return NextResponse.json(
      { error: "One or more instrument IDs are invalid" },
      { status: 400 }
    );
  }

  const idea = await prisma.idea.create({
    data: {
      title,
      preview,
      content,
      isPaid,
      price: isPaid ? price : null,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      authorId: userId,
      instruments: {
        create: instrumentIds.map((instrumentId) => ({ instrumentId })),
      },
    },
    select: {
      id: true,
      title: true,
      preview: true,
      isPaid: true,
      price: true,
      createdAt: true,
    },
  });

  // Update lastPublishedAt and recalculate rating
  await prisma.user.update({
    where: { id: userId },
    data: { lastPublishedAt: new Date() },
  });

  await recalculateRating(userId);

  // Notify followers about new idea
  const author = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });
  if (author) {
    await notifyFollowers(
      userId,
      "new_idea",
      `${author.displayName} опубликовал новую идею`,
      title,
      `/ideas/${idea.id}`
    );
  }

  return NextResponse.json(idea, { status: 201 });
}
