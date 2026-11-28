"use client";
import { useState } from "react";

type Point = { date: string; value: number };
export default function AdminHistoryChart({ title, points, color }: { title: string; points: Point[]; color: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => 65 + i * 900 / Math.max(1, points.length - 1);
  const y = (v: number) => 205 - v / max * 170;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const chosen = hover == null ? null : points[hover];
  return <section className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow overflow-hidden"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold dark:text-gray-100">{title}</h2><span className="text-sm text-gray-500">За период: {points.reduce((s, p) => s + p.value, 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</span></div><div className="mt-2 h-6 text-sm text-gray-500" aria-live="polite">{chosen ? `${chosen.date}: ${chosen.value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}` : "Наведите на график, чтобы увидеть значение"}</div><svg viewBox="0 0 1000 240" className="w-full h-60" preserveAspectRatio="none" role="img" aria-label={title} onMouseLeave={() => setHover(null)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const ratio = ((e.clientX - r.left) / r.width * 1000 - 65) / 900; setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))))); }}>
    {[0, 1, 2, 3, 4].map((i) => { const v = max * i / 4; return <g key={i}><line x1="65" x2="965" y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".13" /><text x="56" y={y(v) + 4} textAnchor="end" fill="currentColor" opacity=".6" fontSize="13">{v.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}</text></g>; })}
    <path d={`${line} L${x(points.length - 1)},205 L65,205 Z`} fill={color} opacity=".10" /><path d={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    {hover != null && <g><line x1={x(hover)} x2={x(hover)} y1="35" y2="205" stroke={color} strokeDasharray="4 4" /><circle cx={x(hover)} cy={y(points[hover].value)} r="4" fill={color} /></g>}
    {[0, .25, .5, .75, 1].map((f) => { const i = Math.round((points.length - 1) * f); return <text key={f} x={x(i)} y="228" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} fill="currentColor" opacity=".6" fontSize="13">{points[i].date.slice(5)}</text>; })}
  </svg></section>;
}
