"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  PAYMENT_LINK_MAX_INSTRUCTION,
  PAYMENT_LINK_MAX_LABEL,
  PAYMENT_LINK_MAX_URL,
  normalizeLinkDetails,
  paymentLinkHost,
  validatePaymentLink,
} from "@/lib/payment-link";

export interface PaymentMethod {
  id: string;
  type: string;
  label: string;
  details: any;
  isDefault: boolean;
}

export const TYPE_ICONS: Record<string, string> = {
  card: "💳",
  yukassa: "🏦",
  crypto: "₿",
  sbp: "🔳",
  link: "🔗",
};

export const TYPE_LABELS: Record<string, string> = {
  card: "pay.pmCard",
  yukassa: "ЮKassa",
  crypto: "pay.pmCryptoWallet",
  sbp: "pay.pmSbp",
  link: "pay.pmLink",
};

/** Only ever put a re-validated https URL into href (legacy / hand-edited rows included). */
export function safeLinkUrl(u: unknown): string | null {
  const r = validatePaymentLink(u);
  return r.ok ? r.url : null;
}

export function detectCardType(num: string): string {
  const n = num.replace(/\s/g, "");
  if (/^2[0-9]{15}$/.test(n)) return "МИР";
  if (/^4[0-9]{12,18}$/.test(n)) return "Visa";
  if (/^5[1-5][0-9]{14}$/.test(n)) return "Mastercard";
  if (/^3[47][0-9]{13}$/.test(n)) return "AmEx";
  if (/^(62|81)[0-9]{14,17}$/.test(n)) return "UnionPay";
  return "";
}

