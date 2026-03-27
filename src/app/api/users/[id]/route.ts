import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { isValidCustomFomoId } from "@/lib/fomoId";

const adminPatchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "BANNED"]).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  ratingDelta: z.number().min(-10).max(10).optional(),
  bannedUntil: z.string().nullable().optional(),
  banReason: z.string().max(500).nullable().optional(),
});

const userPatchSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  subscriptionPrice: z.number().min(0).nullable().optional(),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  birthDate: z.string().nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  workplace: z.string().max(200).nullable().optional(),
  exchangeExperience: z.string().max(100).nullable().optional(),
  specializations: z.array(z.string()).optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  dmEnabled: z.boolean().optional(),
  paymentCard: z.string().max(30).nullable().optional(),
  donationCard: z.string().max(30).nullable().optional(),
  fomoId: z.string().min(7).max(33).optional(),
  socialLinks: z.object({
    telegram: z.string().max(200).optional(),
    vk: z.string().max(200).optional(),
    youtube: z.string().max(200).optional(),
    whatsapp: z.string().max(200).optional(),
    max: z.string().max(200).optional(),
    website: z.string().max(500).optional(),
  }).nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const session = await auth();

  // Try by ID first, then by fomoId
  const isCuid = /^[a-z0-9]{20,}$/i.test(id);
  const user = await prisma.user.findFirst({
    where: isCuid ? { id } : { fomoId: id },
    select: {
      id: true,
      displayName: true,
      fomoId: true,
      bio: true,
      avatarUrl: true,
      rating: true,
      subscriptionPrice: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      city: true,
      workplace: true,
      exchangeExperience: true,
      specializations: true,
      dmEnabled: true,
      paymentCard: true,
      donationCard: true,
      socialLinks: true,
      createdAt: true,
      education: {
        orderBy: { yearEnd: "desc" },
      },
      _count: {
        select: {
          followersReceived: true,
          ideas: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let isFollowing = false;
  if (session?.user?.id && session.user.id !== id) {
    const follow = await prisma.follow.findUnique({
      where: { followerId_authorId: { followerId: session.user.id, authorId: id } },
    });
    isFollowing = !!follow;
  }

  return NextResponse.json({
    id: user.id,
    displayName: user.displayName,
    fomoId: user.fomoId,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    rating: user.rating,
    subscriptionPrice: user.subscriptionPrice,
    firstName: user.firstName,
    lastName: user.lastName,
    birthDate: user.birthDate,
    city: user.city,
    workplace: user.workplace,
    exchangeExperience: user.exchangeExperience,
    specializations: user.specializations,
    dmEnabled: user.dmEnabled,
    paymentCard: user.paymentCard,
    donationCard: user.donationCard,
    socialLinks: user.socialLinks,
    education: user.education,
    createdAt: user.createdAt,
    followerCount: user._count.followersReceived,
    ideaCount: user._count.ideas,
    isFollowing,
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const isAdmin = (session.user as any).role === "ADMIN";
  const isSelf = session.user.id === id;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Admin actions: status, role, rating, ban
  if (isAdmin && (body.status !== undefined || body.role !== undefined || body.ratingDelta !== undefined || body.bannedUntil !== undefined)) {
    const parsed = adminPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};

    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status;
    }
    if (parsed.data.role !== undefined) {
      data.role = parsed.data.role;
    }
    if (parsed.data.bannedUntil !== undefined) {
      data.bannedUntil = parsed.data.bannedUntil ? new Date(parsed.data.bannedUntil) : null;
      if (parsed.data.bannedUntil) {
        data.status = "BANNED";
      }
    }
    if (parsed.data.banReason !== undefined) {
      data.banReason = parsed.data.banReason;
    }
    if (parsed.data.ratingDelta !== undefined) {
      const current = await prisma.user.findUnique({ where: { id }, select: { rating: true } });
      if (current) {
        const newRating = Math.max(0, Math.min(99.99, Number(current.rating) + parsed.data.ratingDelta));
        data.rating = newRating;
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, status: true, role: true, rating: true, bannedUntil: true, banReason: true },
    });

    return NextResponse.json(updated);
  }

  // User editing own profile (or admin editing profile fields)
  if (isSelf || isAdmin) {
    const parsed = userPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Handle fomoId separately (needs validation + uniqueness check)
    if (parsed.data.fomoId !== undefined) {
      if (!isValidCustomFomoId(parsed.data.fomoId)) {
        return NextResponse.json(
          { error: "FOMO ID: латинские буквы, цифры и символы _ ! ? $ %, от 7 до 33 символов" },
          { status: 400 }
        );
      }
      const existing = await prisma.user.findUnique({ where: { fomoId: parsed.data.fomoId } });
      if (existing && existing.id !== id) {
        return NextResponse.json({ error: "Этот FOMO ID уже занят" }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    const fields = [
      "displayName", "bio", "subscriptionPrice",
      "firstName", "lastName", "city", "workplace",
      "exchangeExperience", "specializations",
      "avatarUrl", "dmEnabled", "paymentCard", "donationCard", "socialLinks",
      "fomoId",
    ] as const;

    for (const field of fields) {
      if (parsed.data[field] !== undefined) {
        data[field] = parsed.data[field];
      }
    }

    if (parsed.data.birthDate !== undefined) {
      data.birthDate = parsed.data.birthDate ? new Date(parsed.data.birthDate) : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        displayName: true,
        fomoId: true,
        bio: true,
        subscriptionPrice: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        city: true,
        workplace: true,
        exchangeExperience: true,
        specializations: true,
        avatarUrl: true,
        dmEnabled: true,
        paymentCard: true,
        donationCard: true,
        socialLinks: true,
      },
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ message: "User deleted" });
}
