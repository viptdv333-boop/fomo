import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  openSandboxAccount,
  sandboxPayIn,
  getSandboxPortfolio,
  closeSandboxAccount,
  parseQuotation,
  getInstrumentInfo,
  getLastPrice,
} from "@/lib/tinkoff-sandbox";

const INITIAL_BALANCE = 1_000_000; // 1M RUB demo money

/**
 * GET /api/sandbox/account — get or create sandbox account for current user
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sandbox = await prisma.sandboxAccount.findUnique({
    where: { userId: session.user.id },
  });

  if (!sandbox) {
    // Create new sandbox account via Tinkoff API
    try {
      const tinkoffAccountId = await openSandboxAccount();
      // Deposit initial demo money
      await sandboxPayIn(tinkoffAccountId, "RUB", INITIAL_BALANCE);

      sandbox = await prisma.sandboxAccount.create({
        data: {
          userId: session.user.id,
          tinkoffAccountId,
          balance: INITIAL_BALANCE,
        },
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: "Не удалось создать демо-счёт: " + err.message },
        { status: 500 }
      );
    }
  }

  // Get current portfolio from Tinkoff
  try {
    const portfolio = await getSandboxPortfolio(sandbox.tinkoffAccountId);
    const totalAmount = parseQuotation(portfolio.totalAmountPortfolio);
    const rawPositions = (portfolio.positions || [])
      .filter((p: any) => p.instrumentType !== "currency");

    // Resolve instrument names + fetch live market prices in parallel
    const positions = await Promise.all(
      rawPositions.map(async (p: any) => {
        const uid = p.instrumentUid || p.figi || "";
        const [info, livePrice] = await Promise.all([
          getInstrumentInfo(uid),
          getLastPrice(uid),
        ]);
        const qty = parseQuotation(p.quantity);
        const avgPrice = parseQuotation(p.averagePositionPrice);
        // Use live market price if available, otherwise sandbox price
        const sandboxPrice = parseQuotation(p.currentPrice);
        const curPrice = livePrice > 0 ? livePrice : sandboxPrice;
        const expectedYield = (curPrice - avgPrice) * qty;
        return {
          instrumentId: uid,
          instrumentType: p.instrumentType,
          name: info.name,
          ticker: info.ticker,
          quantity: qty,
          averagePrice: avgPrice,
          currentPrice: curPrice,
          currentValue: curPrice * qty,
          expectedYield,
        };
      })
    );

    return NextResponse.json({
      id: sandbox.id,
      tinkoffAccountId: sandbox.tinkoffAccountId,
      balance: totalAmount,
      initialBalance: INITIAL_BALANCE,
      positions,
      createdAt: sandbox.createdAt,
    });
  } catch (err: any) {
    return NextResponse.json({
      id: sandbox.id,
      tinkoffAccountId: sandbox.tinkoffAccountId,
      balance: Number(sandbox.balance),
      initialBalance: INITIAL_BALANCE,
      positions: [],
      createdAt: sandbox.createdAt,
      error: "Не удалось загрузить портфель",
    });
  }
}

/**
 * DELETE /api/sandbox/account — close and reset sandbox account
 */
export async function DELETE() {
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
    await closeSandboxAccount(sandbox.tinkoffAccountId);
  } catch { /* ignore if already closed */ }

  // Create a fresh new one
  try {
    const tinkoffAccountId = await openSandboxAccount();
    await sandboxPayIn(tinkoffAccountId, "RUB", INITIAL_BALANCE);

    await prisma.sandboxAccount.update({
      where: { userId: session.user.id },
      data: { tinkoffAccountId, balance: INITIAL_BALANCE },
    });

    return NextResponse.json({ ok: true, message: "Демо-счёт сброшен" });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Ошибка сброса: " + err.message },
      { status: 500 }
    );
  }
}
