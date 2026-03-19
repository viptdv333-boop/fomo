import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSandboxOperations, parseQuotation } from "@/lib/tinkoff-sandbox";

/**
 * GET /api/sandbox/operations — list recent operations (trades)
 */
export async function GET(request: NextRequest) {
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
    const data = await getSandboxOperations(sandbox.tinkoffAccountId);
    const operations = (data.operations || []).map((op: any) => ({
      id: op.id,
      type: op.operationType,
      state: op.state,
      instrumentUid: op.instrumentUid || op.figi,
      payment: parseQuotation(op.payment),
      price: parseQuotation(op.price),
      quantity: parseInt(op.quantity || "0"),
      date: op.date,
      description: op.description || "",
    }));

    return NextResponse.json({ operations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
