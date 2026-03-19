"use client";

import { useState, useEffect, useCallback } from "react";

interface SandboxAccount {
  id: string;
  tinkoffAccountId: string;
  balance: number;
  initialBalance: number;
  positions: Position[];
  error?: string;
}

interface Position {
  instrumentId: string;
  instrumentType: string;
  name: string;
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  currentValue: number;
  expectedYield: number;
}

interface Order {
  orderId: string;
  instrumentId: string;
  direction: string;
  orderType: string;
  status: string;
  lotsRequested: number;
  lotsExecuted: number;
  price: number;
  totalPrice: number;
  createdAt: string;
}

interface Operation {
  id: string;
  type: string;
  state: string;
  instrumentUid: string;
  payment: number;
  price: number;
  quantity: number;
  date: string;
  description: string;
}

interface Props {
  selectedTicker?: string;
  selectedName?: string;
}

type Tab = "trade" | "portfolio" | "orders" | "history";

export default function SandboxPanel({ selectedTicker, selectedName }: Props) {
  const [account, setAccount] = useState<SandboxAccount | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("trade");

  // Order form state
  const [quantity, setQuantity] = useState("1");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderResult, setOrderResult] = useState("");

  /* ── Load account ── */
  const loadAccount = useCallback(async () => {
    try {
      const r = await fetch("/api/sandbox/account");
      if (r.status === 401) {
        setError("auth");
        setLoading(false);
        return;
      }
      const data = await r.json();
      if (data.error && !data.id) {
        setError(data.error);
      } else {
        setAccount(data);
        setError("");
      }
    } catch {
      setError("Ошибка загрузки");
    }
    setLoading(false);
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const r = await fetch("/api/sandbox/orders");
      if (r.ok) {
        const data = await r.json();
        setOrders(data.orders || []);
      }
    } catch { /* */ }
  }, []);

  const loadOperations = useCallback(async () => {
    try {
      const r = await fetch("/api/sandbox/operations");
      if (r.ok) {
        const data = await r.json();
        setOperations(data.operations || []);
      }
    } catch { /* */ }
  }, []);

  useEffect(() => {
    loadAccount();
    // Auto-refresh portfolio every 30 seconds
    const interval = setInterval(loadAccount, 30000);
    return () => clearInterval(interval);
  }, [loadAccount]);

  useEffect(() => {
    if (tab === "orders") loadOrders();
    if (tab === "history") loadOperations();
  }, [tab, loadOrders, loadOperations]);

  /* ── Place order ── */
  async function placeOrder(direction: "buy" | "sell") {
    if (!selectedTicker) return;
    setOrderLoading(true);
    setOrderResult("");
    try {
      const r = await fetch("/api/sandbox/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: selectedTicker,
          quantity,
          direction,
          orderType,
          price: orderType === "limit" ? limitPrice : undefined,
        }),
      });
      const data = await r.json();
      if (data.error) {
        setOrderResult(`Ошибка: ${data.error}`);
      } else {
        setOrderResult(
          `${direction === "buy" ? "Покупка" : "Продажа"}: ${data.message || "OK"} ` +
          (data.executedPrice ? `по ${data.executedPrice.toFixed(2)}₽` : "")
        );
        // Refresh portfolio
        setTimeout(loadAccount, 1000);
      }
    } catch {
      setOrderResult("Ошибка отправки ордера");
    }
    setOrderLoading(false);
  }

  /* ── Reset account ── */
  async function resetAccount() {
    if (!confirm("Сбросить демо-счёт? Все позиции и история будут удалены.")) return;
    setLoading(true);
    try {
      await fetch("/api/sandbox/account", { method: "DELETE" });
      await loadAccount();
    } catch {
      setError("Ошибка сброса");
    }
    setLoading(false);
  }

  /* ── Cancel order ── */
  async function cancelOrder(orderId: string) {
    try {
      await fetch("/api/sandbox/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      loadOrders();
    } catch { /* */ }
  }

  const formatMoney = (n: number) =>
    new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(n);

  /* ── Not logged in ── */
  if (error === "auth") {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-4 text-center">
        <div className="text-2xl mb-2">🏦</div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Войдите в аккаунт, чтобы торговать на демо-счёте
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold dark:text-gray-100">Демо-счёт</span>
          {account && (
            <span className={`text-xs font-mono ${
              account.balance >= account.initialBalance ? "text-green-500" : "text-red-500"
            }`}>
              {formatMoney(account.balance)}
            </span>
          )}
        </div>
        <button
          onClick={resetAccount}
          className="text-[10px] text-gray-400 hover:text-red-500 transition"
          title="Сбросить счёт"
        >
          ↺ Сброс
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b dark:border-gray-800">
        {([
          { key: "trade", label: "Торговля" },
          { key: "portfolio", label: "Портфель" },
          { key: "orders", label: "Ордера" },
          { key: "history", label: "История" },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-1.5 text-[11px] font-medium transition ${
              tab === t.key
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0" style={{ maxHeight: 300 }}>
        {loading ? (
          <div className="text-center py-4 text-gray-400 text-xs">Загрузка...</div>
        ) : error ? (
          <div className="text-center py-4 text-red-400 text-xs">{error}</div>
        ) : (
          <>
            {/* ══ TRADE TAB ══ */}
            {tab === "trade" && (
              <div className="space-y-3">
                {!selectedTicker ? (
                  <p className="text-xs text-gray-400 text-center py-4">
                    Выберите инструмент из списка
                  </p>
                ) : (
                  <>
                    <div className="text-xs font-medium dark:text-gray-200">
                      {selectedName || selectedTicker}
                      <span className="text-gray-400 font-mono ml-2">{selectedTicker}</span>
                    </div>

                    {/* Quantity */}
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Количество (лотов)</label>
                      <input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full px-2 py-1.5 border dark:border-gray-700 rounded text-xs dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>

                    {/* Order type */}
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Тип ордера</label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setOrderType("market")}
                          className={`flex-1 py-1 rounded text-[11px] font-medium ${
                            orderType === "market"
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                          }`}
                        >
                          Рыночный
                        </button>
                        <button
                          onClick={() => setOrderType("limit")}
                          className={`flex-1 py-1 rounded text-[11px] font-medium ${
                            orderType === "limit"
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                          }`}
                        >
                          Лимитный
                        </button>
                      </div>
                    </div>

                    {/* Limit price */}
                    {orderType === "limit" && (
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Цена</label>
                        <input
                          type="number"
                          step="0.01"
                          value={limitPrice}
                          onChange={(e) => setLimitPrice(e.target.value)}
                          className="w-full px-2 py-1.5 border dark:border-gray-700 rounded text-xs dark:bg-gray-800 dark:text-gray-100"
                          placeholder="0.00"
                        />
                      </div>
                    )}

                    {/* Buy/Sell buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => placeOrder("buy")}
                        disabled={orderLoading}
                        className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition disabled:opacity-50"
                      >
                        {orderLoading ? "..." : "Купить"}
                      </button>
                      <button
                        onClick={() => placeOrder("sell")}
                        disabled={orderLoading}
                        className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition disabled:opacity-50"
                      >
                        {orderLoading ? "..." : "Продать"}
                      </button>
                    </div>

                    {/* Order result */}
                    {orderResult && (
                      <div className={`text-[11px] p-2 rounded ${
                        orderResult.startsWith("Ошибка")
                          ? "bg-red-50 dark:bg-red-900/20 text-red-600"
                          : "bg-green-50 dark:bg-green-900/20 text-green-600"
                      }`}>
                        {orderResult}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ══ PORTFOLIO TAB ══ */}
            {tab === "portfolio" && (
              <div className="space-y-2">
                {account && (
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-gray-500">Баланс:</span>
                    <span className="font-mono font-medium dark:text-gray-100">{formatMoney(account.balance)}</span>
                  </div>
                )}
                {account && account.positions.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Нет открытых позиций</p>
                ) : (
                  account?.positions.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b dark:border-gray-800 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium dark:text-gray-200 truncate">{p.name || p.ticker || "—"}</div>
                        <div className="text-[10px] text-gray-400">
                          <span className="font-mono">{p.ticker}</span> • {p.quantity} шт. × {p.averagePrice.toFixed(2)}₽
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="text-xs font-mono dark:text-gray-200">{formatMoney(p.currentValue)}</div>
                        <div className={`text-[10px] font-mono ${p.expectedYield >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {p.expectedYield >= 0 ? "+" : ""}{p.expectedYield.toFixed(2)}₽
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <button
                  onClick={loadAccount}
                  className="w-full py-1.5 text-[11px] text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded transition"
                >
                  Обновить
                </button>
              </div>
            )}

            {/* ══ ORDERS TAB ══ */}
            {tab === "orders" && (
              <div className="space-y-2">
                {orders.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Нет активных ордеров</p>
                ) : (
                  orders.map((o) => (
                    <div key={o.orderId} className="flex items-center justify-between py-1.5 border-b dark:border-gray-800 last:border-0">
                      <div>
                        <div className="text-xs font-mono dark:text-gray-200">{o.instrumentId?.slice(0, 12)}</div>
                        <div className="text-[10px] text-gray-400">
                          {o.direction?.includes("BUY") ? "Покупка" : "Продажа"} • {o.lotsRequested} лот
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">{o.price.toFixed(2)}₽</span>
                        <button
                          onClick={() => cancelOrder(o.orderId)}
                          className="text-[10px] text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
                <button
                  onClick={loadOrders}
                  className="w-full py-1.5 text-[11px] text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded transition"
                >
                  Обновить
                </button>
              </div>
            )}

            {/* ══ HISTORY TAB ══ */}
            {tab === "history" && (
              <div className="space-y-1">
                {operations.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Нет операций</p>
                ) : (
                  operations.slice(0, 50).map((op) => (
                    <div key={op.id} className="flex items-center justify-between py-1 border-b dark:border-gray-800 last:border-0">
                      <div>
                        <div className="text-[11px] dark:text-gray-200">{op.description || op.type}</div>
                        <div className="text-[10px] text-gray-400">
                          {op.date ? new Date(op.date).toLocaleString("ru-RU") : "—"}
                        </div>
                      </div>
                      <span className={`text-xs font-mono ${op.payment >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {op.payment >= 0 ? "+" : ""}{op.payment.toFixed(2)}₽
                      </span>
                    </div>
                  ))
                )}
                <button
                  onClick={loadOperations}
                  className="w-full py-1.5 text-[11px] text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded transition"
                >
                  Обновить
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
