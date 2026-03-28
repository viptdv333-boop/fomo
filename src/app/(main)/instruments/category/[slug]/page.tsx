"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Ticker {
  id: string;
  ticker: string | null;
  exchange: string | null;
  exchangeRel: { shortName: string; country: string } | null;
}

interface Asset {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  instruments: Ticker[];
  _count: { instruments: number };
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

const COUNTRY_FLAGS: Record<string, string> = { RU: "🇷🇺", US: "🇺🇸", CN: "🇨🇳", GB: "🇬🇧", SPOT: "🌐", CRYPTO: "₿" };

export default function CategoryPage() {
  const { slug } = useParams();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assets?categorySlug=${slug}`)
      .then(r => r.json())
      .then((data: Asset[]) => {
        setAssets(Array.isArray(data) ? data : []);
        if (data.length > 0 && (data[0] as any).category) {
          setCategory((data[0] as any).category);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Also fetch category name
    fetch("/api/categories")
      .then(r => r.json())
      .then((cats: any[]) => {
        const found = cats.find((c: any) => c.slug === slug);
        if (found) setCategory(found);
      })
      .catch(() => {});
  }, [slug]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/instruments" className="text-sm text-green-600 hover:text-green-700 dark:text-green-400">
          ← Каталог
        </Link>
        <h1 className="text-2xl font-bold dark:text-gray-100 mt-2">{category?.name || "..."}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{assets.length} инструментов</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
        </div>
      ) : assets.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p>Инструменты в этой категории пока не добавлены</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assets.map(asset => (
            <Link
              key={asset.id}
              href={`/instruments/${asset.slug}`}
              className="block bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{asset.name}</h3>
                  {asset.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{asset.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-4">
                  {asset.instruments.slice(0, 5).map(t => (
                    <span key={t.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded text-xs font-mono font-bold">
                      #{t.ticker}
                      {t.exchangeRel && (
                        <span className="text-[9px] text-gray-400 font-normal">
                          {COUNTRY_FLAGS[t.exchangeRel.country] || ""}{t.exchangeRel.shortName}
                        </span>
                      )}
                    </span>
                  ))}
                  {asset.instruments.length > 5 && (
                    <span className="text-xs text-gray-400">+{asset.instruments.length - 5}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
