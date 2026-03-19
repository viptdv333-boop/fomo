/**
 * Tinkoff Sandbox API client for demo trading.
 * Sandbox URL is same as production but on sandbox subdomain.
 * Uses the same token.
 */

const SANDBOX_URL =
  "https://sandbox-invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1";
const TINKOFF_TOKEN = process.env.TINKOFF_TOKEN || "";

export function parseQuotation(q: { units?: string; nano?: number } | null): number {
  if (!q) return 0;
  return parseInt(q.units || "0") + (q.nano || 0) / 1_000_000_000;
}

export function toQuotation(value: number): { units: string; nano: number } {
  const units = Math.trunc(value);
  const nano = Math.round((value - units) * 1_000_000_000);
  return { units: String(units), nano };
}

async function sandboxRequest(endpoint: string, body: object): Promise<any> {
  const res = await fetch(`${SANDBOX_URL}.${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TINKOFF_TOKEN}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sandbox API error ${res.status}: ${text}`);
  }
  return res.json();
}

/* ── Account management ── */

export async function openSandboxAccount(): Promise<string> {
  const data = await sandboxRequest("SandboxService/OpenSandboxAccount", {});
  return data.accountId;
}

export async function closeSandboxAccount(accountId: string): Promise<void> {
  await sandboxRequest("SandboxService/CloseSandboxAccount", { accountId });
}

export async function getSandboxAccounts(): Promise<any[]> {
  const data = await sandboxRequest("SandboxService/GetSandboxAccounts", {});
  return data.accounts || [];
}

/* ── Balance ── */

export async function sandboxPayIn(
  accountId: string,
  currency: string,
  amount: number
): Promise<any> {
  return sandboxRequest("SandboxService/SandboxPayIn", {
    accountId,
    amount: { currency, ...toQuotation(amount) },
  });
}

/* ── Portfolio ── */

export async function getSandboxPortfolio(accountId: string): Promise<any> {
  return sandboxRequest("SandboxService/GetSandboxPortfolio", {
    accountId,
    currency: "RUB",
  });
}

export async function getSandboxPositions(accountId: string): Promise<any> {
  return sandboxRequest("SandboxService/GetSandboxPositions", { accountId });
}

/* ── Orders ── */

export interface OrderParams {
  accountId: string;
  instrumentId: string; // e.g. "SBER_TQBR"
  quantity: number;
  direction: "ORDER_DIRECTION_BUY" | "ORDER_DIRECTION_SELL";
  orderType: "ORDER_TYPE_MARKET" | "ORDER_TYPE_LIMIT";
  price?: number; // only for limit orders
}

export async function postSandboxOrder(params: OrderParams): Promise<any> {
  const body: any = {
    accountId: params.accountId,
    instrumentId: params.instrumentId,
    quantity: String(params.quantity),
    direction: params.direction,
    orderType: params.orderType,
    orderId: crypto.randomUUID(),
  };
  if (params.orderType === "ORDER_TYPE_LIMIT" && params.price != null) {
    body.price = toQuotation(params.price);
  }
  return sandboxRequest("SandboxService/PostSandboxOrder", body);
}

export async function cancelSandboxOrder(
  accountId: string,
  orderId: string
): Promise<any> {
  return sandboxRequest("SandboxService/CancelSandboxOrder", {
    accountId,
    orderId,
  });
}

export async function getSandboxOrders(accountId: string): Promise<any> {
  return sandboxRequest("SandboxService/GetSandboxOrders", { accountId });
}

/* ── Operations ── */

export async function getSandboxOperations(
  accountId: string,
  from?: string,
  to?: string
): Promise<any> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 30 * 86400_000);
  return sandboxRequest("SandboxService/GetSandboxOperations", {
    accountId,
    from: from || weekAgo.toISOString(),
    to: to || now.toISOString(),
  });
}

/* ── Instrument lookup ── */

const SHARE_TICKERS = new Set(["SBER", "GAZP", "LKOH", "YDEX", "ROSN"]);
const FUTURES_PREFIX: Record<string, string> = {
  BR: "BR", GOLD: "GD", SILV: "SV", PLT: "PT", PLD: "PD",
  NG: "NG", WHEAT: "W4", COCOA: "CC", SUGAR: "SA", CU: "CE",
  Si: "Si", Eu: "Eu", CR: "CR",
  NASD: "NA", SPYF: "SF", MIX: "MX", RTS: "RI", BTCF: "BT",
};

const contractCache = new Map<string, { contract: string; resolved: number }>();

export async function resolveInstrumentId(ticker: string): Promise<string> {
  if (SHARE_TICKERS.has(ticker)) {
    return `${ticker}_TQBR`;
  }
  if (FUTURES_PREFIX[ticker]) {
    const contract = await findActiveContract(ticker);
    if (contract) return `${contract}_SPBFUT`;
    return `${ticker}_SPBFUT`;
  }
  return `${ticker}_TQBR`;
}

async function findActiveContract(baseTicker: string): Promise<string | null> {
  const prefix = FUTURES_PREFIX[baseTicker];
  if (!prefix) return null;
  const cached = contractCache.get(baseTicker);
  if (cached && Date.now() - cached.resolved < 3600_000) return cached.contract;
  try {
    const url =
      "https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities.json?iss.meta=off&iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data.securities?.data;
    if (!rows) return null;
    const today = new Date().toISOString().slice(0, 10);
    const candidates = rows
      .filter(
        (r: any[]) =>
          (r[0] as string).startsWith(prefix) &&
          r[0] !== baseTicker &&
          r[2] &&
          (r[2] as string) >= today
      )
      .sort((a: any[], b: any[]) => (a[2] as string).localeCompare(b[2] as string));
    const contract = candidates.length > 0 ? (candidates[0][0] as string) : null;
    if (contract) contractCache.set(baseTicker, { contract, resolved: Date.now() });
    return contract;
  } catch {
    return null;
  }
}
