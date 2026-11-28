"use client";
import { useEffect, useState } from "react";

export default function AdminBadge({ kind }: { kind: "reports" | "users" }) {
  const [counts, setCounts] = useState({ reports: 0, users: 0 });
  useEffect(() => {
    let active = true;
    const refresh = () => { if (document.visibilityState !== "visible") return; void fetch("/api/admin/badges", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((v) => { if (active && v) setCounts(v); }).catch(() => {}); };
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("admin-badges-refresh", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("admin-badges-refresh", refresh); };
  }, []);
  const n = counts[kind];
  return n > 0 ? <span className="ml-2 inline-flex rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white" aria-label={`Ожидают: ${n}`}>{n > 99 ? "99+" : n}</span> : null;
}
