"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ShareButtons from "@/components/shared/ShareButtons";

interface TariffRow {
  name: string;
  price: string;
  durationDays: string;
  paymentMethods: ("card" | "yukassa")[];
  cardNumber: string;
  yukassaShopId: string;
  yukassaSecret: string;
}

export default function CreateChannelPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.user as any;

  const [channelName, setChannelName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [description, setDescription] = useState("");
  const [tariffs, setTariffs] = useState<TariffRow[]>([
    { name: "Базовый", price: "", durationDays: "30", paymentMethods: ["card"], cardNumber: "", yukassaShopId: "", yukassaSecret: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addTariff() {
    setTariffs([...tariffs, { name: "", price: "", durationDays: "30", paymentMethods: ["card"], cardNumber: "", yukassaShopId: "", yukassaSecret: "" }]);
  }

  function removeTariff(index: number) {
    setTariffs(tariffs.filter((_, i) => i !== index));
  }

  function updateTariff(index: number, field: keyof TariffRow, value: any) {
    const updated = [...tariffs];
    updated[index] = { ...updated[index], [field]: value };
    setTariffs(updated);
  }

  function togglePaymentMethod(index: number, method: "card" | "yukassa") {
    const current = tariffs[index].paymentMethods;
    const updated = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    updateTariff(index, "paymentMethods", updated);
  }

  function handleChannelIdChange(value: string) {
    const clean = value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
    setChannelId(clean);
  }

  async function handleCreate() {
    setError("");
    if (!channelName.trim()) {
      setError("Укажите название канала");
      return;
    }

    const validTariffs = tariffs.filter((t) => t.name.trim() && t.price);
    if (validTariffs.length === 0) {
      setError("Добавьте хотя бы один тариф с ценой");
      return;
    }

    for (const t of validTariffs) {
      const p = parseFloat(t.price);
      if (isNaN(p) || p <= 0) {
        setError(`Некорректная цена в тарифе "${t.name}"`);
        return;
      }
      if (t.paymentMethods.length === 0) {
        setError(`Выберите способ оплаты для тарифа "${t.name}"`);
        return;
      }
      if (t.paymentMethods.includes("card") && !t.cardNumber.trim()) {
        setError(`Укажите номер карты для тарифа "${t.name}"`);
        return;
      }
      if (t.paymentMethods.includes("yukassa") && (!t.yukassaShopId.trim() || !t.yukassaSecret.trim())) {
        setError(`Укажите настройки ЮKassa для тарифа "${t.name}"`);
        return;
      }
    }

    setSaving(true);

    let allOk = true;
    for (const t of validTariffs) {
      const res = await fetch(`/api/users/${user?.id}/tariffs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${channelName}: ${t.name}`.trim(),
          description: description.trim() || undefined,
          price: parseFloat(t.price),
          durationDays: parseInt(t.durationDays) || 30,
          paymentMethods: t.paymentMethods,
          cardNumber: t.paymentMethods.includes("card") ? t.cardNumber.trim() : undefined,
          yukassaShopId: t.paymentMethods.includes("yukassa") ? t.yukassaShopId.trim() : undefined,
          yukassaSecret: t.paymentMethods.includes("yukassa") ? t.yukassaSecret.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Ошибка создания тарифа");
        allOk = false;
        break;
      }
    }

    setSaving(false);

    if (allOk) {
      router.push("/subscriptions");
    }
  }

  const channelUrl = channelId ? `https://fomo.broker/channels/${channelId}` : "";
  const channelUrlDisplay = channelId ? `fomo.broker/channels/${channelId}` : "fomo.broker/channels/...";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Создать канал</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 space-y-5">
        {/* Channel name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Название канала
          </label>
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Мой трейдинг-канал"
          />
        </div>

        {/* Channel ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            ID канала
          </label>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 dark:text-gray-500 text-sm font-mono">#</span>
            <input
              type="text"
              value={channelId}
              onChange={(e) => handleChannelIdChange(e.target.value)}
              className="flex-1 px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 font-mono"
              placeholder="my_channel"
              maxLength={30}
            />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Прямая ссылка: <span className="font-mono text-blue-600 dark:text-blue-400">{channelUrlDisplay}</span>
            </p>
            {channelId && (
              <ShareButtons url={channelUrl} text={`Канал "${channelName}" на FOMO`} />
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Описание
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Опишите, что получат подписчики канала..."
          />
        </div>

        {/* Tariffs */}
        <div className="border-t dark:border-gray-700 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Тарифы</h3>
            <button
              type="button"
              onClick={addTariff}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Добавить тариф
            </button>
          </div>

          <div className="space-y-4">
            {tariffs.map((t, i) => (
              <div
                key={i}
                className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Тариф {i + 1}
                  </span>
                  {tariffs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTariff(i)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Удалить
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Название</label>
                  <input
                    type="text"
                    value={t.name}
                    onChange={(e) => updateTariff(i, "name", e.target.value)}
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                    placeholder="Базовый / Премиум / VIP"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Цена (₽)</label>
                    <input
                      type="number"
                      value={t.price}
                      onChange={(e) => updateTariff(i, "price", e.target.value)}
                      className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                      placeholder="500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Срок (дней)</label>
                    <input
                      type="number"
                      value={t.durationDays}
                      onChange={(e) => updateTariff(i, "durationDays", e.target.value)}
                      className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                      placeholder="30"
                    />
                  </div>
                </div>

                {/* Payment methods */}
                <div className="border-t dark:border-gray-700 pt-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">Способы оплаты</label>
                  <div className="space-y-3">
                    {/* Card transfer */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={t.paymentMethods.includes("card")}
                          onChange={() => togglePaymentMethod(i, "card")}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">💳 Перевод на карту</span>
                          <span className="text-xs text-gray-400 ml-1">(полуавтоматический)</span>
                        </div>
                      </label>
                      {t.paymentMethods.includes("card") && (
                        <div className="mt-2 ml-6">
                          <input
                            type="text"
                            value={t.cardNumber}
                            onChange={(e) => updateTariff(i, "cardNumber", e.target.value)}
                            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                            placeholder="0000 0000 0000 0000"
                          />
                          <p className="text-[11px] text-gray-400 mt-1">
                            Покупатель переводит на эту карту и присылает квитанцию. Вы подтверждаете получение.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* YuKassa */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={t.paymentMethods.includes("yukassa")}
                          onChange={() => togglePaymentMethod(i, "yukassa")}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">🏦 ЮKassa</span>
                          <span className="text-xs text-gray-400 ml-1">(автоматический)</span>
                        </div>
                      </label>
                      {t.paymentMethods.includes("yukassa") && (
                        <div className="mt-2 ml-6 space-y-2">
                          <div>
                            <label className="block text-[11px] text-gray-400 mb-0.5">Shop ID</label>
                            <input
                              type="text"
                              value={t.yukassaShopId}
                              onChange={(e) => updateTariff(i, "yukassaShopId", e.target.value)}
                              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                              placeholder="123456"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-gray-400 mb-0.5">Секретный ключ</label>
                            <input
                              type="password"
                              value={t.yukassaSecret}
                              onChange={(e) => updateTariff(i, "yukassaSecret", e.target.value)}
                              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                              placeholder="live_..."
                            />
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Получите ключи в{" "}
                            <a href="https://yookassa.ru/my/merchant/integration/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                              личном кабинете ЮKassa
                            </a>
                            . Оплата проходит автоматически.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
            {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={saving}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? "Создание..." : "Создать канал"}
        </button>
      </div>
    </div>
  );
}
