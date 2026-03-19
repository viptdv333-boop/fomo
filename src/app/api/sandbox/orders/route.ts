import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  postSandboxOrder,
  cancelSandboxOrder,
  getSandboxOrders,
  resolveInstrumentId,
  parseQuotation,
  type OrderParams,
} from "@/lib/tinkoff-sandbox";

/**
 * GET /api/sandbox/orders — list active orders
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
    const data = await getSandboxOrders(sandbox.tinkoffAccountId);
    const orders = (data.orders || []).map((o: any) => ({
      orderId: o.orderId,
      instrumentId: o.instrumentUid || o.figi,
      direction: o.direction,
      orderType: o.orderType,
      status: o.executionReportStatus,
      lotsRequested: parseInt(o.lotsRequested || "0"),
      lotsExecuted: parseInt(o.lotsExecuted || "0"),
      price: parseQuotation(o.initialSecurityPrice),
      totalPrice: parseQuotation(o.totalOrderAmount),
      createdAt: o.orderDate,
    }));

    return NextResponse.json({ orders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/sandbox/orders — place a new order
 * Body: { ticker, quantity, direction: "buy"|"sell", orderType: "market"|"limit", price? }
 */
export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const { ticker, quantity, direction, orderType, price } = body;

  if (!ticker || !quantity || !direction) {
    return NextResponse.json({ error: "ticker, quantity, direction required" }, { status: 400 });
  }

  try {
    const instrumentId = await resolveInstrumentId(ticker);
    const params: OrderParams = {
      accountId: sandbox.tinkoffAccountId,
      instrumentId,
      quantity: parseInt(quantity),
      direction: direction === "buy" ? "ORDER_DIRECTION_BUY" : "ORDER_DIRECTION_SELL",
      orderType: orderType === "limit" ? "ORDER_TYPE_LIMIT" : "ORDER_TYPE_MARKET",
      price: price ? parseFloat(price) : undefined,
    };

    const result = await postSandboxOrder(params);
    return NextResponse.json({
      orderId: result.orderId,
      status: result.executionReportStatus,
      executedPrice: parseQuotation(result.executedOrderPrice),
      totalPrice: parseQuotation(result.totalOrderAmount),
      commission: parseQuotation(result.executedCommission),
      message: result.message || "Ордер выполнен",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/sandbox/orders — cancel an order
 * Body: { orderId }
 */
export async function DELETE(request: NextRequest) {
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

  const body = await request.json();
  if (!body.orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  try {
    await cancelSandboxOrder(sandbox.tinkoffAccountId, body.orderId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
