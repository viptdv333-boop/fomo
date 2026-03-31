"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function EditChannelPage() {
  const params = useParams();
  const tariffId = params.id as string;
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["card"]);
  const [cardNumber, setCardNumber] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Tags
  const [selectedTags, setSelectedTags] = useState<{ id: string; name: string; ticker: string | null; slug: string }[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagCategories, setTagCategories] = useState<any[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [tagExpanded, setTagExpanded] = useState<Set<string>>(new Set());

  // Load tariff data
  useEffect(() => {
    if (!tariffId || !user?.id) return;
    fetch(`/api/users/${user.id}/tariffs`)
      .then((r) => r.json())
      .then((tariffs: any[]) => {
        const t = tariffs.find((t: any) => t.id === tariffId);
        if (t) {
          setName(t.name);
          setDescription(t.description || "");
          setPrice(String(Number(t.price)));
          setDurationDays(String(t.durationDays));
          setAvatarUrl(t.avatarUrl || "");
          setPaymentMethods(t.paymentMethods || ["card"]);
          setCardNumber(t.cardNumber || "");
          setIsActive(t.isActive !== false);
          // Load instruments
          if (t.instrumentIds?.length) {
            fetch(`/api/instruments?ids=${t.instrumentIds.join(",")}`)
              .then((r) => r.json())
              .then((instruments: any[]) => {
                if (Array.isArray(instruments)) {
                  setSelectedTags(instruments.map((i: any) => ({ id: i.id, name: i.name, ticker: i.ticker, slug: i.slug })));
                }
              })
              .catch(() => {});
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tariffId, user?.id]);

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user?.id}/tariffs/${tariffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || null,
          price: parseFloat(price),
          durationDays: parseInt(durationDays) || 30,
          avatarUrl: avatarUrl || null,
          instrumentIds: selectedTags.map((t) => t.id),
          paymentMethods,
          cardNumber: cardNumber.trim() || null,
          isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Ошибка сохранения");
      } else {
        router.push("/subscriptions");
      }
    } catch {
      setError("Ошибка сети");
    }
    setSaving(false);
  }

  if (loading) return <div className="text-gray-400 py-12 text-center">Загрузка...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Настройки канала</h1>

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
          <div className="text-sm text-gray-400">Аватарка канала</div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100" />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Описание</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100" />
        </div>

        {/* Hashtags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Хэштеги <span className="text-gray-400 font-normal">(до 5)</span>
          </label>
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
              + Добавить инструмент...
            </button>
          )}
          {showTagPicker && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowTagPicker(false)}>
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <h3 className="font-semibold dark:text-gray-100">Выберите инструмент</h3>
                  <button onClick={() => setShowTagPicker(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                  <input type="text" value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Поиск..."
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

        {/* Price */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Цена (₽)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Срок (дней)</label>
            <input type="number" value={durationDays} onChange={(e) => setDurationDays(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100" />
          </div>
        </div>

        {/* Payment methods */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Способы оплаты</label>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={paymentMethods.includes("card")}
                onChange={(e) => setPaymentMethods(e.target.checked ? [...paymentMethods, "card"] : paymentMethods.filter((m) => m !== "card"))}
                className="rounded" />
              <span className="text-sm dark:text-gray-300">💳 Перевод на карту</span>
            </label>
            {paymentMethods.includes("card") && (
              <input type="text" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="0000 0000 0000 0000"
                className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100 text-sm ml-6" />
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={paymentMethods.includes("yukassa")}
                onChange={(e) => setPaymentMethods(e.target.checked ? [...paymentMethods, "yukassa"] : paymentMethods.filter((m) => m !== "yukassa"))}
                className="rounded" />
              <span className="text-sm dark:text-gray-300">🏦 ЮKassa</span>
            </label>
          </div>
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-3 py-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Канал активен</span>
        </label>

        {error && <div className="text-sm text-red-500">{error}</div>}

        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition disabled:opacity-50">
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="w-full py-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition">
          Отмена
        </button>

        {/* Delete */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
          <button type="button" onClick={async () => {
            if (!confirm("Удалить канал? Все подписки будут отменены.")) return;
            await fetch(`/api/users/${user?.id}/tariffs/${tariffId}`, { method: "DELETE" });
            router.push("/subscriptions");
          }} className="text-sm text-red-500 hover:text-red-700">
            Удалить канал
          </button>
        </div>
      </div>
    </div>
  );
}
