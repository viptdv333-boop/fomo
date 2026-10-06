"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { receiptDmText } from "@/lib/i18n/receipt-dm";
import { hasLinkRef, validatePaymentLink, type PublicPayLink } from "@/lib/payment-link";
import { priceAndPeriod, priceLabel, receiptProblem, type ChannelItem } from "@/lib/app-channels";
import AppIcon from "../AppIcon";
import AppSheet from "../chat/AppSheet";
import "../chat/app-chat.css";
import "./app-channels.css";

interface TariffInfo {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  paymentMethods: string[];
  cardNumber?: string | null;
  sbpQrUrl?: string | null;
}

type Method = { id: string; kind: "card" | "sbp" | "yukassa" | "link"; label: string; sub: string; link?: PublicPayLink };

/**
 * The design's purchase sheet (method list -> payment details with the receipt -> done) over the site's real payment flow for a channel
 * subscription: the author's own methods (card, QR / СБП, «Оплата по ссылке») are confirmed by hand after the receipt, ЮKassa pays online.
 * The requests are the same as the site's payment window makes (POST /api/payments, PATCH the receipt, a message with the receipt to the author).
 */
export default function AppBuySheet({ channel, onClose, onDone, flash }: { channel: ChannelItem; onClose: () => void; onDone: () => void; flash: (m: string) => void }) {
  const { t, locale } = useT();
  const [tariff, setTariff] = useState<TariffInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [links, setLinks] = useState<PublicPayLink[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const authorId = channel.author.id;

  // the author's tariff of this channel: the payment methods, the card number and the QR live there (the channel list does not carry them)
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(`/api/users/${authorId}/tariffs`);
        const all = r.ok ? ((await r.json()) as TariffInfo[]) : [];
        const mine = Array.isArray(all) ? all.find((x) => x.id === channel.id) || null : null;
        if (!alive) return;
        setTariff(mine);
        if (mine && hasLinkRef(mine.paymentMethods)) {
          const lr = await fetch(`/api/users/${authorId}/payment-links?tariffId=${encodeURIComponent(mine.id)}`);
          const d = lr.ok ? await lr.json() : [];
          if (alive) setLinks(Array.isArray(d) ? d : []);
        }
      } catch {
        /* the sheet says there is no way to pay */
      }
      if (alive) setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [authorId, channel.id]);

  const price = tariff ? Number(tariff.price) : channel.price;
  const amount = priceLabel(price, locale);
  const title = `${channel.name} · ${priceAndPeriod(price, tariff?.durationDays ?? channel.durationDays, locale)}`;

  const methods = useMemo<Method[]>(() => {
    if (!tariff) return [];
    const m = tariff.paymentMethods && tariff.paymentMethods.length ? tariff.paymentMethods : ["card"];
    const out: Method[] = [];
    if (m.includes("card")) out.push({ id: "card", kind: "card", label: t("pay.methodCardTitle"), sub: t("pay.methodCardDesc") });
    if (m.includes("sbp")) out.push({ id: "sbp", kind: "sbp", label: t("pay.methodSbpTitle"), sub: t("pay.methodSbpDesc") });
    for (const l of links) out.push({ id: `link:${l.id}`, kind: "link", label: t("pay.link.methodTitle", { label: l.label }), sub: `${t("pay.link.methodDesc")} · ${l.host}`, link: l });
    if (m.includes("yukassa")) out.push({ id: "yukassa", kind: "yukassa", label: "ЮKassa", sub: t("appch.buy.ykSub") });
    return out;
  }, [tariff, links, t]);
  const method = methods.find((x) => x.id === methodId) ?? null;

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    const bad = receiptProblem(f);
    if (bad) {
      setError(t(bad === "type" ? "pay.onlyImage" : "pay.maxSize10"));
      return;
    }
    setError("");
    setFile(f);
  };

  async function sendReceiptDm(receiptUrl: string) {
    try {
      const conv = await fetch("/api/messages/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: authorId }) });
      if (!conv.ok) return;
      const c = await conv.json();
      // the message goes to the author, not the buyer: it stays in the site's base language
      const text = receiptDmText("pay.dmSubscription", { title: String(tariff?.name ?? channel.name), price });
      const via = method?.link ? receiptDmText("pay.dmViaLink", { label: method.link.label, host: method.link.host }) : "";
      await fetch(`/api/messages/conversations/${c.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text + via, fileUrl: receiptUrl, fileName: receiptDmText("pay.receiptFileName"), fileType: "image" }) });
    } catch {
      /* the request itself is already created */
    }
  }

  async function payManual() {
    if (!tariff) return;
    if (!file) {
      setError(t("pay.attachReceipt"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "receipts");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      if (!up.ok) throw new Error(t("pay.screenshotUploadFailed"));
      const receiptUrl = (await up.json()).url as string;
      const res = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerId: authorId, subscriptionType: "tariff", tariffId: tariff.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("pay.paymentError"));
      const pid = data.paymentRequest?.id;
      if (pid) await fetch(`/api/payments/${pid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptUrl }) });
      await sendReceiptDm(receiptUrl);
      setStep(3);
      onDone();
    } catch (e) {
      setError((e as Error).message || t("pay.paymentError"));
    }
    setBusy(false);
  }

  async function payYukassa() {
    if (!tariff) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/yukassa/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tariffId: tariff.id, sellerId: authorId }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      setError(data.error || t("pay.paymentCreateError"));
    } catch {
      setError(t("pay.paymentCreateError"));
    }
    setBusy(false);
  }

  async function copyCard(card: string) {
    try {
      await navigator.clipboard.writeText(card.replace(/\s/g, ""));
      setCopied(true);
      flash(t("appch.buy.cardCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the number stays on screen */
    }
  }

  /* ---- step 1: the method ---- */
  if (step === 1) {
    return (
      <AppSheet
        title={t("appch.buy.title")}
        onClose={onClose}
        left={{ label: t("common.cancel"), onClick: onClose }}
        right={null}
        doneLabel={t("appui.chat.done")}
        intro={`${title}`}
        sections={
          loaded && methods.length
            ? [
                {
                  key: "m",
                  title: t("appch.buy.method"),
                  rows: methods.map((m) => ({ key: m.id, label: m.label, sub: m.sub, check: methodId === m.id, onClick: () => setMethodId(m.id) })),
                },
              ]
            : []
        }
        btn={{ label: t("appch.buy.next"), disabled: !method, onClick: () => method && setStep(2) }}
      >
        {!loaded && <div className="ach-sheetnote">{t("common.loading")}</div>}
        {loaded && !methods.length && <div className="ach-sheetnote">{tariff ? t("appch.buy.noMethods") : t("pay.authorNoChannels")}</div>}
      </AppSheet>
    );
  }

  /* ---- step 3: done ---- */
  if (step === 3) {
    return (
      <AppSheet title="" onClose={onClose} left={{ label: "", onClick: onClose }} right={null} doneLabel={t("appui.chat.done")}>
        <div className="ach-done">
          <div className="ach-done-ico">
            <AppIcon name="check" size={32} stroke={2} />
          </div>
          <div className="ach-done-title">{t("pay.requestSent")}</div>
          <div className="ach-done-text">{t("appch.buy.doneManual")}</div>
          <button type="button" className="ach-cta ach-done-btn" onClick={onClose}>
            {t("appui.chat.done")}
          </button>
        </div>
      </AppSheet>
    );
  }

  /* ---- step 2: the payment ---- */
  const yk = method?.kind === "yukassa";
  const canPay = !busy && (yk || !!file);
  const checked = method?.link ? validatePaymentLink(method.link.url) : null;
  return (
    <AppSheet title={t("appch.buy.title")} onClose={onClose} left={{ label: t("common.back"), onClick: () => setStep(1) }} right={null} doneLabel={t("appui.chat.done")}>
      <div className="ach-pay">
        <div className="ach-pay-head">
          <div className="ach-pay-amount">{amount}</div>
          <div className="ach-pay-title">{channel.name}</div>
          <div className="ach-pay-method">{method?.label}</div>
        </div>
        {method?.kind === "card" &&
          (tariff?.cardNumber ? (
            <div className="ach-pay-card">
              <div className="ach-pay-cardtxt">
                <div className="ach-pay-cardlabel">{t("appch.buy.cardNumber")}</div>
                <div className="ach-pay-cardnum">{tariff.cardNumber}</div>
              </div>
              <button type="button" className="ach-pay-copy" onClick={() => copyCard(tariff.cardNumber!)} aria-label={t("pay.copy")}>
                <AppIcon name={copied ? "check" : "clipb"} size={22} stroke={1.8} />
              </button>
            </div>
          ) : (
            <div className="ach-pay-info">{t("pay.cardMissing")}</div>
          ))}
        {method?.kind === "sbp" &&
          (tariff?.sbpQrUrl ? (
            <div className="ach-pay-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tariff.sbpQrUrl} alt={t("profile2.sbpQr")} />
              <span>{t("pay.qrScanHint")}</span>
            </div>
          ) : (
            <div className="ach-pay-info">{t("pay.qrMissing")}</div>
          ))}
        {method?.kind === "link" && method.link && (
          <div className="ach-pay-linkbox">
            {method.link.instruction && (
              <div className="ach-pay-info">
                <span className="ach-pay-dim">{t("pay.link.instructionTitle")}:</span> {method.link.instruction}
              </div>
            )}
            {checked && checked.ok ? (
              <>
                <a className="ach-pay-go" href={checked.url} target="_blank" rel="noopener noreferrer">
                  <AppIcon name="link" size={18} stroke={1.8} />
                  {t("pay.link.go")}
                </a>
                <div className="ach-pay-fine">{t("pay.link.checkDomain", { host: checked.host })}</div>
              </>
            ) : (
              <div className="ach-pay-info">{t("pay.cardMissing")}</div>
            )}
            <div className="ach-pay-fine">{t("pay.link.manualNotice")}</div>
          </div>
        )}
        {yk && <div className="ach-pay-info">{t("appch.buy.ykInfo")}</div>}
        {!yk && (
          <>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            <button type="button" className="ach-pay-receipt" data-on={file ? "1" : undefined} onClick={() => (file ? (setFile(null), void (fileRef.current && (fileRef.current.value = ""))) : fileRef.current?.click())}>
              <span className="ach-pay-rico">
                <AppIcon name={file ? "check" : "image"} size={22} stroke={1.8} />
              </span>
              <span className="ach-pay-rlabel">{file ? t("appch.buy.receiptAttached", { name: file.name.length > 22 ? `${file.name.slice(0, 20)}…` : file.name }) : t("appch.buy.attachReceipt")}</span>
            </button>
          </>
        )}
        {error && <div className="ach-pay-err">{error}</div>}
        <button type="button" className="ach-cta ach-pay-btn" data-off={canPay ? undefined : "1"} disabled={!canPay} onClick={yk ? payYukassa : payManual}>
          {busy ? t("pay.sending") : yk ? `${t("appch.buy.payNow")} ${amount}` : t("pay.iPaid")}
        </button>
        <div className="ach-pay-foot">{t("appch.buy.foot")}</div>
      </div>
    </AppSheet>
  );
}
