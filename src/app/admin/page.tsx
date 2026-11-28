"use client";

import { useEffect, useState } from "react";
import { isTerminalSite } from "@/lib/site-mode";
import AdminHistoryChart from "@/components/admin/AdminHistoryChart";

interface Stats {
  totalUsers: number;
  pendingUsers: number;
  approvedUsers: number;
  bannedUsers: number;
  totalIdeas: number;
  ideasThisWeek: number;
  totalRevenue: number;
  history: Record<string, { users: number; ideas: number; money: number }>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) {
    return <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>;
  }

  const allCards = [
    { label: "Всего пользователей", value: stats.totalUsers, color: "bg-green-500" },
    { label: "Ожидают одобрения", value: stats.pendingUsers, color: "bg-yellow-500" },
    { label: "Одобрены", value: stats.approvedUsers, color: "bg-green-500" },
    { label: "Заблокированы", value: stats.bannedUsers, color: "bg-red-500" },
    { label: "Всего идей", value: stats.totalIdeas, color: "bg-purple-500" },
    { label: "Идей за неделю", value: stats.ideasThisWeek, color: "bg-indigo-500" },
    { label: "Подтверждённые оплаты", value: `${stats.totalRevenue} ₽`, color: "bg-emerald-500" },
  ];
  // terminal.fomo.spot has no ideas or revenue: users only
  const cards = isTerminalSite() ? allCards.slice(0, 4) : allCards;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <div className={`w-3 h-3 rounded-full ${card.color} mb-3`} />
            <div className="text-2xl font-bold dark:text-gray-100">{card.value}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-2" aria-label="Период графиков">{[7, 30, 90, 365].map((n) => <button key={n} onClick={() => setDays(n)} className={`rounded-lg px-3 py-2 text-sm ${days === n ? "bg-green-600 text-white" : "bg-white dark:bg-gray-800 dark:text-gray-200"}`}>{n === 365 ? "1Г" : `${n}Д`}</button>)}</div>
      <div className="mt-4 grid gap-4">{(isTerminalSite() ? ([['users', 'Новые пользователи']] as const) : ([['users', 'Новые пользователи'], ['ideas', 'Новые идеи'], ['money', 'Подтверждённые оплаты, ₽']] as const)).map(([key, title]) => {
        const points = Array.from({ length: days }, (_, i) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - days + i + 1); return { date: d.toISOString().slice(0, 10), value: stats.history?.[d.toISOString().slice(0, 10)]?.[key] ?? 0 }; });
        return <AdminHistoryChart key={key} title={title} points={points} color={key === "users" ? "#16a46a" : key === "ideas" ? "#8b5cf6" : "#e39a24"} />;
      })}</div>
    </div>
  );
}
