"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { paymentLinkHost } from "@/lib/payment-link";
import { TYPE_LABELS, safeLinkUrl, type PaymentMethod } from "@/components/profile/PaymentMethodsManager";
import AppIcon from "../AppIcon";
import { Sections, type SheetRow, type SheetSection } from "../chat/AppSheet";
import PaymentMethodSheet from "./PaymentMethodSheet";
import { useProf } from "./ProfileCtx";
import { Loading, ScreenFrame } from "./parts";

interface PaymentItem {
  id: string;
  sellerId?: string;
  sellerName?: string;
  buyerId?: string;
  buyerName?: string;
  ideaId: string | null;
  ideaTitle: string | null;
  subscriptionType: string | null;
  amount: number;
  receiptUrl: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  createdAt: string;
}
interface FinanceData {
  earnings: { total: number; thisMonth: number; transactionCount: number };
  subscribers: { active: number };
  tariffs: { id: string; name: string; price: number; durationDays: number; subscriberCount: number }[];
  ideaSales: { total: number; count: number };
  spending: { total: number; count: number };
  mySubscriptions: { id: string; authorId: string; authorName: string; tariffName: string; endDate: string; monthlyPrice: number }[];
  purchases: PaymentItem[];
  sales: PaymentItem[];
}

const DATE_LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-US", cn: "zh-CN" };
const PM_ICON: Record<string, "wallet" | "image" | "link" | "shield"> = { card: "wallet", sbp: "image", link: "link", yukassa: "shield", crypto: "wallet" };

