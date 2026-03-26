import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const createInstrumentSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  categoryId: z.string().optional(),
  exchangeId: z.string().optional(),
  ticker: z.string().optional(),
  exchange: z.string().optional(),
  exchangeUrl: z.string().optional(),
  tradingViewSymbol: z.string().optional(),
  dataSource: z.string().optional(),
  dataTicker: z.string().optional(),
  externalUrl: z.string().optional(),
  instrumentType: z.string().optional(),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const exchangeSlug = searchParams.get("exchangeSlug");
  const instrumentType = searchParams.get("type");
  const categorySlug = searchParams.get("categorySlug");

  const where: Record<string, unknown> = {};
  if (exchangeSlug) where.exchangeRel = { slug: exchangeSlug };
  if (instrumentType) where.instrumentType = instrumentType;
  if (categorySlug) where.category = { slug: categorySlug };

  const instruments = await prisma.instrument.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      chatRoom: { select: { id: true } },
      category: { select: { id: true, name: true, slug: true } },
      exchangeRel: { select: { id: true, name: true, slug: true, shortName: true, country: true } },
    },
  });

  return NextResponse.json(instruments);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createInstrumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.instrument.findFirst({
    where: {
      OR: [{ name: parsed.data.name }, { slug: parsed.data.slug }],
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Instrument with this name or slug already exists" },
      { status: 409 }
    );
  }

  const instrument = await prisma.instrument.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      categoryId: parsed.data.categoryId || null,
      exchangeId: parsed.data.exchangeId || null,
      ticker: parsed.data.ticker || null,
      exchange: parsed.data.exchange || null,
      exchangeUrl: parsed.data.exchangeUrl || null,
      tradingViewSymbol: parsed.data.tradingViewSymbol || null,
      dataSource: parsed.data.dataSource || null,
      dataTicker: parsed.data.dataTicker || null,
      externalUrl: parsed.data.externalUrl || null,
      instrumentType: parsed.data.instrumentType || null,
      description: parsed.data.description || null,
      chatRoom: {
        create: {
          name: parsed.data.name,
        },
      },
    },
    include: {
      chatRoom: { select: { id: true } },
      category: { select: { id: true, name: true, slug: true } },
      exchangeRel: { select: { id: true, name: true, slug: true, shortName: true } },
    },
  });

  return NextResponse.json(instrument, { status: 201 });
}
