"use client";

import { useRef, useState } from "react";
import {
  PAYMENT_LINK_MAX_INSTRUCTION,
  PAYMENT_LINK_MAX_LABEL,
  PAYMENT_LINK_MAX_URL,
  normalizeLinkDetails,
  validatePaymentLink,
} from "@/lib/payment-link";
import { detectCardType, formatCardInput, validateCardNumber } from "@/components/profile/PaymentMethodsManager";
import AppIcon from "../AppIcon";
import AppSheet, { type SheetSection } from "../chat/AppSheet";
import { useProf } from "./ProfileCtx";

type PmType = "card" | "sbp" | "link" | "yukassa" | "crypto";

const WEBHOOK = "https://fomo.spot/api/yukassa/webhook";

/** The design's `addpay` sheet: choose the kind of payment method, then fill it. Same validation and requests as the old «Способы оплаты» card. */
export default function PaymentMethodSheet({ methodsCount, onSaved, onClose }: { methodsCount: number; onSaved: () => void; onClose: () => void }) {
  const { t, flash } = useProf();
  const [type, setType] = useState<PmType | null>(null);
  const [label, setLabel] = useState("");
  const [card, setCard] = useState("");
  const [cardErr, setCardErr] = useState<string | null>(null);
  const [shopId, setShopId] = useState("");
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const kinds: { key: PmType; label: string; icon: string }[] = [
    { key: "card", label: t("pay.pmCard"), icon: "💳" },
    { key: "sbp", label: t("pay.pmSbp"), icon: "🔳" },
    { key: "link", label: t("pay.pmLink"), icon: "🔗" },
    { key: "yukassa", label: "ЮKassa", icon: "🏦" },
    { key: "crypto", label: t("pay.pmCrypto"), icon: "₿" },
  ];

  async function uploadQr(file: File) {
    setQrBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "payment-qr");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        if (data.url) setQr(data.url);
      }
    } catch {
      /* the form simply stays without a QR */
    }
    setQrBusy(false);
  }

  async function save() {
    if (!type || !label.trim()) return;
    if (type === "card") {
      const err = validateCardNumber(card);
      if (err) {
        setCardErr(err);
        return;
      }
    }
    setFormErr(null);
    let linkDetails: { url: string; instruction?: string } | null = null;
    if (type === "link") {
      if (label.trim().length > PAYMENT_LINK_MAX_LABEL) {
        setFormErr(t("pay.link.saveError"));
        return;
      }
      const norm = normalizeLinkDetails({ url: linkUrl, instruction: linkNote });
      if (!norm.ok) {
        setLinkErr(`pay.link.err.${norm.code}`);
        return;
      }
      linkDetails = norm.details;
    }
    const details: Record<string, unknown> = {};
    if (type === "card") details.cardNumber = card.replace(/\s/g, "");
    if (type === "yukassa") {
      details.yukassaShopId = shopId.trim();
      details.yukassaSecret = secret.trim();
    }
    if (type === "sbp") {
      if (!qr) return;
      details.qrImageUrl = qr;
    }
    if (linkDetails) Object.assign(details, linkDetails);

    setSaving(true);
    try {
      const res = await fetch("/api/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, label: label.trim(), details, isDefault: methodsCount === 0 }),
      });
      if (!res.ok && type === "link") {
        // the server is the authority: show its code-based message in the user's language
        const data = await res.json().catch(() => null);
        if (data?.code) setLinkErr(`pay.link.err.${data.code}`);
        else setFormErr(data?.error || t("pay.link.saveError"));
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setFormErr(t("profile2.saveError"));
        setSaving(false);
        return;
      }
    } catch {
      setFormErr(t("profile2.saveError"));
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  // step 1: the kinds
  if (!type) {
    return (
      <AppSheet
        title={t("appprof.paymentMethod")}
        onClose={onClose}
        doneLabel={t("appui.chat.done")}
        intro={t("appprof.payFoot")}
        sections={[
          {
            key: "k",
            rows: kinds.map((k) => ({ key: k.key, label: k.label, icon: <span style={{ fontSize: 17 }}>{k.icon}</span>, chev: true, onClick: () => setType(k.key) })),
          },
        ]}
      />
    );
  }

  const sections: SheetSection[] = [];
  sections.push({
    key: "base",
    rows: [{ key: "label", label: t("pm.label"), field: { value: label, ph: t("pay.pmLabelPlaceholder"), onChange: setLabel, maxLength: type === "link" ? PAYMENT_LINK_MAX_LABEL : 60 } }],
  });
  if (type === "card")
    sections.push({
      key: "card",
      footer: cardErr ? <span style={{ color: "var(--app-red)" }}>{t(cardErr)}</span> : undefined,
      rows: [
        {
          key: "num",
          label: t("pm.cardNumber"),
          sub: detectCardType(card) || undefined,
          field: {
            value: card,
            ph: "0000 0000 0000 0000",
            onChange: (v) => {
              setCard(formatCardInput(v));
              setCardErr(null);
            },
            maxLength: 23,
            inputMode: "numeric",
            mono: true,
            autoComplete: "off",
          },
        },
      ],
    });
  if (type === "link")
    sections.push({
      key: "link",
      footer: linkErr ? <span style={{ color: "var(--app-red)" }}>{t(linkErr)}</span> : t("pay.link.hint"),
      rows: [
        {
          key: "url",
          label: t("pay.link.urlLabel"),
          field: {
            value: linkUrl,
            ph: t("pay.link.urlPlaceholder"),
            onChange: (v) => {
              setLinkUrl(v);
              const r = v.trim() ? validatePaymentLink(v) : null;
              setLinkErr(r && !r.ok ? `pay.link.err.${r.code}` : null);
            },
            maxLength: PAYMENT_LINK_MAX_URL,
            type: "url",
            inputMode: "url",
            autoComplete: "off",
          },
        },
        {
          key: "note",
          label: `${t("pay.link.noteLabel")} (${linkNote.length}/${PAYMENT_LINK_MAX_INSTRUCTION})`,
          field: { value: linkNote, ph: t("pay.link.notePlaceholder"), onChange: setLinkNote, maxLength: PAYMENT_LINK_MAX_INSTRUCTION, multiline: true },
        },
      ],
    });
  if (type === "sbp")
    sections.push({
      key: "sbp",
      rows: [
        {
          key: "qr",
          label: t("profile2.sbpQr"),
          extra: (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ap-qr" src={qr} alt="QR" />
              ) : (
                <div className="ap-qr-empty" role="button" tabIndex={0} onClick={() => fileRef.current?.click()}>
                  <AppIcon name="image" size={26} stroke={1.5} />
                </div>
              )}
              <div className="ac-acts" style={{ marginTop: 0 }}>
                <span role="button" tabIndex={0} className="ac-act" data-off={qrBusy ? "1" : undefined} onClick={() => fileRef.current?.click()}>
                  {qrBusy ? t("common.loading") : qr ? t("profile2.replaceQr") : t("pay.clickToUploadQr")}
                </span>
                {qr && (
                  <span role="button" tabIndex={0} className="ac-act" data-tone="danger" onClick={() => setQr("")}>
                    {t("common.delete")}
                  </span>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadQr(file);
                  e.target.value = "";
                }}
              />
            </div>
          ),
        },
      ],
    });
  if (type === "yukassa")
    sections.push({
      key: "yk",
      footer: (
        <>
          <b>{t("pay.webhookTitle")}</b>
          <br />
          {t("pay.webhookStepPre")} <b>{t("pay.webhookStepPath")}</b> {t("pay.webhookStepPost")}
          <br />
          <code style={{ fontSize: 12, wordBreak: "break-all" }}>{WEBHOOK}</code>{" "}
          <span
            role="button"
            tabIndex={0}
            style={{ color: "var(--app-green-tx)", fontWeight: 600 }}
            onClick={() => {
              void navigator.clipboard?.writeText(WEBHOOK);
              flash(t("pay.copy"));
            }}
          >
            {t("pay.copy")}
          </span>
          <br />
          {t("pay.webhookEvents")} payment.succeeded, payment.canceled.
        </>
      ),
      rows: [
        { key: "shop", label: "Shop ID", field: { value: shopId, ph: "", onChange: setShopId, autoComplete: "off", mono: true } },
        { key: "sec", label: "Secret Key", field: { value: secret, ph: "", onChange: setSecret, autoComplete: "off", mono: true } },
      ],
    });

  const kind = kinds.find((k) => k.key === type);
  const blocked = saving || !label.trim() || (type === "sbp" && !qr) || (type === "link" && (!linkUrl.trim() || !!linkErr)) || (type === "card" && !card.trim());

  return (
    <AppSheet
      title={kind?.label || t("appprof.paymentMethod")}
      onClose={onClose}
      left={{ label: t("common.back"), onClick: () => setType(null) }}
      right={null}
      doneLabel={t("appui.chat.done")}
      height="full"
      intro={formErr ? <span style={{ color: "var(--app-red)" }}>{formErr}</span> : undefined}
      sections={sections}
      btn={{ label: saving ? "…" : t("common.save"), disabled: blocked, onClick: () => void save() }}
    />
  );
}