/** «Финансы» (the design's `finance`): payment methods, my channels, subscriptions, sales to confirm, purchases, earnings and spending. The old «Финансы» tab. */
export default function FinanceScreen() {
  const { t, user, me, locale, open, flash } = useProf();
  const uid = user?.id;
  const money = (n: number) => `${Number(n || 0).toLocaleString("ru")} ₽`;
  const [data, setData] = useState<FinanceData | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [addPm, setAddPm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const receiptFor = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    if (!uid) return;
    try {
      const r = await fetch(`/api/users/${uid}/finances`);
      if (r.ok) setData(await r.json());
    } catch {
      /* keeps what is on screen */
    }
  }, [uid]);
  const loadMethods = useCallback(async () => {
    try {
      const r = await fetch("/api/payment-methods");
      setMethods(r.ok ? await r.json() : []);
    } catch {
      setMethods((prev) => prev ?? []);
    }
  }, []);
  useEffect(() => {
    void loadData();
    void loadMethods();
  }, [loadData, loadMethods]);

  /* ---- payment methods ---- */
  async function removeMethod(id: string) {
    if (!window.confirm(t("pay.confirmDeletePm"))) return;
    await fetch(`/api/payment-methods?id=${id}`, { method: "DELETE" });
    void loadMethods();
  }
  async function makeDefault(id: string) {
    await fetch("/api/payment-methods", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isDefault: true }) });
    void loadMethods();
  }

  /* ---- subscriptions ---- */
  async function unsubscribe(id: string) {
    if (!window.confirm(t("pay.confirmUnsubscribe"))) return;
    setBusy(id);
    try {
      const res = await fetch("/api/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (res.ok) void loadData();
      else window.alert(t("pay.unsubscribeFailed"));
    } finally {
      setBusy(null);
    }
  }

  /* ---- receipts (buyer) and confirmations (seller) ---- */
  async function onReceiptFile(file: File | undefined) {
    const paymentId = receiptFor.current;
    if (!file || !paymentId) return;
    setBusy(paymentId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "receipts");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      if (!up.ok) {
        window.alert(t("pay.fileUploadError"));
        return;
      }
      const { url } = await up.json();
      const patch = await fetch(`/api/payments/${paymentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptUrl: url }) });
      if (patch.ok) {
        flash(t("pay.receiptUploaded"));
        void loadData();
      } else window.alert(t("pay.receiptSaveError"));
    } finally {
      setBusy(null);
      receiptFor.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function decide(p: PaymentItem, action: "confirm" | "reject") {
    if (!window.confirm(action === "confirm" ? t("pay.confirmSure") : t("pay.rejectSure"))) return;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/payments/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (res.ok) {
        flash(action === "confirm" ? t("pay.statusConfirmed") : t("pay.statusRejected"));
        void loadData();
      }
    } catch {
      /* the row keeps its buttons */
    }
    setBusy(null);
  }

  if (!data || methods === null) {
    return (
      <ScreenFrame title={t("profile.finance")}>
        <Loading label={t("common.loading")} />
      </ScreenFrame>
    );
  }

  const dateStr = (iso: string) => new Date(iso).toLocaleDateString(DATE_LOCALES[locale] || "ru-RU", { day: "numeric", month: "short", year: "numeric" });
  const statusText = (p: PaymentItem) =>
    p.status === "CONFIRMED" ? t("pay.statusConfirmed") : p.status === "REJECTED" ? t("pay.statusRejected") : p.receiptUrl ? t("appprof.receiptAttached") : t("pay.statusPending");
  const what = (p: PaymentItem) => (p.ideaId && p.ideaTitle ? p.ideaTitle : p.subscriptionType ? t("pay.subscription") : t("pay.payment"));
  const rating = Number(me?.rating) || 0;

  const sections: SheetSection[] = [];

  // payment methods
  sections.push({
    key: "pay",
    title: t("pm.title"),
    footer: t("appprof.payFoot"),
    rows: [
      ...methods.map((m): SheetRow => {
        const link = m.type === "link" ? safeLinkUrl(m.details?.url) : null;
        return {
          key: m.id,
          label: m.label,
          sub: [TYPE_LABELS[m.type] ? (TYPE_LABELS[m.type].startsWith("pay.") ? t(TYPE_LABELS[m.type]) : TYPE_LABELS[m.type]) : m.type, m.details?.cardNumber ? `*${String(m.details.cardNumber).slice(-4)}` : "", m.type === "link" ? paymentLinkHost(m.details?.url) || "" : ""].filter(Boolean).join(" · "),
          icon: m.type === "sbp" && m.details?.qrImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.details.qrImageUrl} alt="QR" style={{ width: 30, height: 30, borderRadius: 8, objectFit: "contain", background: "#fff" }} />
          ) : (
            <AppIcon name={PM_ICON[m.type] || "wallet"} size={18} stroke={1.8} />
          ),
          value: m.isDefault ? t("pm.default") : undefined,
          valueColor: "var(--app-green-tx)",
          actions: [
            ...(link ? [{ label: `${t("pay.link.open")} ↗`, onClick: () => window.open(link, "_blank", "noopener,noreferrer") }] : []),
            ...(!m.isDefault ? [{ label: t("appprof.makeDefault"), onClick: () => void makeDefault(m.id) }] : []),
            { label: t("common.delete"), tone: "danger" as const, onClick: () => void removeMethod(m.id) },
          ],
        };
      }),
      ...(methods.length === 0 ? [{ key: "none", label: t("pm.noMethods"), color: "var(--app-tx2)" } as SheetRow] : []),
      { key: "add", label: t("appprof.addMethod"), icon: <AppIcon name="plus" size={18} stroke={1.8} />, color: "var(--app-green-tx)", onClick: () => setAddPm(true) },
    ],
  });

  // my channels (the tariffs)
  sections.push({
    key: "mine",
    title: t("pay.myChannels"),
    rows: [
      ...data.tariffs.map((tr): SheetRow => ({
        key: tr.id,
        label: tr.name,
        sub: `${t("pay.pricePerDays", { price: tr.price, days: tr.durationDays })} · ${t("pay.subscribersCount", { count: tr.subscriberCount })}`,
        icon: <AppIcon name="channels" size={18} stroke={1.8} />,
        chev: true,
        onClick: () => open(`/channels/${tr.id}`),
      })),
      {
        key: "create",
        label: t("channels.create"),
        sub: rating < 5 ? t("profile2.tariffRatingRequired", { rating: rating.toFixed(1) }) : undefined,
        icon: <AppIcon name="plus" size={18} stroke={1.8} />,
        color: "var(--app-green-tx)",
        onClick: () => open("/channels/create"),
      },
    ],
  });

  // earnings
  sections.push({
    key: "earn",
    title: t("appprof.earnings"),
    rows: [
      { key: "e1", label: t("pay.earnedTotal"), value: money(data.earnings.total) },
      { key: "e2", label: t("pay.thisMonth"), value: money(data.earnings.thisMonth) },
      { key: "e3", label: t("pay.activeSubscribers"), value: String(data.subscribers.active) },
      { key: "e4", label: t("pay.ideasSold"), value: `${data.ideaSales.count} (${money(data.ideaSales.total)})` },
    ],
  });

  // my subscriptions
  const paid = data.mySubscriptions.filter((s) => s.monthlyPrice > 0);
  const free = data.mySubscriptions.filter((s) => s.monthlyPrice === 0);
  const subRow = (s: FinanceData["mySubscriptions"][number]): SheetRow => {
    const daysLeft = Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000);
    return {
      key: s.id,
      label: s.authorName,
      sub: [s.tariffName, s.monthlyPrice > 0 ? `${s.monthlyPrice} ₽` : t("pay.free"), daysLeft > 0 ? t("pay.daysLeft", { days: daysLeft }) : t("pay.expired")].filter(Boolean).join(" · "),
      chev: true,
      onClick: () => open(`/profile/${s.authorId}`),
      actions: [{ label: busy === s.id ? "…" : t("channels.unsubscribe"), tone: "danger", onClick: () => void unsubscribe(s.id) }],
    };
  };
  if (paid.length) sections.push({ key: "paid", title: t("pay.mySubsPaid"), rows: paid.map(subRow) });
  if (free.length) sections.push({ key: "free", title: t("pay.mySubsFree"), rows: free.map(subRow) });
  if (!data.mySubscriptions.length) sections.push({ key: "nosubs", title: t("pay.mySubs"), footer: t("pay.noActiveSubs"), rows: [] });

  // sales: the seller confirms or rejects (a receipt is attached)
  sections.push({
    key: "sales",
    title: t("pay.mySales"),
    footer: data.sales.length ? t("appprof.salesFoot") : t("pay.noSales"),
    rows: data.sales.map((p): SheetRow => ({
      key: p.id,
      label: `${p.buyerName || t("pay.buyer")} · ${money(p.amount)}`,
      sub: (
        <>
          {what(p)}
          {" · "}
          {dateStr(p.createdAt)}
          <span className="ap-pill" data-s={p.status === "CONFIRMED" ? "ok" : p.status === "REJECTED" ? "no" : "wait"}>
            {statusText(p)}
          </span>
        </>
      ),
      onClick: p.buyerId ? () => open(`/profile/${p.buyerId}`) : undefined,
      actions: [
        ...(p.receiptUrl ? [{ label: t("pay.viewReceipt"), onClick: () => window.open(p.receiptUrl!, "_blank", "noopener,noreferrer") }] : []),
        ...(p.status === "PENDING" && p.receiptUrl
          ? [
              { label: busy === p.id ? "…" : t("pay.confirm"), onClick: () => void decide(p, "confirm") },
              { label: t("pay.reject"), tone: "danger" as const, onClick: () => void decide(p, "reject") },
            ]
          : []),
      ],
    })),
  });

  // purchases: the buyer attaches a receipt
  sections.push({
    key: "buys",
    title: t("pay.myPurchases"),
    footer: data.purchases.length ? undefined : t("pay.noPurchases"),
    rows: data.purchases.map((p): SheetRow => ({
      key: p.id,
      label: what(p),
      sub: (
        <>
          {money(p.amount)}
          {" · "}
          {p.sellerName || t("pay.seller")}
          {" · "}
          {dateStr(p.createdAt)}
          <span className="ap-pill" data-s={p.status === "CONFIRMED" ? "ok" : p.status === "REJECTED" ? "no" : "wait"}>
            {p.status === "PENDING" && !p.receiptUrl ? t("pay.statusPending") : p.status === "PENDING" ? t("appprof.waitsAuthor") : statusText(p)}
          </span>
        </>
      ),
      onClick: p.ideaId ? () => open(`/ideas/${p.ideaId}`) : p.sellerId ? () => open(`/profile/${p.sellerId}`) : undefined,
      actions: [
        ...(p.receiptUrl ? [{ label: p.status === "PENDING" ? t("pay.receiptUploaded") : t("pay.viewReceipt"), onClick: () => window.open(p.receiptUrl!, "_blank", "noopener,noreferrer") }] : []),
        ...(p.status === "PENDING" && !p.receiptUrl
          ? [
              {
                label: busy === p.id ? t("common.loading") : t("pay.uploadReceipt"),
                tone: "primary" as const,
                onClick: () => {
                  receiptFor.current = p.id;
                  fileRef.current?.click();
                },
              },
            ]
          : []),
      ],
    })),
  });

  // spending
  sections.push({
    key: "spend",
    title: t("pay.mySpending"),
    rows: [
      { key: "s1", label: t("pay.spentTotal"), value: money(data.spending.total) },
      { key: "s2", label: t("pay.transactions"), value: String(data.spending.count) },
    ],
  });

  return (
    <ScreenFrame title={t("profile.finance")}>
      <Sections sections={sections} />
      <input ref={fileRef} type="file" accept="image/*,.pdf" hidden onChange={(e) => void onReceiptFile(e.target.files?.[0])} />
      {addPm && <PaymentMethodSheet methodsCount={methods.length} onSaved={() => void loadMethods()} onClose={() => setAddPm(false)} />}
    </ScreenFrame>
  );
}
