"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

interface PaymentMethod {
  id: string;
  type: string;
  label: string;
  details: any;
  isDefault: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  card: "💳",
  yukassa: "🏦",
  crypto: "₿",
};

const TYPE_LABELS: Record<string, string> = {
  card: "Банковская карта",
  yukassa: "ЮKassa",
  crypto: "Криптокошелёк",
};

function detectCardType(num: string): string {
  const n = num.replace(/\s/g, "");
  if (/^2[0-9]{15}$/.test(n)) return "МИР";
  if (/^4[0-9]{12,18}$/.test(n)) return "Visa";
  if (/^5[1-5][0-9]{14}$/.test(n)) return "Mastercard";
  if (/^3[47][0-9]{13}$/.test(n)) return "AmEx";
  if (/^(62|81)[0-9]{14,17}$/.test(n)) return "UnionPay";
  return "";
}

function validateCardNumber(num: string): string | null {
  const clean = num.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(clean)) return "Только цифры";
  if (clean.length < 13) return "Минимум 13 цифр";
  if (clean.length > 19) return "Максимум 19 цифр";
  // Luhn check
  let sum = 0;
  let alt = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let d = parseInt(clean[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  if (sum % 10 !== 0) return "Неверный номер карты";
  return null;
}

function formatCardInput(val: string): string {
  const clean = val.replace(/\D/g, "").slice(0, 19);
  return clean.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export default function PaymentMethodsManager() {
  const { t } = useT();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add form
  const [addType, setAddType] = useState("card");
  const [addLabel, setAddLabel] = useState("");
  const [addCardNumber, setAddCardNumber] = useState("");
  const [addYukassaShopId, setAddYukassaShopId] = useState("");
  const [addYukassaSecret, setAddYukassaSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardType, setCardType] = useState("");

  async function loadMethods() {
    const res = await fetch("/api/payment-methods");
    if (res.ok) setMethods(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadMethods(); }, []);

  async function handleAdd() {
    if (!addLabel.trim()) return;
    if (addType === "card") {
      const err = validateCardNumber(addCardNumber);
      if (err) { setCardError(err); return; }
    }
    setSaving(true);

    const details: any = {};
    const cleanCard = addCardNumber.replace(/\s/g, "");
    if (addType === "card") details.cardNumber = cleanCard;
    if (addType === "yukassa") {
      details.yukassaShopId = addYukassaShopId.trim();
      details.yukassaSecret = addYukassaSecret.trim();
    }

    await fetch("/api/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: addType,
        label: addLabel.trim(),
        details,
        isDefault: methods.length === 0,
      }),
    });

    setAddLabel(""); setAddCardNumber(""); setAddYukassaShopId(""); setAddYukassaSecret("");
    setShowAdd(false);
    setSaving(false);
    loadMethods();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить способ оплаты?")) return;
    await fetch(`/api/payment-methods?id=${id}`, { method: "DELETE" });
    loadMethods();
  }

  async function handleSetDefault(id: string) {
    await fetch("/api/payment-methods", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isDefault: true }),
    });
    loadMethods();
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("pm.title")}</h3>
        <button onClick={() => setShowAdd(!showAdd)}
          className="text-sm text-green-600 hover:text-green-700 font-medium">
          {showAdd ? t("common.cancel") : t("pm.add")}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">{t("pm.type")}</label>
            <select value={addType} onChange={(e) => setAddType(e.target.value)}
              className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100">
              <option value="card">💳 Банковская карта</option>
              <option value="yukassa">🏦 ЮKassa</option>
              <option value="crypto">₿ Крипто</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">{t("pm.label")}</label>
            <input type="text" value={addLabel} onChange={(e) => setAddLabel(e.target.value)}
              placeholder="Тинькофф, Сбер, ЮMoney..."
              className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
          </div>
          {addType === "card" && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                {t("pm.cardNumber")}
                {cardType && <span className="text-green-600 font-medium">{cardType}</span>}
              </label>
              <input type="text" value={addCardNumber}
                onChange={(e) => {
                  const formatted = formatCardInput(e.target.value);
                  setAddCardNumber(formatted);
                  setCardError(null);
                  setCardType(detectCardType(formatted));
                }}
                placeholder="0000 0000 0000 0000"
                maxLength={23}
                className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 font-mono tracking-wider ${
                  cardError ? "border-red-500" : "dark:border-gray-700"
                }`} />
              {cardError && <p className="text-xs text-red-500 mt-1">{cardError}</p>}
            </div>
          )}
          {addType === "yukassa" && (
            <>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Shop ID</label>
                <input type="text" value={addYukassaShopId} onChange={(e) => setAddYukassaShopId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Secret Key</label>
                <input type="text" value={addYukassaSecret} onChange={(e) => setAddYukassaSecret(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-200">
                <div className="font-semibold mb-1">⚙️ Настройте webhook в ЮКассе</div>
                <div className="mb-2">В личном кабинете ЮКассы → <b>Интеграция → HTTP-уведомления</b> добавьте URL:</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white dark:bg-gray-900 px-2 py-1 rounded font-mono text-[11px] break-all">https://fomo.spot/api/yukassa/webhook</code>
                  <button type="button" onClick={() => navigator.clipboard?.writeText("https://fomo.spot/api/yukassa/webhook")}
                    className="text-blue-700 dark:text-blue-300 hover:underline whitespace-nowrap">Копировать</button>
                </div>
                <div className="mt-2">Включите события: <code>payment.succeeded</code>, <code>payment.canceled</code>.</div>
              </div>
            </>
          )}
          <button onClick={handleAdd} disabled={saving || !addLabel.trim()}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "..." : t("common.save")}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-sm text-gray-400 py-4 text-center">...</div>
      ) : methods.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center">{t("pm.noMethods")}</div>
      ) : (
        <div className="space-y-2">
          {methods.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg group">
              <span className="text-lg">{TYPE_ICONS[m.type] || "💳"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium dark:text-gray-100 flex items-center gap-2">
                  {m.label}
                  {m.isDefault && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded">{t("pm.default")}</span>}
                </div>
                <div className="text-xs text-gray-400">
                  {TYPE_LABELS[m.type] || m.type}
                  {m.details?.cardNumber && ` · *${m.details.cardNumber.slice(-4)}`}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                {!m.isDefault && (
                  <button onClick={() => handleSetDefault(m.id)} className="text-xs text-green-600 hover:text-green-700">{t("pm.default")}</button>
                )}
                <button onClick={() => handleDelete(m.id)} className="text-xs text-red-500 hover:text-red-700">{t("common.delete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
