"use client";

import { useEffect, useState } from "react";

interface Stats {
  totalUsers: number;
  pendingUsers: number;
  approvedUsers: number;
  bannedUsers: number;
  totalIdeas: number;
  ideasThisWeek: number;
  totalRevenue: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) {
    return <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>;
  }

  const cards = [
    { label: "Всего пользователей", value: stats.totalUsers, color: "bg-green-500" },
    { label: "Ожидают одобрения", value: stats.pendingUsers, color: "bg-yellow-500" },
    { label: "Одобрены", value: stats.approvedUsers, color: "bg-green-500" },
    { label: "Заблокированы", value: stats.bannedUsers, color: "bg-red-500" },
    { label: "Всего идей", value: stats.totalIdeas, color: "bg-purple-500" },
    { label: "Идей за неделю", value: stats.ideasThisWeek, color: "bg-indigo-500" },
    { label: "Доход (заглушка)", value: `${stats.totalRevenue} ₽`, color: "bg-emerald-500" },
  ];

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
    </div>
  );
}
