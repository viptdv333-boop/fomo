import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
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

  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (exchangeSlug) where.exchangeRel = { slug: exchangeSlug };
  if (instrumentType) where.instrumentType = instrumentType;
  if (categorySlug) where.category = { slug: categorySlug };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { ticker: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const instruments = await prisma.instrument.findMany({
    where,
    orderBy: { name: "asc" },
    // When searching, pull a wider pool so relevance sort has room to pick
    // the best matches. Without a search we keep the caller-controlled
    // pagination (undefined = all rows).
    take: search ? 100 : undefined,
    include: {
      chatRoom: { select: { id: true } },
      category: { select: { id: true, name: true, slug: true } },
      exchangeRel: { select: { id: true, name: true, slug: true, shortName: true, country: true } },
    },
  });

  // Relevance-rank search results so an exact ticker match ("NG" for "ng")
  // wins over anything that just happens to contain "ng" in its description
  // ("Hong Kong Exchange", etc.). Only kicks in when ?search= is set.
  if (search) {
    const q = search.toLowerCase();
    const scored = instruments.map((inst) => {
      const ticker = (inst.ticker || "").toLowerCase();
      const name = inst.name.toLowerCase();
      const desc = (inst.description || "").toLowerCase();
      let score = 0;
      if (ticker === q) score += 1000;
      else if (ticker.startsWith(q)) score += 500;
      else if (ticker.includes(q)) score += 100;
      if (name === q) score += 200;
      else if (name.startsWith(q)) score += 80;
      else if (name.includes(q)) score += 20;
      if (desc.includes(q)) score += 1;
      return { inst, score };
    });
    scored.sort((a, b) => b.score - a.score || a.inst.name.localeCompare(b.inst.name));
    return NextResponse.json(scored.slice(0, 20).map((s) => s.inst));
  }

  return NextResponse.json(instruments);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user)) {
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
