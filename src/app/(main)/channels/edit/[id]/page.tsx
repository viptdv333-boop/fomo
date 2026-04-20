"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

interface TariffData {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  paymentMethods: string[];
  cardNumber: string | null;
  yukassaShopId: string | null;
  yukassaSecret: string | null;
  avatarUrl: string | null;
  instrumentIds: string[];
  isActive: boolean;
}

export default function EditChannelPage() {
  const { t } = useT();
  const params = useParams();
  const editId = params.id as string;
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Channel-level (from first tariff)
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Saved payment methods
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<{ id: string; type: string; label: string; details: any; isDefault: boolean }[]>([]);

  // Tags
  const [selectedTags, setSelectedTags] = useState<{ id: string; name: string; ticker: string | null; slug: string }[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagCategories, setTagCategories] = useState<any[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [tagExpanded, setTagExpanded] = useState<Set<string>>(new Set());

  // All tariffs
  const [tariffs, setTariffs] = useState<{
    id: string | null; // null = new
    name: string;
    price: string;
    durationDays: string;
    paymentMethodId: string;
    paymentMethods: string[];
    cardNumber: string;
    yukassaShopId: string;
    yukassaSecret: string;
    isActive: boolean;
    description: string;
  }[]>([]);

  // Channel name/description (derived from tariff name prefix)
  const [channelName, setChannelName] = useState("");
  const [channelDescription, setChannelDescription] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    fetch("/api/payment-methods").then((r) => r.json()).then(setSavedPaymentMethods).catch(() => {});
    fetch(`/api/users/${user.id}/tariffs`)
      .then((r) => r.json())
      .then((all: TariffData[]) => {
        if (all.length === 0) { setLoading(false); return; }

        // Find the tariff we're editing to get channel info
        const main = all.find((t) => t.id === editId) || all[0];

        // Parse channel name from tariff name (format: "ChannelName: TariffName")
        const colonIdx = main.name.indexOf(":");
        if (colonIdx > 0) {
          setChannelName(main.name.substring(0, colonIdx).trim());
        } else {
          setChannelName(main.name);
        }
        setChannelDescription(main.description || "");
        setAvatarUrl(main.avatarUrl || "");

        // Load all tariffs
        setTariffs(all.map((t) => {
          const tColonIdx = t.name.indexOf(":");
          const tariffName = tColonIdx > 0 ? t.name.substring(tColonIdx + 1).trim() : t.name;
          return {
            id: t.id,
            name: tariffName,
            price: String(t.price),
            durationDays: String(t.durationDays),
            paymentMethodId: "",
            paymentMethods: t.paymentMethods || ["card"],
            cardNumber: t.cardNumber || "",
            yukassaShopId: t.yukassaShopId || "",
            yukassaSecret: t.yukassaSecret || "",
            isActive: t.isActive !== false,
            description: t.description || "",
          };
        }));

        // Load instruments
        if (main.instrumentIds?.length) {
          fetch(`/api/categories?withInstruments=true`)
            .then((r) => r.json())
            .then((cats: any[]) => {
              const allInst = cats.flatMap((c: any) => c.instruments);
              const tags = main.instrumentIds.map((id: string) => allInst.find((i: any) => i.id === id)).filter(Boolean);
              setSelectedTags(tags.map((i: any) => ({ id: i.id, name: i.name, ticker: i.ticker, slug: i.slug })));
            })
            .catch(() => {});
        }

        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user?.id, editId]);

  function addTariff() {
    setTariffs([...tariffs, {
      id: null, name: "", price: "", durationDays: "30", paymentMethodId: "",
      paymentMethods: ["card"], cardNumber: "", yukassaShopId: "", yukassaSecret: "",
      isActive: true, description: "",
    }]);
  }

  function removeTariff(idx: number) {
    setTariffs(tariffs.filter((_, i) => i !== idx));
  }

  function updateTariff(idx: number, field: string, value: any) {
    const updated = [...tariffs];
    updated[idx] = { ...updated[idx], [field]: value };
    setTariffs(updated);
  }

  async function handleSave() {
    setError("");
    if (!channelName.trim()) { setError("Укажите название канала"); return; }
    setSaving(true);

    try {
      // Delete removed tariffs
      const currentIds = tariffs.filter((t) => t.id).map((t) => t.id);
      // We don't track deleted here — user removes via removeTariff

      // Update/create each tariff
      for (const t of tariffs) {
        const fullName = `${channelName.trim()}: ${t.name.trim() || "Базовый"}`;
        const body = {
          name: fullName,
          description: channelDescription.trim() || null,
          price: parseFloat(t.price) || 0,
          durationDays: parseInt(t.durationDays) || 30,
          paymentMethods: t.paymentMethods,
          cardNumber: t.paymentMethods.includes("card") ? t.cardNumber.trim() || null : null,
          yukassaShopId: t.paymentMethods.includes("yukassa") ? t.yukassaShopId.trim() || null : null,
          yukassaSecret: t.paymentMethods.includes("yukassa") ? t.yukassaSecret.trim() || null : null,
          avatarUrl: avatarUrl || null,
          instrumentIds: selectedTags.map((tag) => tag.id),
          isActive: t.isActive,
        };

        if (t.id) {
          // Update existing
          const res = await fetch(`/api/users/${user?.id}/tariffs/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) { setError("Ошибка обновления тарифа"); setSaving(false); return; }
        } else {
          // Create new
          const res = await fetch(`/api/users/${user?.id}/tariffs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) { setError("Ошибка создания тарифа"); setSaving(false); return; }
        }
      }

      router.push("/subscriptions");
    } catch {
      setError("Ошибка сети");
    }
    setSaving(false);
  }

  async function handleDeleteChannel() {
    if (!confirm("Удалить канал и все тарифы? Подписки будут отменены.")) return;
    for (const t of tariffs) {
      if (t.id) await fetch(`/api/users/${user?.id}/tariffs/${t.id}`, { method: "DELETE" });
    }
    router.push("/subscriptions");
  }

  if (loading) return <div className="text-gray-400 py-12 text-center">...</div>;

  const inputCls = "w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">{t("channels.settings")}</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 space-y-5">
        {/* Avatar */}
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
                if (res.ok) { const { url } = await res.json(); setAvatarUrl(url); }
                setAvatarUploading(false);
              }} />
            <button type="button" onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-600 text-white rounded-full flex items-center justify-center text-xs hover:bg-green-700 shadow">
              {avatarUploading ? "..." : "✎"}
            </button>
          </div>
          <div className="text-sm text-gray-400">{t("channels.avatar")}</div>
        </div>

        {/* Channel name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("channels.nameLabel")}</label>
          <input type="text" value={channelName} onChange={(e) => setChannelName(e.target.value)} className={inputCls} />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("channels.description")}</label>
          <textarea value={channelDescription} onChange={(e) => setChannelDescription(e.target.value)} rows={3} className={inputCls} />
        </div>

        {/* Hashtags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("channels.hashtags")} <span className="text-gray-400 font-normal">(≤5)</span></label>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedTags.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 rounded text-xs font-mono font-bold">
                  #{t.ticker || t.name}
                  <button type="button" onClick={() => setSelectedTags(selectedTags.filter((x) => x.id !== t.id))} className="text-gray-400 hover:text-red-500 ml-0.5">✕</button>
                </span>
              ))}
            </div>
          )}
          {selectedTags.length < 5 && (
            <button type="button" onClick={async () => {
              if (tagCategories.length === 0) {
                const res = await fetch("/api/categories?withInstruments=true");
                if (res.ok) setTagCategories(await res.json());
              }
              setShowTagPicker(true);
            }} className="px-3 py-2 border dark:border-gray-700 rounded-lg text-sm text-gray-400 dark:bg-gray-800 hover:border-green-500 transition w-full text-left">
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
                  <input type="text" value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder={t("common.search")}
                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" autoFocus />
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {tagCategories.map((cat: any) => ({ ...cat, instruments: cat.instruments.filter((i: any) => !tagSearch || i.name.toLowerCase().includes(tagSearch.toLowerCase()) || i.ticker?.toLowerCase().includes(tagSearch.toLowerCase())) })).filter((c: any) => c.instruments.length > 0).map((cat: any) => {
                    const isExp = tagExpanded.has(cat.id) || !!tagSearch;
                    return (
                      <div key={cat.id}>
                        <button type="button" onClick={() => { const n = new Set(tagExpanded); if (n.has(cat.id)) n.delete(cat.id); else n.add(cat.id); setTagExpanded(n); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-500 uppercase hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg">
                          <svg className={`w-3 h-3 transition-transform ${isExp ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
                          {cat.name}
                        </button>
                        {isExp && cat.instruments.map((inst: any) => {
                          const already = selectedTags.some((t) => t.id === inst.id);
                          return (
                            <button key={inst.id} type="button" disabled={already || selectedTags.length >= 5}
                              onClick={() => { if (!already) setSelectedTags([...selectedTags, { id: inst.id, name: inst.name, ticker: inst.ticker, slug: inst.slug }]); }}
                              className={`w-full text-left pl-8 pr-3 py-2 text-sm ${already ? "text-gray-400" : "hover:bg-green-50 dark:hover:bg-green-900/20 dark:text-gray-200"}`}>
                              <span className="font-medium text-green-600">#{inst.ticker || inst.name}</span> — {inst.name}
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
            <button type="button" onClick={addTariff} className="text-sm text-green-600 hover:text-green-700 font-medium">{t("channels.addTariff")}</button>
          </div>

          <div className="space-y-4">
            {tariffs.map((t, idx) => (
              <div key={t.id || `new-${idx}`} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{t("channels.tariff")} {idx + 1}</span>
                  {tariffs.length > 1 && (
                    <button type="button" onClick={() => {
                      if (t.id) {
                        if (confirm("Удалить тариф?")) {
                          fetch(`/api/users/${user?.id}/tariffs/${t.id}`, { method: "DELETE" });
                          removeTariff(idx);
                        }
                      } else {
                        removeTariff(idx);
                      }
                    }} className="text-xs text-red-500 hover:text-red-700">Удалить</button>
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t("channels.name")}</label>
                  <input type="text" value={t.name} onChange={(e) => updateTariff(idx, "name", e.target.value)}
                    placeholder="Базовый" className={`mt-1 ${inputCls}`} />
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">{t("channels.price_rub")}</label>
                    <input type="number" value={t.price} onChange={(e) => updateTariff(idx, "price", e.target.value)}
                      className={`mt-1 ${inputCls}`} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">{t("channels.duration")}</label>
                    <input type="number" value={t.durationDays} onChange={(e) => updateTariff(idx, "durationDays", e.target.value)}
                      className={`mt-1 ${inputCls}`} />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{t("channels.paymentMethod")}</label>
                  {savedPaymentMethods.length === 0 ? (
                    <div className="text-sm text-gray-400 py-3 text-center bg-gray-50 dark:bg-gray-800 rounded-lg">
                      {t("channels.noPaymentMethods")}.{" "}
                      <Link href="/profile?tab=finance" className="text-green-600 hover:underline">{t("channels.addInProfile")} →</Link>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {savedPaymentMethods.map((m) => {
                        const isSelected = t.paymentMethodId === m.id;
                        return (
                          <button key={m.id} type="button"
                            onClick={() => {
                              updateTariff(idx, "paymentMethodId", m.id);
                              updateTariff(idx, "paymentMethods", [m.type]);
                              if (m.type === "card") updateTariff(idx, "cardNumber", m.details?.cardNumber || "");
                              if (m.type === "yukassa") {
                                updateTariff(idx, "yukassaShopId", m.details?.yukassaShopId || "");
                                updateTariff(idx, "yukassaSecret", m.details?.yukassaSecret || "");
                              }
                            }}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left text-sm transition border ${
                              isSelected ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                            }`}>
                            <span className="text-lg">{m.type === "card" ? "💳" : m.type === "yukassa" ? "🏦" : "₿"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium dark:text-gray-100">{m.label}</div>
                              {m.details?.cardNumber && <div className="text-xs text-gray-400">**** {m.details.cardNumber.slice(-4)}</div>}
                            </div>
                            {isSelected && <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={t.isActive} onChange={(e) => updateTariff(idx, "isActive", e.target.checked)} className="rounded" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t("channels.active")}</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {error && <div className="text-sm text-red-500">{error}</div>}

        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition disabled:opacity-50">
          {saving ? t("channels.saving") : t("common.save")}
        </button>
        <button type="button" onClick={() => router.back()}
          className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition">
          {t("common.cancel")}
        </button>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
          <button type="button" onClick={handleDeleteChannel} className="text-sm text-red-500 hover:text-red-700">
            {t("channels.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
