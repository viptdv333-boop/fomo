"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import ShareButtons from "@/components/shared/ShareButtons";

interface SavedPaymentMethod {
  id: string;
  type: string;
  label: string;
  details: any;
  isDefault: boolean;
}

interface TariffRow {
  name: string;
  price: string;
  durationDays: string;
  paymentMethodId: string; // ID of saved payment method
  paymentMethods: ("card" | "yukassa")[];
  cardNumber: string;
  yukassaShopId: string;
  yukassaSecret: string;
}

export default function CreateChannelPage() {
  const { t } = useT();
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.user as any;

  const [channelName, setChannelName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [tariffs, setTariffs] = useState<TariffRow[]>([
    { name: "Базовый", price: "", durationDays: "30", paymentMethodId: "", paymentMethods: ["card"], cardNumber: "", yukassaShopId: "", yukassaSecret: "" },
  ]);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);

  useEffect(() => {
    fetch("/api/payment-methods").then((r) => r.json()).then(setSavedPaymentMethods).catch(() => {});
  }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Instrument tags (hashtags)
  const [selectedTags, setSelectedTags] = useState<{ id: string; name: string; ticker: string | null; slug: string }[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [tagResults, setTagResults] = useState<any[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagCategories, setTagCategories] = useState<any[]>([]);
  const [tagExpanded, setTagExpanded] = useState<Set<string>>(new Set());

  function addTariff() {
    setTariffs([...tariffs, { name: "", price: "", durationDays: "30", paymentMethodId: "", paymentMethods: ["card"], cardNumber: "", yukassaShopId: "", yukassaSecret: "" }]);
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
      if (!t.paymentMethodId && savedPaymentMethods.length > 0) {
        setError(`Выберите способ оплаты для тарифа "${t.name}"`);
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
          avatarUrl: avatarUrl || undefined,
          instrumentIds: selectedTags.map((tag) => tag.id),
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
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">{t("channels.create")}</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 space-y-5">
        {/* Channel avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
              </div>
            )}
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setAvatarUploading(true);
                const fd = new FormData();
                fd.append("file", file);
                fd.append("type", "avatars");
                const res = await fetch("/api/upload", { method: "POST", body: fd });
                if (res.ok) {
                  const { url } = await res.json();
                  setAvatarUrl(url);
                }
                setAvatarUploading(false);
              }} />
            <button type="button" onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center text-xs hover:bg-green-700 shadow">
              {avatarUploading ? "..." : "+"}
            </button>
          </div>
          <div className="text-sm text-gray-400">
            {t("channels.avatar")}<br/>
            <span className="text-xs">JPG, PNG / 2 MB</span>
          </div>
        </div>

        {/* Channel name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("channels.nameLabel")}
          </label>
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Мой трейдинг-канал"
          />
        </div>

        {/* Channel ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("channels.idLabel")}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 dark:text-gray-500 text-sm font-mono">#</span>
            <input
              type="text"
              value={channelId}
              onChange={(e) => handleChannelIdChange(e.target.value)}
              className="flex-1 px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100 font-mono"
              placeholder="my_channel"
              maxLength={30}
            />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Прямая ссылка: <span className="font-mono text-green-600 dark:text-green-400">{channelUrlDisplay}</span>
            </p>
            {channelId && (
              <ShareButtons url={channelUrl} text={`Канал "${channelName}" на FOMO`} />
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("channels.description")}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Опишите, что получат подписчики канала..."
          />
        </div>

        {/* Hashtags (instruments) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("channels.hashtags")} <span className="text-gray-400 font-normal">(≤5)</span>
          </label>
          {/* Selected tags */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedTags.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 rounded text-xs font-mono font-bold">
                  #{t.ticker || t.name}
                  <button type="button" onClick={() => setSelectedTags(selectedTags.filter((x) => x.id !== t.id))}
                    className="text-gray-400 hover:text-red-500 ml-0.5">✕</button>
                </span>
              ))}
            </div>
          )}
          {selectedTags.length < 5 && (
            <button
              type="button"
              onClick={async () => {
                if (tagCategories.length === 0) {
                  const res = await fetch("/api/categories?withInstruments=true");
                  if (res.ok) setTagCategories(await res.json());
                }
                setShowTagPicker(true);
              }}
              className="px-3 py-2 border dark:border-gray-700 rounded-lg text-sm text-gray-400 dark:text-gray-500 dark:bg-gray-800 hover:border-green-500 transition w-full text-left"
            >
              {t("channels.addInstrument")}
            </button>
          )}
          {/* Tag picker modal */}
          {showTagPicker && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowTagPicker(false)}>
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <h3 className="font-semibold dark:text-gray-100">{t("channels.selectInstrument")}</h3>
                  <button onClick={() => setShowTagPicker(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                  <input type="text" value={tagSearch} onChange={(e) => setTagSearch(e.target.value)}
                    placeholder={t("common.search")} className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" autoFocus />
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {tagCategories
                    .map((cat: any) => ({
                      ...cat,
                      instruments: cat.instruments.filter((inst: any) => {
                        if (!tagSearch) return true;
                        const q = tagSearch.toLowerCase();
                        return inst.name.toLowerCase().includes(q) || inst.ticker?.toLowerCase().includes(q);
                      }),
                    }))
                    .filter((cat: any) => cat.instruments.length > 0)
                    .map((cat: any) => {
                      const isExp = tagExpanded.has(cat.id) || !!tagSearch;
                      return (
                        <div key={cat.id}>
                          <button type="button" onClick={() => {
                            const n = new Set(tagExpanded);
                            if (n.has(cat.id)) n.delete(cat.id); else n.add(cat.id);
                            setTagExpanded(n);
                          }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-500 uppercase hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg">
                            <svg className={`w-3 h-3 transition-transform ${isExp ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
                            {cat.name} <span className="text-[10px] text-gray-300 ml-auto">{cat.instruments.length}</span>
                          </button>
                          {isExp && cat.instruments.map((inst: any) => {
                            const already = selectedTags.some((t) => t.id === inst.id);
                            return (
                              <button key={inst.id} type="button" disabled={already || selectedTags.length >= 5}
                                onClick={() => {
                                  if (!already && selectedTags.length < 5) {
                                    setSelectedTags([...selectedTags, { id: inst.id, name: inst.name, ticker: inst.ticker, slug: inst.slug }]);
                                  }
                                }}
                                className={`w-full text-left pl-8 pr-3 py-2 text-sm transition ${already ? "text-gray-400" : "hover:bg-green-50 dark:hover:bg-green-900/20 dark:text-gray-200"}`}>
                                <span className="font-medium text-green-600">#{inst.ticker || inst.name}</span>
                                <span className="text-gray-400"> — {inst.name}</span>
                                {already && <span className="text-[10px] ml-2">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tariffs */}
        <div className="border-t dark:border-gray-700 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("channels.tariffs")}</h3>
            <button
              type="button"
              onClick={addTariff}
              className="text-sm text-green-600 hover:text-green-800"
            >
              {t("channels.addTariff")}
            </button>
          </div>

          <div className="space-y-4">
            {tariffs.map((tr, i) => (
              <div
                key={i}
                className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t("channels.tariff")} {i + 1}
                  </span>
                  {tariffs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTariff(i)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      {t("common.delete")}
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("channels.name")}</label>
                  <input
                    type="text"
                    value={tr.name}
                    onChange={(e) => updateTariff(i, "name", e.target.value)}
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                    placeholder="Base / Premium / VIP"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("channels.price_rub")}</label>
                    <input
                      type="number"
                      value={tr.price}
                      onChange={(e) => updateTariff(i, "price", e.target.value)}
                      className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                      placeholder="500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t("channels.duration")}</label>
                    <input
                      type="number"
                      value={tr.durationDays}
                      onChange={(e) => updateTariff(i, "durationDays", e.target.value)}
                      className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
                      placeholder="30"
                    />
                  </div>
                </div>

                {/* Payment method — pick from saved */}
                <div className="border-t dark:border-gray-700 pt-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">{t("channels.paymentMethod")}</label>
                  {savedPaymentMethods.length === 0 ? (
                    <div className="text-sm text-gray-400 py-3 text-center bg-gray-50 dark:bg-gray-800 rounded-lg">
                      {t("channels.noPaymentMethods")}.{" "}
                      <Link href="/profile?tab=finance" className="text-green-600 hover:underline">{t("channels.addInProfile")} →</Link>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {savedPaymentMethods.map((m) => {
                        const isSelected = tr.paymentMethodId === m.id;
                        return (
                          <button key={m.id} type="button"
                            onClick={() => {
                              updateTariff(i, "paymentMethodId", m.id);
                              updateTariff(i, "paymentMethods", [m.type]);
                              if (m.type === "card") updateTariff(i, "cardNumber", m.details?.cardNumber || "");
                              if (m.type === "yukassa") {
                                updateTariff(i, "yukassaShopId", m.details?.yukassaShopId || "");
                                updateTariff(i, "yukassaSecret", m.details?.yukassaSecret || "");
                              }
                            }}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg text-left text-sm transition border ${
                              isSelected ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                            }`}>
                            <span className="text-lg">{m.type === "card" ? "💳" : m.type === "yukassa" ? "🏦" : "₿"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium dark:text-gray-100">{m.label}</div>
                              {m.details?.cardNumber && <div className="text-xs text-gray-400">**** {m.details.cardNumber.slice(-4)}</div>}
                            </div>
                            {isSelected && (
                              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
          className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
        >
          {saving ? t("channels.creating") : t("channels.create")}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
