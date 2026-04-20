"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

interface AssetItem {
  id: string;
  name: string;
  slug: string;
  chatRoom: { id: string } | null;
  category: { slug: string; name: string };
}

interface CategoryGroup {
  slug: string;
  name: string;
  assets: AssetItem[];
}

interface Props {
  currentSlug?: string;
  currentRoomId?: string;
  onSelectRoom?: (room: { id: string; name: string; isClosed: boolean; isArchived: boolean }) => void;
}

const CAT_I18N: Record<string, string> = {
  "ru-stocks": "terminal.stocksRu",
  "us-stocks": "cat.stocksUs",
  indices: "terminal.indices",
  currencies: "terminal.currencies",
  crypto: "terminal.crypto",
  commodities: "terminal.commodities",
  metals: "terminal.metals",
};

const CAT_EMOJIS: Record<string, string> = {
  "ru-stocks": "🇷🇺", "us-stocks": "🇺🇸", indices: "📊", currencies: "💱",
  crypto: "₿", commodities: "🛢️", metals: "🥇",
};

export default function ChatSidebar({ currentSlug, currentRoomId, onSelectRoom }: Props) {
  const { t } = useT();
  useSession(); // keep session alive
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/assets")
      .then(r => r.json())
      .then((assets: AssetItem[]) => {
        // Group by category
        const map = new Map<string, CategoryGroup>();
        for (const a of assets) {
          const key = a.category?.slug || "other";
          if (!map.has(key)) map.set(key, { slug: key, name: a.category?.name || "Другое", assets: [] });
          map.get(key)!.assets.push(a);
        }
        setCategories([...map.values()]);

        // Auto-open category of active room
        if (currentRoomId || currentSlug) {
          const active = assets.find(a => a.chatRoom?.id === currentRoomId || a.slug === currentSlug);
          if (active?.category?.slug) setOpenCats(new Set([active.category.slug]));
        }
      })
      .catch(() => {});
  }, []);

  function toggleCat(slug: string) {
    setOpenCats(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }

  function isActive(asset: AssetItem) {
    if (currentRoomId && asset.chatRoom) return asset.chatRoom.id === currentRoomId;
    if (currentSlug) return asset.slug === currentSlug;
    return false;
  }

  function handleClick(asset: AssetItem) {
    if (onSelectRoom && asset.chatRoom) {
      onSelectRoom({ id: asset.chatRoom.id, name: asset.name, isClosed: false, isArchived: false });
    }
  }

  const q = search.toLowerCase();
  const filteredCats = categories.map(cat => ({
    ...cat,
    assets: cat.assets.filter(a => !q || a.name.toLowerCase().includes(q)),
  })).filter(cat => cat.assets.length > 0);

  return (
    <div className="w-full md:w-80 md:shrink-0 flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t("nav.chat")}</h2>
      </div>

      {/* Search */}
      <div className="px-4 pb-3 shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t("common.search")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg placeholder-gray-400 dark:placeholder-gray-500 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {/* General chat */}
      <Link
        href="/chat"
        onClick={() => onSelectRoom?.({ id: "general", name: t("chat.generalChat"), isClosed: false, isArchived: false })}
        className={`px-4 py-3 flex items-center gap-3 transition border-l-2 ${
          !currentRoomId && !currentSlug
            ? "bg-green-50 dark:bg-green-900/20 border-green-500 text-green-700 dark:text-green-400"
            : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
        }`}
      >
        <span className="text-lg">🏠</span>
        <div>
          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{t("chat.generalChat")}</div>
          <div className="text-xs text-gray-400">{t("chat.discussionDesc")}</div>
        </div>
      </Link>

      {/* Categories → Assets */}
      <div className="flex-1 overflow-y-auto">
        {filteredCats.map(cat => (
          <div key={cat.slug}>
            <button
              onClick={() => toggleCat(cat.slug)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
            >
              <svg className={`w-3 h-3 transition-transform text-gray-400 ${openCats.has(cat.slug) ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 4l8 6-8 6V4z" />
              </svg>
              <span>{CAT_EMOJIS[cat.slug] || "📁"}</span>
              <span>{CAT_I18N[cat.slug] ? t(CAT_I18N[cat.slug]) : cat.name}</span>
              <span className="ml-auto text-[10px] text-gray-400 font-normal">{cat.assets.length}</span>
            </button>
            {openCats.has(cat.slug) && cat.assets.map(asset => {
              const active = isActive(asset);
              const href = asset.chatRoom ? `/chat?room=${asset.chatRoom.id}` : "/chat";
              return (
                <Link
                  key={asset.id}
                  href={href}
                  onClick={() => handleClick(asset)}
                  className={`block pl-10 pr-4 py-2 text-sm transition truncate ${
                    active
                      ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-medium border-l-2 border-green-500"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-2 border-transparent"
                  }`}
                >
                  {asset.name}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
