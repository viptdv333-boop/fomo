"use client";

import { useEffect, useState } from "react";

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

export default function PaymentMethodsManager() {
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

  async function loadMethods() {
    const res = await fetch("/api/payment-methods");
    if (res.ok) setMethods(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadMethods(); }, []);

  async function handleAdd() {
    if (!addLabel.trim()) return;
    setSaving(true);

    const details: any = {};
    if (addType === "card") details.cardNumber = addCardNumber.trim();
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
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Способы оплаты</h3>
        <button onClick={() => setShowAdd(!showAdd)}
          className="text-sm text-green-600 hover:text-green-700 font-medium">
          {showAdd ? "Отмена" : "+ Добавить"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Тип</label>
            <select value={addType} onChange={(e) => setAddType(e.target.value)}
              className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100">
              <option value="card">💳 Банковская карта</option>
              <option value="yukassa">🏦 ЮKassa</option>
              <option value="crypto">₿ Крипто</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Название (для вас)</label>
            <input type="text" value={addLabel} onChange={(e) => setAddLabel(e.target.value)}
              placeholder="Тинькофф, Сбер, ЮMoney..."
              className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
          </div>
          {addType === "card" && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Номер карты</label>
              <input type="text" value={addCardNumber} onChange={(e) => setAddCardNumber(e.target.value)}
                placeholder="0000 0000 0000 0000"
                className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
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
            </>
          )}
          <button onClick={handleAdd} disabled={saving || !addLabel.trim()}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "..." : "Сохранить"}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-sm text-gray-400 py-4 text-center">Загрузка...</div>
      ) : methods.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center">Нет сохранённых способов оплаты</div>
      ) : (
        <div className="space-y-2">
          {methods.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg group">
              <span className="text-lg">{TYPE_ICONS[m.type] || "💳"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium dark:text-gray-100 flex items-center gap-2">
                  {m.label}
                  {m.isDefault && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded">По умолч.</span>}
                </div>
                <div className="text-xs text-gray-400">
                  {TYPE_LABELS[m.type] || m.type}
                  {m.details?.cardNumber && ` · *${m.details.cardNumber.slice(-4)}`}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                {!m.isDefault && (
                  <button onClick={() => handleSetDefault(m.id)} className="text-xs text-green-600 hover:text-green-700">По умолч.</button>
                )}
                <button onClick={() => handleDelete(m.id)} className="text-xs text-red-500 hover:text-red-700">Удалить</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
