import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLinkRef, linkRefId, normalizeLinkDetails, type PublicPayLink } from "@/lib/payment-link";

/**
 * GET /api/users/[id]/payment-links[?tariffId=...]
 * The author's "payment by link" methods that a signed-in buyer may use.
 * With tariffId: only the ones the tariff accepts ("link:<id>" entries; a bare
 * "link" entry means all of them). Without: all (ideas, donations, courses).
 * Every stored URL is re-validated on the way out, so a bad legacy row is
 * never handed to a buyer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const tariffId = request.nextUrl.searchParams.get("tariffId");

  let allowedIds: Set<string> | null = null; // null = no restriction
  if (tariffId) {
    const tariff = await prisma.subscriptionTariff.findUnique({
      where: { id: tariffId },
      select: { authorId: true, paymentMethods: true, isActive: true },
    });
    if (!tariff || tariff.authorId !== id || !tariff.isActive) return NextResponse.json([]);
    const refs = tariff.paymentMethods.filter(isLinkRef);
    if (refs.length === 0) return NextResponse.json([]);
    if (!refs.some((r) => linkRefId(r) === null)) {
      allowedIds = new Set(refs.map((r) => linkRefId(r)).filter((x): x is string => !!x));
    }
  }

  const rows = await prisma.paymentMethod.findMany({
    where: { userId: id, type: "link", ...(allowedIds ? { id: { in: [...allowedIds] } } : {}) },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, label: true, details: true },
  });

  const out: PublicPayLink[] = [];
  for (const r of rows) {
    const norm = normalizeLinkDetails(r.details);
    if (!norm.ok) continue;
    out.push({
      id: r.id,
      label: r.label,
      url: norm.details.url,
      host: norm.host,
      instruction: norm.details.instruction || "",
    });
  }
  return NextResponse.json(out);
}
