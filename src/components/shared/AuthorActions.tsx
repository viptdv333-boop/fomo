"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import UnifiedPaymentModal from "./UnifiedPaymentModal";

export default function AuthorActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [donation, setDonation] = useState<{ donationCard?: string | null; sbpQrUrl?: string | null } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (session?.user?.id === id) return null;
  async function donate() {
    const r = await fetch(`/api/users/${encodeURIComponent(id)}`);
    if (!r.ok) return setMessage("Не удалось открыть данные автора");
    const u = await r.json();
    if (!u.donationCard && !u.sbpQrUrl) return setMessage("Автор не указал реквизиты для донатов");
    setDonation(u);
  }
  async function vote() {
    if (!session?.user) return router.push("/login");
    setBusy(true);
    try {
      const r = await fetch(`/api/authors/${encodeURIComponent(id)}/rating`, { method: "POST" });
      setMessage(r.ok ? "Рейтинг повышен на 0,1" : r.status === 409 ? "Вы уже повысили рейтинг этого автора" : "Не удалось повысить рейтинг");
    } catch { setMessage("Не удалось повысить рейтинг"); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap gap-2 py-2 text-xs" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    <button type="button" className="rounded-lg bg-gray-100 dark:bg-gray-700 px-2 py-2" onClick={() => router.push(session?.user ? `/chat?with=${encodeURIComponent(id)}` : "/login")}>Написать</button>
    <button type="button" className="rounded-lg bg-gray-100 dark:bg-gray-700 px-2 py-2" onClick={() => void donate()}>Задонатить</button>
    <button type="button" className="rounded-lg bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-2" disabled={busy} onClick={() => void vote()}>Повысить рейтинг +0,1</button>
    {message && <span role="status" className="w-full text-gray-500">{message}</span>}
    {donation && <UnifiedPaymentModal purpose={{ type: "donation", authorId: id, authorName: name, donationCard: donation.donationCard, donationQrUrl: donation.sbpQrUrl }} onClose={() => setDonation(null)} />}
  </div>;
}
