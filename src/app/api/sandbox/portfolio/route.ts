import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSandboxPortfolio, parseQuotation } from "@/lib/tinkoff-sandbox";

/**
 * GET /api/sandbox/portfolio — detailed portfolio with positions
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sandbox = await prisma.sandboxAccount.findUnique({
    where: { userId: session.user.id },
  });
  if (!sandbox) {
    return NextResponse.json({ error: "Нет демо-счёта" }, { status: 404 });
  }

  try {
    const portfolio = await getSandboxPortfolio(sandbox.tinkoffAccountId);

    return NextResponse.json({
      totalAmount: parseQuotation(portfolio.totalAmountPortfolio),
      totalShares: parseQuotation(portfolio.totalAmountShares),
      totalBonds: parseQuotation(portfolio.totalAmountBonds),
      totalFutures: parseQuotation(portfolio.totalAmountFutures),
      totalCurrencies: parseQuotation(portfolio.totalAmountCurrencies),
      expectedYield: parseQuotation(portfolio.expectedYield),
      positions: (portfolio.positions || []).map((p: any) => ({
        instrumentUid: p.instrumentUid,
        figi: p.figi,
        instrumentType: p.instrumentType,
        quantity: parseQuotation(p.quantity),
        averagePrice: parseQuotation(p.averagePositionPrice),
        currentPrice: parseQuotation(p.currentPrice),
        expectedYield: parseQuotation(p.expectedYield),
        currentNkd: parseQuotation(p.currentNkd),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
