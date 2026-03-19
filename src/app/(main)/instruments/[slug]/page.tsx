"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import MoexStats from "@/components/instruments/MoexStats";
import IdeaCard from "@/components/ideas/IdeaCard";
import type { DataSource } from "@/components/instruments/TradingViewWidget";

// Dynamic import to avoid SSR issues
const TradingViewWidget = dynamic(
  () => import("@/components/instruments/TradingViewWidget"),
  { ssr: false, loading: () => <div className="h-[500px] bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" /> }
);

interface InstrumentData {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  exchange: string | null;
  exchangeUrl: string | null;
  tradingViewSymbol: string | null;
  dataSource: string | null;
  dataTicker: string | null;
  description: string | null;
  category: { id: string; name: string; slug: string } | null;
  chatRoom: { id: string; name: string } | null;
}

export default function InstrumentPage() {
  const params = useParams();
  const { data: session } = useSession();
  const slug = params.slug as string;

  const [instrument, setInstrument] = useState<InstrumentData | null>(null);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadInstrument() {
    const res = await fetch(`/api/instruments/${slug}`);
    if (res.ok) setInstrument(await res.json());
    setLoading(false);
  }

  async function loadIdeas() {
    if (!instrument) return;
    const res = await fetch(`/api/ideas?instrumentId=${instrument.id}`);
    const data = await res.json();
    setIdeas(data.data || data.ideas || (Array.isArray(data) ? data : []));
  }

  useEffect(() => { loadInstrument(); }, [slug]);
  useEffect(() => { if (instrument) loadIdeas(); }, [instrument?.id]);

  if (loading) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">Загрузка...</div>;
  if (!instrument) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">Инструмент не найден</div>;

  const chartTicker = instrument.dataTicker || instrument.ticker || "";
  const chartSource = (instrument.dataSource || "none") as DataSource;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold dark:text-gray-100">{instrument.name}</h1>
              {instrument.ticker && (
                <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg text-sm font-mono font-medium">
                  {instrument.ticker}
                </span>
              )}
              {instrument.dataSource && (
                <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded text-xs font-medium">
                  {instrument.dataSource === "moex" ? "MOEX" : "Bybit"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
              {instrument.category && (
                <span>{instrument.category.name}</span>
              )}
              {instrument.exchange && (
                <>
                  <span>·</span>
                  <span>{instrument.exchange}</span>
                </>
              )}
            </div>
            {instrument.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-3">{instrument.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {instrument.exchangeUrl && (
              <a
                href={instrument.exchangeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition"
              >
                На бирже ↗
              </a>
            )}
            {instrument.chatRoom && session && (
              <Link
                href={`/chat/${instrument.chatRoom.id}`}
                className="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Чат
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* TradingView Chart */}
      {chartSource !== "none" && chartTicker && (
        <TradingViewWidget
          ticker={chartTicker}
          source={chartSource}
          name={instrument.name}
          height={550}
        />
      )}

      {/* MOEX Stats */}
      {(instrument.exchange === "MOEX" || instrument.dataSource === "moex") && <MoexStats slug={slug} />}

      {/* Ideas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-gray-100">
            Идеи по {instrument.name}
          </h2>
          {session && (
            <Link
              href={`/ideas/new?instrumentId=${instrument.id}`}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Написать идею
            </Link>
          )}
        </div>

        {ideas.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-8 bg-white dark:bg-gray-900 rounded-xl shadow">
            Нет идей по этому инструменту
          </div>
        ) : (
          <div className="space-y-4">
            {ideas.map((idea: any) => (
              <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