export function validateCardNumber(num: string): string | null {
  const clean = num.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(clean)) return "pay.cardOnlyDigits";
  if (clean.length < 13) return "pay.cardMin13";
  if (clean.length > 19) return "pay.cardMax19";
  // Luhn check
  let sum = 0;
  let alt = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let d = parseInt(clean[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  if (sum % 10 !== 0) return "pay.cardInvalid";
  return null;
}

export function formatCardInput(val: string): string {
  const clean = val.replace(/\D/g, "").slice(0, 19);
  return clean.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export default function PaymentMethodsManager() {
  const { t } = useT();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // Add form
  const [addType, setAddType] = useState("card");
  const [addLabel, setAddLabel] = useState("");
  const [addCardNumber, setAddCardNumber] = useState("");
  const [addYukassaShopId, setAddYukassaShopId] = useState("");
  const [addYukassaSecret, setAddYukassaSecret] = useState("");
  const [addQrImageUrl, setAddQrImageUrl] = useState("");
  const [qrUploading, setQrUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardType, setCardType] = useState("");
  const [addLinkUrl, setAddLinkUrl] = useState("");
  const [addLinkNote, setAddLinkNote] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadMethods() {
    const res = await fetch("/api/payment-methods");
    if (res.ok) setMethods(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadMethods(); }, []);

  async function handleAdd() {
    if (!addLabel.trim()) return;
    if (addType === "card") {
      const err = validateCardNumber(addCardNumber);
      if (err) { setCardError(err); return; }
    }
    setFormError(null);
    let linkDetails: { url: string; instruction?: string } | null = null;
    if (addType === "link") {
      if (addLabel.trim().length > PAYMENT_LINK_MAX_LABEL) { setFormError(t("pay.link.saveError")); return; }
      const norm = normalizeLinkDetails({ url: addLinkUrl, instruction: addLinkNote });
      if (!norm.ok) { setLinkError(`pay.link.err.${norm.code}`); return; }
      linkDetails = norm.details;
    }
    setSaving(true);

    const details: any = {};
    const cleanCard = addCardNumber.replace(/\s/g, "");
    if (addType === "card") details.cardNumber = cleanCard;
    if (addType === "yukassa") {
      details.yukassaShopId = addYukassaShopId.trim();
      details.yukassaSecret = addYukassaSecret.trim();
    }
    if (addType === "sbp") {
      if (!addQrImageUrl) { setSaving(false); return; }
      details.qrImageUrl = addQrImageUrl;
    }

    if (linkDetails) Object.assign(details, linkDetails);

    const res = await fetch("/api/payment-methods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: addType,
        label: addLabel.trim(),
        details,
        isDefault: methods.length === 0,
      }),
    });

    if (addType === "link" && !res.ok) {
      // The server is the authority: show its code-based message in the user's language.
      const data = await res.json().catch(() => null);
      if (data?.code) setLinkError(`pay.link.err.${data.code}`);
      else setFormError(data?.error || t("pay.link.saveError"));
      setSaving(false);
      return;
    }

    setAddLabel(""); setAddCardNumber(""); setAddYukassaShopId(""); setAddYukassaSecret(""); setAddQrImageUrl("");
    setAddLinkUrl(""); setAddLinkNote(""); setLinkError(null);
    setShowAdd(false);
    setSaving(false);
    loadMethods();
  }

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", "payment-qr");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      if (data.url) setAddQrImageUrl(data.url);
    }
    setQrUploading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(t("pay.confirmDeletePm"))) return;
    await fetch(`/api/payment-methods?id=${id}`, { method: "DELETE" });
    loadMethods();
  }

  async function handleSetDefault(id: string) {
    await fetch("/api/payment-methods", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isDefault: true }),
    });
    loadMethods();
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("pm.title")}</h3>
        <button onClick={() => setShowAdd(!showAdd)}
          className="text-sm text-green-600 hover:text-green-700 font-medium">
          {showAdd ? t("common.cancel") : t("pm.add")}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">{t("pm.type")}</label>
            <select value={addType} onChange={(e) => { setAddType(e.target.value); setLinkError(null); setFormError(null); }}
              className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100">
              <option value="card">💳 {t("pay.pmCard")}</option>
              <option value="sbp">🔳 {t("pay.pmSbp")}</option>
              <option value="link">🔗 {t("pay.pmLink")}</option>
              <option value="yukassa">🏦 ЮKassa</option>
              <option value="crypto">₿ {t("pay.pmCrypto")}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">{t("pm.label")}</label>
            <input type="text" value={addLabel} onChange={(e) => setAddLabel(e.target.value)}
              maxLength={addType === "link" ? PAYMENT_LINK_MAX_LABEL : undefined}
              placeholder={t("pay.pmLabelPlaceholder")}
              className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
          </div>
          {addType === "card" && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                {t("pm.cardNumber")}
                {cardType && <span className="text-green-600 font-medium">{cardType}</span>}
              </label>
              <input type="text" value={addCardNumber}
                onChange={(e) => {
                  const formatted = formatCardInput(e.target.value);
                  setAddCardNumber(formatted);
                  setCardError(null);
                  setCardType(detectCardType(formatted));
                }}
                placeholder="0000 0000 0000 0000"
                maxLength={23}
                className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 font-mono tracking-wider ${
                  cardError ? "border-red-500" : "dark:border-gray-700"
                }`} />
              {cardError && <p className="text-xs text-red-500 mt-1">{t(cardError)}</p>}
            </div>
          )}
          {addType === "link" && (
            <>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t("pay.link.urlLabel")}</label>
                <input type="url" inputMode="url" autoComplete="off" spellCheck={false}
                  value={addLinkUrl}
                  maxLength={PAYMENT_LINK_MAX_URL}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAddLinkUrl(v);
                    // Live feedback once something is typed; the server re-checks on save.
                    const r = v.trim() ? validatePaymentLink(v) : null;
                    setLinkError(r && !r.ok ? `pay.link.err.${r.code}` : null);
                  }}
                  placeholder={t("pay.link.urlPlaceholder")}
                  className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 ${
                    linkError ? "border-red-500" : "dark:border-gray-700"
                  }`} />
                {linkError && <p className="text-xs text-red-500 mt-1">{t(linkError)}</p>}
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                  <span>{t("pay.link.noteLabel")}</span>
                  <span>{addLinkNote.length}/{PAYMENT_LINK_MAX_INSTRUCTION}</span>
                </label>
                <textarea value={addLinkNote} rows={2} maxLength={PAYMENT_LINK_MAX_INSTRUCTION}
                  onChange={(e) => setAddLinkNote(e.target.value)}
                  placeholder={t("pay.link.notePlaceholder")}
                  className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 resize-none" />
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-200">
                {t("pay.link.hint")}
              </div>
            </>
          )}
          {addType === "sbp" && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{t("profile2.sbpQr")}</label>
              {addQrImageUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={addQrImageUrl} alt="QR" className="w-16 h-16 rounded-lg border dark:border-gray-700 object-contain bg-white" />
                  <button type="button" onClick={() => setAddQrImageUrl("")} className="text-xs text-red-500 hover:text-red-700">{t("common.delete")}</button>
                </div>
              ) : (
                <label className="block w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-green-400 transition">
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleQrUpload} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {qrUploading ? t("common.loading") : t("pay.clickToUploadQr")}
                  </span>
                </label>
              )}
            </div>
          )}
          {addType === "yukassa" && (
            <>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Shop ID</label>
                <input type="text" value={addYukassaShopId} onChange={(e) => setAddYukassaShopId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Secret Key</label>
                <input type="text" value={addYukassaSecret} onChange={(e) => setAddYukassaSecret(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100" />
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-200">
                <div className="font-semibold mb-1">{t("pay.webhookTitle")}</div>
                <div className="mb-2">{t("pay.webhookStepPre")} <b>{t("pay.webhookStepPath")}</b> {t("pay.webhookStepPost")}</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white dark:bg-gray-900 px-2 py-1 rounded font-mono text-[11px] break-all">https://fomo.spot/api/yukassa/webhook</code>
                  <button type="button" onClick={() => navigator.clipboard?.writeText("https://fomo.spot/api/yukassa/webhook")}
                    className="text-blue-700 dark:text-blue-300 hover:underline whitespace-nowrap">{t("pay.copy")}</button>
                </div>
                <div className="mt-2">{t("pay.webhookEvents")} <code>payment.succeeded</code>, <code>payment.canceled</code>.</div>
              </div>
            </>
          )}
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <button onClick={handleAdd} disabled={saving || !addLabel.trim() || (addType === "sbp" && !addQrImageUrl) || (addType === "link" && (!addLinkUrl.trim() || !!linkError))}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
            {saving ? "..." : t("common.save")}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-sm text-gray-400 py-4 text-center">...</div>
      ) : methods.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center">{t("pm.noMethods")}</div>
      ) : (
        <div className="space-y-2">
          {methods.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg group">
              {m.type === "sbp" && m.details?.qrImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.details.qrImageUrl} alt="QR" className="w-9 h-9 rounded object-contain bg-white border dark:border-gray-700 shrink-0" />
              ) : (
                <span className="text-lg">{TYPE_ICONS[m.type] || "💳"}</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium dark:text-gray-100 flex items-center gap-2">
                  {m.label}
                  {m.isDefault && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded">{t("pm.default")}</span>}
                </div>
                <div className="text-xs text-gray-400">
                  {TYPE_LABELS[m.type] ? t(TYPE_LABELS[m.type]) : m.type}
                  {m.details?.cardNumber && ` · *${m.details.cardNumber.slice(-4)}`}
                  {m.type === "link" && paymentLinkHost(m.details?.url) && ` · ${paymentLinkHost(m.details?.url)}`}
                </div>
              </div>
              {m.type === "link" && safeLinkUrl(m.details?.url) && (
                <a href={safeLinkUrl(m.details?.url)!} target="_blank" rel="noopener noreferrer" title={t("pay.link.openTitle")}
                  className="text-xs text-green-600 hover:text-green-700 whitespace-nowrap">
                  {t("pay.link.open")} ↗
                </a>
              )}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                {!m.isDefault && (
                  <button onClick={() => handleSetDefault(m.id)} className="text-xs text-green-600 hover:text-green-700">{t("pm.default")}</button>
                )}
                <button onClick={() => handleDelete(m.id)} className="text-xs text-red-500 hover:text-red-700">{t("common.delete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
