import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const paidTierSchema = z.object({
  min: z.number(),
  max: z.number(),
  maxPaid: z.number(),
});

const updateRatingConfigSchema = z.object({
  subscriberWeight: z.number().min(0).max(10).optional(),
  likeWeight: z.number().min(0).max(10).optional(),
  dislikeWeight: z.number().min(0).max(10).optional(),
  inactivityPenalty: z.number().min(0).max(10).optional(),
  inactivityThresholdDays: z.number().int().min(1).max(365).optional(),
  paidTiers: z.array(paidTierSchema).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let config = await prisma.ratingConfig.findUnique({
    where: { id: "singleton" },
  });

  // Create default config if it doesn't exist
  if (!config) {
    config = await prisma.ratingConfig.create({
      data: { id: "singleton" },
    });
  }

  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateRatingConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.subscriberWeight !== undefined)
    data.subscriberWeight = parsed.data.subscriberWeight;
  if (parsed.data.likeWeight !== undefined)
    data.likeWeight = parsed.data.likeWeight;
  if (parsed.data.dislikeWeight !== undefined)
    data.dislikeWeight = parsed.data.dislikeWeight;
  if (parsed.data.inactivityPenalty !== undefined)
    data.inactivityPenalty = parsed.data.inactivityPenalty;
  if (parsed.data.inactivityThresholdDays !== undefined)
    data.inactivityThresholdDays = parsed.data.inactivityThresholdDays;
  if (parsed.data.paidTiers !== undefined)
    data.paidTiers = parsed.data.paidTiers;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const config = await prisma.ratingConfig.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  return NextResponse.json(config);
}
