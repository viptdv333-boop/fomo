"use client";

import { useEffect, useState } from "react";

interface FGData {
  value: string;
  value_classification: string;
  timestamp: string;
}

const COLORS: Record<string, string> = {
  "Extreme Fear": "#ea3943",
  "Fear": "#ea8c00",
  "Neutral": "#9b9b9b",
  "Greed": "#16c784",
  "Extreme Greed": "#16c784",
};

const LABELS: Record<string, string> = {
  "Extreme Fear": "Крайний страх",
  "Fear": "Страх",
  "Neutral": "Нейтрально",
  "Greed": "Жадность",
  "Extreme Greed": "Крайняя жадность",
};

export default function FearGreedIndex() {
  const [data, setData] = useState<FGData | null>(null);

  useEffect(() => {
    fetch("https://api.alternative.me/fng/?limit=1")
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.[0]) setData(res.data[0]);
      })
      .catch(() => {});
  }, []);

  if (!data) return null;

  const value = parseInt(data.value);
  const color = COLORS[data.value_classification] || "#9b9b9b";
  const label = LABELS[data.value_classification] || data.value_classification;
  // Rotation: 0 = -90deg (extreme fear), 100 = 90deg (extreme greed)
  const rotation = (value / 100) * 180 - 90;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wide">
        Fear & Greed Index
      </h3>
      <div className="flex flex-col items-center">
        {/* Gauge */}
        <div className="relative w-48 h-24 overflow-hidden mb-2">
          {/* Background arc */}
          <svg viewBox="0 0 200 100" className="w-full h-full">
            <defs>
              <linearGradient id="fgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ea3943" />
                <stop offset="25%" stopColor="#ea8c00" />
                <stop offset="50%" stopColor="#9b9b9b" />
                <stop offset="75%" stopColor="#16c784" />
                <stop offset="100%" stopColor="#16c784" />
              </linearGradient>
            </defs>
            <path
              d="M 10 95 A 90 90 0 0 1 190 95"
              fill="none"
              stroke="url(#fgGradient)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Needle */}
            <line
              x1="100"
              y1="95"
              x2={100 + 70 * Math.cos((rotation * Math.PI) / 180)}
              y2={95 - 70 * Math.sin(((-rotation + 180) * Math.PI) / 180 + Math.PI)}
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="100" cy="95" r="5" fill={color} />
          </svg>
        </div>
        {/* Value */}
        <div className="text-center">
          <span className="text-3xl font-bold" style={{ color }}>{value}</span>
          <span className="text-sm text-gray-400 ml-1">/ 100</span>
        </div>
        <div className="text-sm font-medium mt-1" style={{ color }}>{label}</div>
        <div className="flex justify-between w-full mt-3 text-[10px] text-gray-400 px-2">
          <span>Страх</span>
          <span>Жадность</span>
        </div>
      </div>
    </div>
  );
}
