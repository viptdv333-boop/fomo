"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { unregisterNativePush } from "@/lib/native-push";
import AppIcon from "../AppIcon";
import AppSheet, { Sections, type SheetSection } from "../chat/AppSheet";
import { useProf } from "./ProfileCtx";
import { ScreenFrame } from "./parts";

type Msg = { text: string; error: boolean } | null;

function MsgLine({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <span style={{ color: msg.error ? "var(--app-red)" : "var(--app-green-tx)" }}>{msg.text}</span>;
}

/** «Сменить пароль» sheet: the old tab's form (current, new, confirm) on the same endpoint. */
function PasswordSheet({ onClose }: { onClose: () => void }) {
  const { t, flash } = useProf();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const type = show ? "text" : "password";

  async function submit() {
    setMsg(null);
    if (next !== conf) {
      setMsg({ text: t("profile2.passwordsMismatch"), error: true });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: cur, newPassword: next }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCur("");
        setNext("");
        setConf("");
        flash(data.message || t("appprof.passwordChanged"));
        onClose();
        return;
      }
      setMsg({ text: data.error || t("profile2.saveError"), error: true });
    } catch {
      setMsg({ text: t("profile2.saveError"), error: true });
    }
    setBusy(false);
  }

  return (
    <AppSheet
      title={t("profile.changePassword")}
      onClose={onClose}
      left={{ label: t("common.cancel"), onClick: onClose }}
      right={null}
      doneLabel={t("appui.chat.done")}
      intro={msg ? <MsgLine msg={msg} /> : undefined}
      sections={[
        {
          key: "f",
          rows: [
            { key: "c", label: t("profile.currentPassword"), field: { value: cur, ph: "", onChange: setCur, type, autoComplete: "current-password" } },
            { key: "n", label: t("profile.newPassword"), field: { value: next, ph: "", onChange: setNext, type, autoComplete: "new-password" } },
            { key: "k", label: t("profile.confirmPassword"), field: { value: conf, ph: "", onChange: setConf, type, autoComplete: "new-password" } },
            { key: "s", label: t("appprof.showPasswords"), icon: <AppIcon name="eye" size={18} stroke={1.8} />, toggle: show, onClick: () => setShow((v) => !v) },
          ],
        },
      ]}
      btn={{ label: busy ? "…" : t("profile.changePassword"), disabled: busy || !cur || next.length < 6 || !conf, onClick: () => void submit() }}
    />
  );
}

/** «Сменить почту» sheet: two steps as before (new address + password, then the 6-digit code from the letter). */
function EmailSheet({ onClose }: { onClose: () => void }) {
  const { t, flash, refreshSession } = useProf();
  const [step, setStep] = useState<"form" | "code">("form");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/change-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      return { ok: res.ok, data };
    } catch {
      setBusy(false);
      return { ok: false, data: { error: t("profile2.saveError") } };
    }
  }
  async function sendCode() {
    const r = await call({ action: "send-code", newEmail, password });
    if (r.ok) {
      setStep("code");
      setMsg({ text: r.data.message || `${t("profile2.codeSentTo")} ${newEmail}`, error: false });
    } else setMsg({ text: r.data.error || t("profile2.saveError"), error: true });
  }
  async function verify() {
    const r = await call({ action: "verify", newEmail, code });
    if (r.ok) {
      flash(r.data.message || t("profile2.saved"));
      await refreshSession();
      onClose();
    } else setMsg({ text: r.data.error || t("profile2.saveError"), error: true });
  }

  return (
    <AppSheet
      title={t("profile.changeEmail")}
      onClose={onClose}
      left={step === "code" ? { label: t("common.back"), onClick: () => { setStep("form"); setCode(""); setMsg(null); } } : { label: t("common.cancel"), onClick: onClose }}
      right={null}
      doneLabel={t("appui.chat.done")}
      intro={msg ? <MsgLine msg={msg} /> : step === "code" ? `${t("profile2.codeSentTo")} ${newEmail}` : undefined}
      sections={
        step === "form"
          ? [
              {
                key: "f",
                rows: [
                  { key: "e", label: t("profile.newEmail"), field: { value: newEmail, ph: "name@example.com", onChange: setNewEmail, type: "email", inputMode: "email", autoComplete: "email" } },
                  { key: "p", label: t("profile.currentPassword"), field: { value: password, ph: "", onChange: setPassword, type: show ? "text" : "password", autoComplete: "current-password" } },
                  { key: "s", label: t("appprof.showPasswords"), icon: <AppIcon name="eye" size={18} stroke={1.8} />, toggle: show, onClick: () => setShow((v) => !v) },
                ],
              },
            ]
          : [{ key: "c", rows: [{ key: "code", label: t("profile.code"), field: { value: code, ph: "123456", onChange: (v: string) => setCode(v.replace(/\D/g, "").slice(0, 6)), maxLength: 6, inputMode: "numeric", mono: true, autoComplete: "one-time-code" } }] }]
      }
      btn={
        step === "form"
          ? { label: busy ? "…" : t("profile.sendCode"), disabled: busy || !newEmail.trim() || !password, onClick: () => void sendCode() }
          : { label: busy ? "…" : t("profile.confirm"), disabled: busy || code.length < 6, onClick: () => void verify() }
      }
    />
  );
}

/** «Безопасность» (the design's `security`): the e-mail, its change, the password change, sign out. */
export default function SecurityScreen() {
  const { t, user } = useProf();
  const [sheet, setSheet] = useState<"email" | "password" | null>(null);

  const sections: SheetSection[] = [
    {
      key: "mail",
      title: t("appprof.mail"),
      rows: [
        { key: "addr", label: user?.email || "—", icon: <AppIcon name="mail" size={18} stroke={1.8} /> },
        { key: "chg", label: t("profile.changeEmail"), color: "var(--app-green-tx)", onClick: () => setSheet("email") },
      ],
    },
    {
      key: "pw",
      title: t("appprof.password"),
      rows: [{ key: "pw", label: t("profile.changePassword"), icon: <AppIcon name="key" size={18} stroke={1.8} />, chev: true, onClick: () => setSheet("password") }],
    },
    {
      key: "out",
      rows: [
        {
          key: "out",
          label: t("appprof.signOutAccount"),
          color: "var(--app-red)",
          onClick: () => void unregisterNativePush().finally(() => signOut({ callbackUrl: "/" })),
        },
      ],
    },
  ];

  return (
    <ScreenFrame title={t("profile.security")}>
      <Sections sections={sections} />
      {sheet === "email" && <EmailSheet onClose={() => setSheet(null)} />}
      {sheet === "password" && <PasswordSheet onClose={() => setSheet(null)} />}
    </ScreenFrame>
  );
}
