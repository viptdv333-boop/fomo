/**
 * YuKassa (ЮKassa) API client
 * Docs: https://yookassa.ru/developers/api
 */

const YUKASSA_API = "https://api.yookassa.ru/v3";

interface CreatePaymentParams {
  shopId: string;
  secretKey: string;
  amount: number;
  currency?: string;
  description: string;
  returnUrl: string;
  metadata?: Record<string, string>;
  idempotenceKey: string;
}

interface YukassaPayment {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  description?: string;
  metadata?: Record<string, string>;
  created_at: string;
  paid: boolean;
}

export async function createYukassaPayment(params: CreatePaymentParams): Promise<YukassaPayment> {
  const auth = Buffer.from(`${params.shopId}:${params.secretKey}`).toString("base64");

  const response = await fetch(`${YUKASSA_API}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
      "Idempotence-Key": params.idempotenceKey,
    },
    body: JSON.stringify({
      amount: {
        value: params.amount.toFixed(2),
        currency: params.currency || "RUB",
      },
      confirmation: {
        type: "redirect",
        return_url: params.returnUrl,
      },
      capture: true,
      description: params.description,
      metadata: params.metadata || {},
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[yukassa] Payment creation failed:", response.status, error);
    throw new Error(`YuKassa API error: ${response.status}`);
  }

  return response.json();
}

export async function getYukassaPayment(
  shopId: string,
  secretKey: string,
  paymentId: string
): Promise<YukassaPayment> {
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");

  const response = await fetch(`${YUKASSA_API}/payments/${paymentId}`, {
    headers: {
      "Authorization": `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`YuKassa API error: ${response.status}`);
  }

  return response.json();
}
