import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { recalculateRating } from "@/lib/rating";
import { notifyFollowers } from "@/lib/notifications";
import { notifyChannelTelegramSubscribers, escapeTelegramHtml } from "@/lib/telegram";
import { rateLimit } from "@/lib/rate-limit";

// ---------- GET: List ideas ----------

const ideaSelect = {
  id: true,
  title: true,
  preview: true,
  isPaid: true,
  price: true,
  acceptDonations: true,
  viewCount: true,
  createdAt: true,
  tariffId: true,
  moderationStatus: true,
  author: {
    select: {
      id: true,
      displayName: true,
      fomoId: true,
      rating: true,
      avatarUrl: true,
      donationCard: true,
      sbpQrUrl: true,
    },
  },
  instruments: {
    select: {
      instrument: {
        select: {
          id: true,
          name: true,
          slug: true,
          ticker: true,
          asset: { select: { slug: true, name: true } },
        },
      },
    },
  },
  votes: {
    select: { value: true, userId: true },
  },
  _count: {
    select: { comments: { where: { isDeleted: false } } },
  },
};

export async function GET(request: NextRequest) {
  const session = await auth();
  const { searchParams } = new URL(request.url);

  // Filters, sorting and pagination apply the same way whether or not the
  // visitor is logged in. Guests used to get an unconditional 5 most-recent
  // ideas with every query param silently ignored — isPaid, instrumentId,
  // search, sortBy, page, all of it — so the paid/free toggle (and the entire
  // feed for anyone browsing via "Продолжить без регистрации") did nothing
  // for a guest. The only thing that legitimately differs per session is
  // userVote, which is null with no userId to match against.
  const instrumentId = searchParams.get("instrumentId");
  const instrumentSlug = searchParams.get("instrumentSlug");
  const assetSlug = searchParams.get("assetSlug");
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
  } else if (assetSlug) {
    // Match any instrument tied to this Asset — collapses all exchange-specific
    // instruments (e.g. NG@CME + NG@MOEX + NATGAS) into a single "Газ" filter.
    where.instruments = {
      some: { instrument: { asset: { slug: assetSlug } } },
    };
  } else if (instrumentSlug) {
    where.instruments = {
      some: { instrument: { slug: instrumentSlug } },
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

  // Archived ideas (author self-declutter) are excluded from every normal
  // feed view — a dedicated filter opts into seeing only those instead. The
  // one exception is an author browsing their own idea list (profile "Мои
  // идеи"), which needs every status visible so they can find and unarchive.
  const statusParam = searchParams.get("status");
  const isOwnIdeaList = Boolean(authorId) && authorId === session?.user?.id;
  if (statusParam === "archived") {
    where.moderationStatus = "archived";
  } else if (!isOwnIdeaList) {
    where.moderationStatus = "published";
  }

  // Посты закрытых каналов (Idea.tariffId, 13.09.2026) живут в своём канале.
  // channelId — лента канала: его посты плюс старые платные идеи автора без
  // канала (до 13.09 канал показывал все платные идеи автора — их не прячем).
  // Без channelId и authorId это общая лента: постов каналов в ней нет.
  // Профиль автора (authorId) показывает всё, закрытое остаётся закрытым.
  const channelId = searchParams.get("channelId");
  if (channelId) {
    const tariff = await prisma.subscriptionTariff.findUnique({
      where: { id: channelId },
      select: { authorId: true },
    });
    if (!tariff) {
      return NextResponse.json({ data: [], page, limit, total: 0, totalPages: 0 });
    }
    where.AND = [
      {
        OR: [
          { tariffId: channelId },
          { authorId: tariff.authorId, isPaid: true, tariffId: null },
        ],
      },
    ];
  } else if (!authorId) {
    where.tariffId = null;
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

  const userId = session?.user?.id;

  // Channel posts carry the trade details (entry / stop / take) in `content`,
  // which the card used to hide behind a click. Hand it to the list only for
  // viewers who can open the post — its author, or an active subscriber of
  // this channel (or a legacy author-wide subscription), same rule as
  // /api/ideas/[id].
  const contentById = new Map<string, string>();
  const channelIdeas = ideas.filter((i) => i.tariffId);
  if (userId && channelIdeas.length > 0) {
    const subs = await prisma.subscription.findMany({
      where: { subscriberId: userId, status: "active", endDate: { gt: new Date() } },
      select: { authorId: true, tariffId: true },
    });
    const readable = channelIdeas.filter(
      (i) =>
        i.author.id === userId ||
        subs.some((s) => s.authorId === i.author.id && (s.tariffId === null || s.tariffId === i.tariffId))
    );
    if (readable.length > 0) {
      const rows = await prisma.idea.findMany({
        where: { id: { in: readable.map((i) => i.id) } },
        select: { id: true, content: true },
      });
      for (const r of rows) contentById.set(r.id, r.content);
    }
  }

  return NextResponse.json({
    data: ideas.map((idea) => ({
      ...(contentById.has(idea.id) ? { content: contentById.get(idea.id) } : {}),
      id: idea.id,
      title: idea.title,
      preview: idea.preview,
      isPaid: idea.isPaid,
      price: idea.price,
      acceptDonations: idea.acceptDonations,
      viewCount: idea.viewCount,
      commentCount: idea._count.comments,
      createdAt: idea.createdAt,
      moderationStatus: idea.moderationStatus,
      channelId: idea.tariffId,
      author: idea.author,
      instruments: idea.instruments.map((ii) => ii.instrument),
      voteScore: idea.votes.reduce((sum, v) => sum + v.value, 0),
      userVote: userId ? idea.votes.find((v) => v.userId === userId)?.value ?? null : null,
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
  // 0 присылает форма поста в канал: у поста канала нет цены, его открывает
  // подписка. Для обычной платной идеи цена > 0 проверяется ниже.
  price: z.number().nonnegative().optional(),
  acceptDonations: z.boolean().optional(),
  // Форма поста в канал не показывает выбор инструмента — для канала список
  // может быть пустым, для обычной идеи нужен хотя бы один (проверка ниже).
  instrumentIds: z.array(z.string()),
  attachments: z.array(attachmentSchema).optional(),
  channelId: z.string().optional(),
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

  const { title, preview, content, isPaid, price, acceptDonations, instrumentIds, attachments, channelId } = parsed.data;

  if (!channelId && instrumentIds.length === 0) {
    return NextResponse.json({ error: "Выберите хотя бы один инструмент" }, { status: 400 });
  }

  if (isPaid && !channelId && (price === undefined || price <= 0)) {
    return NextResponse.json(
      { error: "Price is required for paid ideas" },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  // Пост в канал (13.09.2026): канал обязан принадлежать автору поста. Такой
  // пост — не продаваемая идея: он платный (закрыт), без цены и без лимитов
  // платных идей по рейтингу — его открывает подписка на канал.
  let tariffId: string | null = null;
  if (channelId) {
    const tariff = await prisma.subscriptionTariff.findUnique({
      where: { id: channelId },
      select: { id: true, authorId: true },
    });
    if (!tariff || tariff.authorId !== userId) {
      return NextResponse.json(
        { error: "Канал не найден или принадлежит другому автору" },
        { status: 403 }
      );
    }
    tariffId = tariff.id;
  }

  // Free ideas had no ceiling at all — one account could flood the whole feed.
  // Paid ones are additionally capped by the rating tiers below.
  const postLimit = await rateLimit(`idea:${userId}`, 10, 60 * 60 * 1000);
  if (!postLimit.allowed) {
    return NextResponse.json(
      { error: "Слишком часто. Публиковать можно не больше 10 идей в час" },
      { status: 429 }
    );
  }

  // Bans take effect now, not whenever the session token next refreshes.
  const poster = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!poster || poster.status === "BANNED") {
    return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
  }

  // If paid idea, check rating tiers and weekly limit (посты канала — не продажа)
  if (isPaid && !tariffId) {
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

    // Highest tier the author has reached. A plain `rating >= min && < max`
    // scan left rating 10 matching nothing (the top tier ends at 10), which
    // locked the maximum-rated authors out of paid ideas entirely.
    const tier = [...tiers]
      .sort((a, b) => a.min - b.min)
      .filter((t) => authorRating >= t.min)
      .pop();

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

  // Auto-add related instruments
  const relatedRecords = await prisma.instrumentRelation.findMany({
    where: { instrumentId: { in: instrumentIds } },
    select: { relatedId: true },
  });
  const allInstrumentIds = [...new Set([...instrumentIds, ...relatedRecords.map(r => r.relatedId)])];

  const idea = await prisma.idea.create({
    data: {
      title,
      preview,
      content,
      isPaid: tariffId ? true : isPaid,
      price: tariffId ? null : (isPaid ? price : null),
      acceptDonations: !tariffId && !isPaid ? (acceptDonations ?? false) : false,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      authorId: userId,
      tariffId,
      instruments: {
        create: allInstrumentIds.map((instrumentId) => ({ instrumentId })),
      },
    },
    select: {
      id: true,
      title: true,
      preview: true,
      isPaid: true,
      price: true,
      createdAt: true,
      tariffId: true,
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
  // Пост канала — для подписчиков канала, не для всех фолловеров автора.
  if (author && !tariffId) {
    await notifyFollowers(
      userId,
      "new_idea",
      `${author.displayName} опубликовал новую идею`,
      title,
      `/ideas/${idea.id}`
    );
  } else if (tariffId) {
    await notifyChannelTelegramSubscribers(
      tariffId,
      `🔔 Новый сетап: <b>${escapeTelegramHtml(title)}</b>\n${escapeTelegramHtml(preview)}\n\nhttps://fomo.spot/ideas/${idea.id}`
    ).catch(() => {});
  }

  return NextResponse.json(idea, { status: 201 });
}
