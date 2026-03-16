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
  instrumentIds: z.array(z.string()).optional(),
  attachments: z.array(z.object({ url: z.string(), name: z.string() })).optional(),
});

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
      createdAt: true,
      attachments: true,
      updatedAt: true,
      authorId: true,
      author: {
        select: {
          id: true,
          displayName: true,
          rating: true,
          avatarUrl: true,
          bio: true,
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
      // Check purchase or active subscription
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

  return NextResponse.json({
    id: idea.id,
    title: idea.title,
    preview: idea.preview,
    ...(includeContent && !locked ? { content: idea.content } : {}),
    ...(locked ? { locked: true } : {}),
    isPaid: idea.isPaid,
    price: idea.price,
    attachments: idea.attachments,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
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

  const body = await request.json();
  const parsed = ideaPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.preview !== undefined) data.preview = parsed.data.preview;
  if (parsed.data.content !== undefined) data.content = parsed.data.content;
  if (parsed.data.isPaid !== undefined) data.isPaid = parsed.data.isPaid;
  if (parsed.data.price !== undefined) data.price = parsed.data.price;
  if (parsed.data.attachments !== undefined) data.attachments = parsed.data.attachments;

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
