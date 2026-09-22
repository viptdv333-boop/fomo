import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const ideaPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  preview: z.string().min(1).max(1000).optional(),
  content: z.string().min(1).optional(),
  isPaid: z.boolean().optional(),
  price: z.number().min(1).optional(),
  acceptDonations: z.boolean().optional(),
  instrumentIds: z.array(z.string()).optional(),
  attachments: z.array(z.object({ url: z.string(), name: z.string() })).optional(),
  // Authors can only toggle published <-> archived (self-serve declutter);
  // "hidden" stays admin-only moderation, enforced below since zod alone
  // can't see who's calling.
  moderationStatus: z.enum(["published", "archived"]).optional(),
  // Owner pins an important channel post to the top of the list (22.09.2026).
  isPinned: z.boolean().optional(),
});

// Cuts at the nearest word boundary so a paid idea's free teaser never ends
// mid-word. `max` is a target, not a hard cap — the boundary search can land
// slightly under it.
function truncateAtWord(s: string, max: number): string {
  const flat = s.trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

type RouteContext = { params: Promise<{ id: string }> };

// ---------- GET: Single idea ----------

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const session = await auth();

  const idea = await prisma.idea.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      preview: true,
      content: true,
      isPaid: true,
      price: true,
      acceptDonations: true,
      viewCount: true,
      createdAt: true,
      attachments: true,
      updatedAt: true,
      authorId: true,
      tariffId: true,
      moderationStatus: true,
      tariff: { select: { id: true, name: true } },
      author: {
        select: {
          id: true,
          displayName: true,
          rating: true,
          avatarUrl: true,
          bio: true,
          donationCard: true,
          sbpQrUrl: true,
        },
      },
      instruments: {
        select: {
          instrument: {
            select: {
              id: true, name: true, slug: true,
              asset: { select: { slug: true, name: true } },
            },
          },
        },
      },
      votes: {
        select: { value: true, userId: true },
      },
    },
  });

  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const voteScore = idea.votes.reduce((sum, v) => sum + v.value, 0);
  const userId = session?.user?.id;
  const userVote = userId
    ? idea.votes.find((v) => v.userId === userId)?.value ?? null
    : null;

  // Determine if content should be included
  let includeContent = !idea.isPaid; // free ideas always include content
  let locked = false;

  if (idea.isPaid) {
    if (!userId) {
      // Not authenticated
      locked = true;
    } else if (idea.authorId === userId) {
      // Author can always see their own content
      includeContent = true;
    } else {
      // Check purchase or active subscription.
      // Пост канала (tariffId, 13.09.2026) открывает подписка на ЭТОТ канал —
      // или старая подписка на автора без тарифа. Старую платную идею без
      // канала, как и раньше, открывает любая активная подписка на автора.
      const [purchase, subscription] = await Promise.all([
        prisma.purchase.findUnique({
          where: {
            userId_ideaId: { userId, ideaId: id },
          },
        }),
        prisma.subscription.findFirst({
          where: {
            subscriberId: userId,
            authorId: idea.authorId,
            status: "active",
            endDate: { gt: new Date() },
            ...(idea.tariffId
              ? { OR: [{ tariffId: idea.tariffId }, { tariffId: null }] }
              : {}),
          },
        }),
      ]);

      if (purchase || subscription) {
        includeContent = true;
      } else {
        locked = true;
      }
    }
  }

  // Locked-content teaser: a paid board idea (no channel) shows its first
  // ~200 characters plus a blurred continuation before the paywall; a
  // channel post shows nothing at all — access is gated by the channel
  // subscription alone, not by a taste of the content.
  let previewText: string | null = null;
  let blurText: string | null = null;
  if (locked && !idea.tariffId) {
    previewText = truncateAtWord(idea.content, 200);
    blurText = idea.content.slice(previewText.replace(/…$/, "").length, previewText.replace(/…$/, "").length + 400) || null;
  }

  return NextResponse.json({
    id: idea.id,
    title: idea.title,
    preview: idea.preview,
    ...(includeContent && !locked ? { content: idea.content } : {}),
    ...(locked ? { locked: true, previewText, blurText } : {}),
    isPaid: idea.isPaid,
    price: idea.price,
    acceptDonations: idea.acceptDonations,
    channel: idea.tariff ? { id: idea.tariff.id, name: idea.tariff.name } : null,
    viewCount: idea.viewCount,
    attachments: idea.attachments,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
    moderationStatus: idea.moderationStatus,
    author: idea.author,
    instruments: idea.instruments.map((ii) => ii.instrument),
    voteScore,
    userVote,
  });
}

// ---------- PATCH: Edit idea ----------

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const idea = await prisma.idea.findUnique({
    where: { id },
    select: { id: true, authorId: true, moderationStatus: true },
  });

  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const isAdmin = (session.user as any).role === "ADMIN";
  const isAuthor = idea.authorId === session.user.id;

  if (!isAdmin && !isAuthor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = ideaPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // An admin-hidden idea (policy moderation) can't be self-published or
  // self-archived back out of "hidden" by its author — only an admin can
  // move it out of that state. The schema already keeps "hidden" itself
  // out of reach for non-admins; this closes the other half, leaving the
  // idea's own way out of "hidden".
  if (
    !isAdmin &&
    idea.moderationStatus === "hidden" &&
    parsed.data.moderationStatus !== undefined
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.preview !== undefined) data.preview = parsed.data.preview;
  if (parsed.data.content !== undefined) data.content = parsed.data.content;
  if (parsed.data.isPaid !== undefined) data.isPaid = parsed.data.isPaid;
  if (parsed.data.price !== undefined) data.price = parsed.data.price;
  if (parsed.data.acceptDonations !== undefined) data.acceptDonations = parsed.data.acceptDonations;
  if (parsed.data.attachments !== undefined) data.attachments = parsed.data.attachments;
  if (parsed.data.moderationStatus !== undefined) data.moderationStatus = parsed.data.moderationStatus;
  if (parsed.data.isPinned !== undefined) {
    data.isPinned = parsed.data.isPinned;
    data.pinnedAt = parsed.data.isPinned ? new Date() : null;
  }

  // Handle instruments update in a transaction
  if (parsed.data.instrumentIds !== undefined) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.ideaInstrument.deleteMany({ where: { ideaId: id } });

      if (parsed.data.instrumentIds!.length > 0) {
        await tx.ideaInstrument.createMany({
          data: parsed.data.instrumentIds!.map((instrumentId) => ({
            ideaId: id,
            instrumentId,
          })),
        });
      }

      return tx.idea.update({
        where: { id },
        data,
        select: { id: true },
      });
    });

    return NextResponse.json(updated);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.idea.update({
    where: { id },
    data,
    select: { id: true },
  });

  return NextResponse.json(updated);
}

// ---------- DELETE: Delete idea ----------

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const idea = await prisma.idea.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });

  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const isAdmin = (session.user as any).role === "ADMIN";
  const isAuthor = idea.authorId === session.user.id;

  if (!isAdmin && !isAuthor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.idea.delete({ where: { id } });

  return NextResponse.json({ message: "Idea deleted" });
}
