"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { ChannelId, ExternalChannel } from "@/lib/notification-events";
import type { ChannelState, SettingsResponse } from "@/lib/notify-settings-types";
import { getExistingPushSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";
import type { NotifApi } from "./api";
import { ChannelIcon, Switch } from "./ui";

type Msg = { kind: "ok" | "err"; text: string } | null;

const btnPrimary = "rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50";
const btnGhost = "rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800";
const btnDanger = "rounded-lg px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30";
const inputCls = "w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";

function StatusBadge({ st }: { st: ChannelState }) {
  const { t } = useT();
  const paused = st.status === "paused" && st.lastError;
  const text =
    st.status === "error"
      ? t("ns.status.error", { reason: st.lastError ?? "" })
      : paused
        ? t("ns.status.pausedError", { reason: st.lastError ?? "" })
        : t(`ns.status.${st.status}`);
  const tone =
    st.status === "connected"
      ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
      : st.status === "pending"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
        : st.status === "error" || paused
          ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`} title={text}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function CardShell({
  channel,
  name,
  desc,
  badge,
  toggle,
  children,
}: {
  channel: ChannelId;
  name: string;
  desc: string;
  badge: React.ReactNode;
  toggle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900" data-channel={channel}>
      <header className="flex items-start gap-3">
        <ChannelIcon channel={channel} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{name}</h4>
            {toggle}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
          <div className="mt-1.5 min-w-0">{badge}</div>
        </div>
      </header>
      {children}
    </article>
  );
}

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role="status" className={`text-xs ${msg.kind === "ok" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
      {msg.text}
    </p>
  );
}

/** Busy flag + message around an async action. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setMsg(null);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, msg, setMsg, run };
}

function fmtWhen(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(locale === "cn" ? "zh-CN" : locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

interface CardProps {
  st: ChannelState;
  api: NotifApi;
  reload: () => Promise<void>;
}

/** Shared bottom row of a connected channel: test + disconnect, last delivery time. */
function ConnectedFooter({ st, api, reload, extra }: CardProps & { extra?: React.ReactNode }) {
  const { t, locale } = useT();
  const { busy, msg, setMsg, run } = useAction();
  const name = t(`ns.ch.${st.channel}`);
  return (
    <div className="flex flex-col gap-2">
      {(st.address || st.label) && (
        <p className="break-words text-xs text-gray-600 dark:text-gray-300">
          <span className="font-mono">{st.label ? `${st.label} · ` : ""}{st.address}</span>
          {st.lastSentAt && <span className="text-gray-400"> · {t("ns.lastSent", { when: fmtWhen(st.lastSentAt, locale) })}</span>}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={busy || !st.verified}
          onClick={() =>
            run(async () => {
              const r = await api.test(st.channel);
              setMsg(r.ok ? { kind: "ok", text: t("ns.sent") } : { kind: "err", text: t("ns.testFailed", { reason: r.error ?? "" }) });
              await reload();
            })
          }
        >
          {t("ns.btn.test")}
        </button>
        {extra}
        <button
          type="button"
          className={btnDanger}
          disabled={busy}
          onClick={() => {
            if (!window.confirm(t("ns.disconnectConfirm", { channel: name }))) return;
            run(async () => {
              await api.remove(st.channel);
              await reload();
            });
          }}
        >
          {t("ns.btn.disconnect")}
        </button>
      </div>
      <Note msg={msg} />
    </div>
  );
}

function EnableToggle({ st, api, reload }: CardProps) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  if (!st.verified) return null;
  return (
    <Switch
      checked={st.enabled}
      disabled={busy}
      label={t("ns.toggleChannel", { channel: t(`ns.ch.${st.channel}`) })}
      onChange={async (next) => {
        setBusy(true);
        await api.setEnabled(st.channel, next);
        await reload();
        setBusy(false);
      }}
    />
  );
}

function NotConfigured() {
  const { t } = useT();
  return <p className="text-xs text-gray-500 dark:text-gray-400">{t("ns.notConfiguredHint")}</p>;
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

function EmailCard(p: CardProps & { accountEmail: string | null }) {
  const { t } = useT();
  const { st, api, reload, accountEmail } = p;
  const { busy, msg, setMsg, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const awaitingCode = st.status === "pending" || Boolean(sentTo);
  const showForm = !st.verified || editing;

  return (
    <CardShell
      channel="email"
      name={t("ns.ch.email")}
      desc={t("ns.ch.email.d")}
      badge={<StatusBadge st={st} />}
      toggle={<EnableToggle {...p} />}
    >
      {!st.configured ? (
        <NotConfigured />
      ) : (
        <>
          {st.verified && <ConnectedFooter {...p} extra={!editing && <button type="button" className={btnGhost} onClick={() => setEditing(true)}>{t("ns.btn.change")}</button>} />}
          {showForm && !awaitingCode && (
            <div className="flex flex-col gap-2">
              {accountEmail && !st.verified && (
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await api.start("email", { useAccountEmail: true });
                      if (!r.ok) setMsg({ kind: "err", text: r.error ?? "" });
                      await reload();
                    })
                  }
                >
                  {t("ns.email.account", { email: accountEmail })}
                </button>
              )}
              <label className="text-xs text-gray-500 dark:text-gray-400" htmlFor="ns-email-input">{t("ns.email.other")}</label>
              <div className="flex gap-2">
                <input id="ns-email-input" type="email" inputMode="email" autoComplete="email" className={inputCls} placeholder={t("ns.email.placeholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || !email.includes("@")}
                  onClick={() =>
                    run(async () => {
                      const r = await api.start("email", { email });
                      if (r.ok) {
                        setSentTo(email);
                        setMsg({ kind: "ok", text: t("ns.email.codeSent", { email, minutes: 15 }) });
                        setEditing(false);
                      } else setMsg({ kind: "err", text: r.error ?? "" });
                      await reload();
                    })
                  }
                >
                  {t("ns.btn.sendCode")}
                </button>
              </div>
              {editing && <button type="button" className={`${btnGhost} self-start`} onClick={() => setEditing(false)}>{t("ns.btn.cancel")}</button>}
            </div>
          )}
          {awaitingCode && !st.verified && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${inputCls} font-mono tracking-widest`} placeholder={t("ns.email.codePlaceholder")} aria-label={t("ns.email.codePlaceholder")} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || code.length !== 6}
                  onClick={() =>
                    run(async () => {
                      const r = await api.confirm("email", code);
                      if (r.ok) {
                        setCode("");
                        setSentTo("");
                      } else setMsg({ kind: "err", text: r.error ?? "" });
                      await reload();
                    })
                  }
                >
                  {t("ns.btn.confirm")}
                </button>
              </div>
              <button
                type="button"
                className={`${btnGhost} self-start`}
                onClick={() =>
                  run(async () => {
                    await api.remove("email");
                    setSentTo("");
                    setCode("");
                    await reload();
                  })
                }
              >
                {t("ns.btn.cancel")}
              </button>
            </div>
          )}
          <Note msg={msg} />
        </>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Telegram / MAX / VK — deep link
// ---------------------------------------------------------------------------

function DeepLinkCard(p: CardProps & { channel: "max" | "vk"; openLabelKey: string; hintKey: string; extra?: React.ReactNode }) {
  const { t } = useT();
  const { st, api, reload, channel } = p;
  const { busy, msg, setMsg, run } = useAction();
  const [link, setLink] = useState<string | null>(null);
  const waiting = st.status === "pending" || Boolean(link && !st.verified);

  // While the user is in the messenger, poll for the webhook to finish the link.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => void reloadRef.current(), 4000);
    return () => clearInterval(id);
  }, [waiting]);
  useEffect(() => {
    if (st.verified) setLink(null);
  }, [st.verified]);

  const connect = () =>
    run(async () => {
      const r = await api.start(channel);
      if (!r.ok || !r.deepLink) {
        setMsg({ kind: "err", text: r.error ?? "" });
        return;
      }
      setLink(r.deepLink);
      try {
        window.open(r.deepLink, "_blank", "noopener,noreferrer");
      } catch {
        /* popup blocked — the visible button below does the same */
      }
      await reload();
    });

  return (
    <CardShell channel={channel} name={t(`ns.ch.${channel}`)} desc={t(`ns.ch.${channel}.d`)} badge={<StatusBadge st={st} />} toggle={<EnableToggle {...p} />}>
      {!st.configured ? (
        <NotConfigured />
      ) : (
        <>
          {st.verified && <ConnectedFooter {...p} extra={<button type="button" className={btnGhost} disabled={busy} onClick={connect}>{t("ns.btn.reconnect")}</button>} />}
          {!st.verified && !waiting && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t(p.hintKey)}</p>
              <button type="button" className={`${btnPrimary} self-start`} disabled={busy} onClick={connect}>{t("ns.btn.connect")}</button>
            </div>
          )}
          {!st.verified && waiting && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("ns.link.waiting")}</p>
              <div className="flex flex-wrap gap-2">
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className={btnPrimary}>{t(p.openLabelKey)}</a>
                ) : (
                  <button type="button" className={btnPrimary} disabled={busy} onClick={connect}>{t("ns.btn.connect")}</button>
                )}
                <button type="button" className={btnGhost} onClick={() => void reload()}>{t("ns.link.refresh")}</button>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() =>
                    run(async () => {
                      await api.remove(channel);
                      setLink(null);
                      await reload();
                    })
                  }
                >
                  {t("ns.btn.cancel")}
                </button>
              </div>
            </div>
          )}
          <Note msg={msg} />
        </>
      )}
      {p.extra}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Telegram — the user's OWN bot (no server config needed)
// ---------------------------------------------------------------------------

const TG_TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;
const TG_POLL_MS = 5000;

function TelegramCard(p: CardProps & { extra?: React.ReactNode }) {
  const { t } = useT();
  const { st, api, reload } = p;
  const { busy, msg, setMsg, run } = useAction();
  const [token, setToken] = useState("");
  const [changing, setChanging] = useState(false);
  const [siteLink, setSiteLink] = useState<string | null>(null);

  const botName = st.ownBot && st.label ? st.label.replace(/^@/, "") : "";
  const waitingOwn = st.status === "pending" && st.ownBot && Boolean(botName);
  const waitingSite = (st.status === "pending" && !st.ownBot) || Boolean(siteLink && !st.verified);
  const showSetup = (!st.verified && !waitingOwn && !waitingSite) || changing;

  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const apiRef = useRef(api);
  apiRef.current = api;

  // After "Check": poll for the Start press (own bot: we resolve the chat id ourselves).
  useEffect(() => {
    if (!waitingOwn) return;
    let stop = false;
    const id = setInterval(async () => {
      if (stop || document.hidden) return;
      const r = await apiRef.current.confirmTelegram();
      if (!stop && r.ok && r.verified) {
        setMsg(r.testError ? { kind: "err", text: t("ns.tg.bot.connectedNoTest", { reason: r.testError }) } : { kind: "ok", text: t("ns.tg.bot.connected") });
        await reloadRef.current();
      }
    }, TG_POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingOwn]);

  // Site bot (optional): its webhook completes the link, we only watch the status.
  useEffect(() => {
    if (!waitingSite) return;
    const id = setInterval(() => void reloadRef.current(), 4000);
    return () => clearInterval(id);
  }, [waitingSite]);
  useEffect(() => {
    if (st.verified) {
      setSiteLink(null);
      setChanging(false);
    }
  }, [st.verified]);

  const tokenOk = TG_TOKEN_RE.test(token.trim());

  const check = () =>
    run(async () => {
      const r = await api.start("telegram", { botToken: token.trim() });
      if (!r.ok) {
        setMsg({ kind: "err", text: r.error ?? "" });
        return;
      }
      setToken("");
      setChanging(false);
      setMsg({ kind: "ok", text: t("ns.tg.bot.found", { bot: r.botUsername ?? "" }) });
      await reload();
    });

  const pressed = () =>
    run(async () => {
      const r = await api.confirmTelegram();
      if (!r.ok) {
        setMsg({ kind: "err", text: r.error ?? "" });
        return;
      }
      setMsg(r.testError ? { kind: "err", text: t("ns.tg.bot.connectedNoTest", { reason: r.testError }) } : { kind: "ok", text: t("ns.tg.bot.connected") });
      await reload();
    });

  const connectSite = () =>
    run(async () => {
      const r = await api.start("telegram");
      if (!r.ok || !r.deepLink) {
        setMsg({ kind: "err", text: r.error ?? "" });
        return;
      }
      setSiteLink(r.deepLink);
      try {
        window.open(r.deepLink, "_blank", "noopener,noreferrer");
      } catch {
        /* popup blocked — the visible button below does the same */
      }
      await reload();
    });

  const cancel = () =>
    run(async () => {
      await api.remove("telegram");
      setSiteLink(null);
      setChanging(false);
      await reload();
    });

  const muted = "text-xs text-gray-500 dark:text-gray-400";
  const linkCls = "font-medium text-green-700 underline hover:no-underline dark:text-green-400";

  return (
    <CardShell channel="telegram" name={t("ns.ch.telegram")} desc={t("ns.ch.telegram.d")} badge={<StatusBadge st={st} />} toggle={<EnableToggle {...p} />}>
      {st.verified && !changing && (
        <ConnectedFooter {...p} extra={<button type="button" className={btnGhost} disabled={busy} onClick={() => setChanging(true)}>{t("ns.tg.bot.changeBot")}</button>} />
      )}

      {showSetup && (
        <div className="flex flex-col gap-2">
          <p className={muted}>
            {t("ns.tg.bot.step1")}{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className={linkCls}>{t("ns.tg.bot.openBotFather")}</a>
          </p>
          <label htmlFor="ns-tg-token" className={muted}>{t("ns.tg.bot.step2")}</label>
          <div className="flex gap-2">
            <input
              id="ns-tg-token"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`${inputCls} font-mono`}
              aria-label={t("ns.tg.bot.tokenLabel")}
              placeholder={t("ns.tg.bot.tokenPlaceholder")}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tokenOk && !busy) void check();
              }}
            />
            <button type="button" className={btnPrimary} disabled={busy || !tokenOk} onClick={check}>{t("ns.tg.bot.check")}</button>
          </div>
          <p className={muted}>{t("ns.tg.bot.privacy")}</p>
          <div className="flex flex-wrap gap-2">
            {changing && (
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setChanging(false);
                  setToken("");
                  setMsg(null);
                }}
              >
                {t("ns.btn.cancel")}
              </button>
            )}
            {!changing && st.siteBot && (
              <button type="button" className={btnGhost} disabled={busy} onClick={connectSite}>{t("ns.tg.bot.siteBot")}</button>
            )}
          </div>
        </div>
      )}

      {waitingOwn && !changing && (
        <div className="flex flex-col gap-2">
          <p className={muted}>{t("ns.tg.bot.step3", { bot: botName })}</p>
          <p className={muted}>{t("ns.tg.bot.step4")}</p>
          <div className="flex flex-wrap gap-2">
            <a href={`https://t.me/${botName}`} target="_blank" rel="noopener noreferrer" className={btnGhost}>{t("ns.tg.bot.openBot", { bot: botName })}</a>
            <button type="button" className={btnPrimary} disabled={busy} onClick={pressed}>{t("ns.tg.bot.pressed")}</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={cancel}>{t("ns.tg.bot.otherToken")}</button>
          </div>
          <p className={muted}>{t("ns.tg.bot.auto")}</p>
        </div>
      )}

      {waitingSite && !changing && (
        <div className="flex flex-col gap-2">
          <p className={muted}>{t("ns.link.waiting")}</p>
          <div className="flex flex-wrap gap-2">
            {siteLink ? (
              <a href={siteLink} target="_blank" rel="noopener noreferrer" className={btnPrimary}>{t("ns.btn.openTelegram")}</a>
            ) : (
              <button type="button" className={btnPrimary} disabled={busy} onClick={connectSite}>{t("ns.btn.connect")}</button>
            )}
            <button type="button" className={btnGhost} onClick={() => void reload()}>{t("ns.link.refresh")}</button>
            <button type="button" className={btnGhost} disabled={busy} onClick={cancel}>{t("ns.btn.cancel")}</button>
          </div>
        </div>
      )}

      <Note msg={msg} />
      {p.extra}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

function WhatsAppCard(p: CardProps) {
  const { t } = useT();
  const { st, api, reload } = p;
  const { busy, msg, setMsg, run } = useAction();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(false);
  const awaitingCode = (st.status === "pending" || sent) && !st.verified;

  return (
    <CardShell channel="whatsapp" name={t("ns.ch.whatsapp")} desc={t("ns.ch.whatsapp.d")} badge={<StatusBadge st={st} />} toggle={<EnableToggle {...p} />}>
      {!st.configured ? (
        <NotConfigured />
      ) : (
        <>
          {st.verified && <ConnectedFooter {...p} extra={!editing && <button type="button" className={btnGhost} onClick={() => setEditing(true)}>{t("ns.btn.change")}</button>} />}
          {(!st.verified || editing) && !awaitingCode && (
            <div className="flex flex-col gap-2">
              <label htmlFor="ns-wa-phone" className="text-xs text-gray-500 dark:text-gray-400">{t("ns.wa.phone")}</label>
              <div className="flex gap-2">
                <input id="ns-wa-phone" type="tel" inputMode="tel" autoComplete="tel" className={inputCls} placeholder={t("ns.wa.placeholder")} value={phone} onChange={(e) => setPhone(e.target.value)} />
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || phone.replace(/\D/g, "").length < 8}
                  onClick={() =>
                    run(async () => {
                      const r = await api.start("whatsapp", { phone });
                      if (r.ok) {
                        setSent(true);
                        setEditing(false);
                        setMsg({ kind: "ok", text: t("ns.wa.codeSent") });
                      } else setMsg({ kind: "err", text: r.error ?? "" });
                      await reload();
                    })
                  }
                >
                  {t("ns.btn.sendCode")}
                </button>
              </div>
              <p className="text-[11px] text-gray-400">{t("ns.wa.note")}</p>
              {editing && <button type="button" className={`${btnGhost} self-start`} onClick={() => setEditing(false)}>{t("ns.btn.cancel")}</button>}
            </div>
          )}
          {awaitingCode && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${inputCls} font-mono tracking-widest`} placeholder={t("ns.email.codePlaceholder")} aria-label={t("ns.email.codePlaceholder")} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || code.length !== 6}
                  onClick={() =>
                    run(async () => {
                      const r = await api.confirm("whatsapp", code);
                      if (r.ok) {
                        setCode("");
                        setSent(false);
                      } else setMsg({ kind: "err", text: r.error ?? "" });
                      await reload();
                    })
                  }
                >
                  {t("ns.btn.confirm")}
                </button>
              </div>
              <button
                type="button"
                className={`${btnGhost} self-start`}
                onClick={() =>
                  run(async () => {
                    await api.remove("whatsapp");
                    setSent(false);
                    setCode("");
                    await reload();
                  })
                }
              >
                {t("ns.btn.cancel")}
              </button>
            </div>
          )}
          <Note msg={msg} />
        </>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

function WebhookCard(p: CardProps) {
  const { t } = useT();
  const { st, api, reload } = p;
  const { busy, msg, setMsg, run } = useAction();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <CardShell channel="webhook" name={t("ns.ch.webhook")} desc={t("ns.ch.webhook.d")} badge={<StatusBadge st={st} />} toggle={<EnableToggle {...p} />}>
      {st.verified && <ConnectedFooter {...p} extra={!editing && <button type="button" className={btnGhost} onClick={() => setEditing(true)}>{t("ns.btn.change")}</button>} />}
      {(!st.verified || editing) && (
        <div className="flex flex-col gap-2">
          <label htmlFor="ns-hook-url" className="text-xs text-gray-500 dark:text-gray-400">{t("ns.webhook.url")}</label>
          <input id="ns-hook-url" type="url" inputMode="url" className={inputCls} placeholder="https://hooks.example.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input type="text" maxLength={60} className={inputCls} placeholder={t("ns.webhook.label")} aria-label={t("ns.webhook.label")} value={label} onChange={(e) => setLabel(e.target.value)} />
          <p className="text-[11px] text-gray-400">{t("ns.webhook.urlRules")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !/^https:\/\//i.test(url.trim())}
              onClick={() =>
                run(async () => {
                  const r = await api.start("webhook", { url: url.trim(), label: label.trim() || undefined });
                  if (r.ok) {
                    setSecret(r.secret ?? null);
                    setUrl("");
                    setLabel("");
                    setEditing(false);
                    setMsg({ kind: "ok", text: t("ns.sent") });
                  } else setMsg({ kind: "err", text: r.error ?? "" });
                  await reload();
                })
              }
            >
              {t("ns.btn.connect")}
            </button>
            {editing && <button type="button" className={btnGhost} onClick={() => setEditing(false)}>{t("ns.btn.cancel")}</button>}
          </div>
        </div>
      )}
      {secret && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-200">{t("ns.webhook.secretTitle")}</p>
          <p className="mb-2 text-amber-800 dark:text-amber-300">{t("ns.webhook.secretDesc")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-gray-800 dark:bg-gray-900 dark:text-gray-100">{secret}</code>
            <button
              type="button"
              className={btnGhost}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                } catch {
                  /* clipboard unavailable — the secret is selectable */
                }
              }}
            >
              {copied ? t("ns.webhook.copied") : t("ns.webhook.copy")}
            </button>
          </div>
        </div>
      )}
      <Note msg={msg} />
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Browser / app push
// ---------------------------------------------------------------------------

function WebPushCard({ data, api, reload }: { data: SettingsResponse; api: NotifApi; reload: () => Promise<void> }) {
  const { t } = useT();
  const { busy, msg, setMsg, run } = useAction();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [thisDevice, setThisDevice] = useState(false);

  useEffect(() => {
    const ok = isPushSupported();
    setSupported(ok);
    if (ok) getExistingPushSubscription().then((s) => setThisDevice(Boolean(s))).catch(() => {});
  }, []);

  const configured = data.webpush.configured;
  const connected = configured && data.webpush.devices > 0;
  const statusText = !configured ? t("ns.status.not_configured") : connected ? t("ns.status.connected") : t("ns.status.not_connected");
  const tone = connected ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";

  const toggleDevice = () =>
    run(async () => {
      if (thisDevice) {
        await unsubscribeFromPush();
        setThisDevice(false);
      } else {
        const r = await subscribeToPush();
        if (r.ok) setThisDevice(true);
        else setMsg({ kind: "err", text: r.error === "denied" ? t("ns.webpush.blocked") : r.error ?? "" });
      }
      await reload();
    });

  return (
    <CardShell
      channel="webpush"
      name={t("ns.ch.webpush")}
      desc={t("ns.ch.webpush.d")}
      badge={
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {statusText}
          {configured && data.webpush.devices > 0 ? ` · ${t("ns.webpush.devices", { n: data.webpush.devices })}` : ""}
        </span>
      }
    >
      {!configured ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("ns.webpush.notConfigured")}</p>
      ) : supported === false ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("ns.webpush.unsupported")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={thisDevice ? btnGhost : btnPrimary} disabled={busy || supported === null} onClick={toggleDevice}>
            {thisDevice ? t("ns.webpush.disable") : t("ns.webpush.enable")}
          </button>
          {connected && (
            <button
              type="button"
              className={btnGhost}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await api.test("webpush");
                  setMsg(r.ok ? { kind: "ok", text: t("ns.sent") } : { kind: "err", text: t("ns.testFailed", { reason: r.error ?? "" }) });
                })
              }
            >
              {t("ns.btn.test")}
            </button>
          )}
        </div>
      )}
      <Note msg={msg} />
    </CardShell>
  );
}

// ---------------------------------------------------------------------------

export default function ChannelCards({
  data,
  api,
  reload,
  ownBot,
}: {
  data: SettingsResponse;
  api: NotifApi;
  reload: () => Promise<void>;
  /** the legacy TelegramAccount block (only shown to users who still have one), rendered under the Telegram card */
  ownBot?: React.ReactNode;
}) {
  const { t } = useT();
  const st = (c: ExternalChannel) => data.channels.find((x) => x.channel === c)!;
  const common = (c: ExternalChannel) => ({ st: st(c), api, reload });

  return (
    <section className="rounded-xl bg-white p-4 shadow dark:bg-gray-900 sm:p-6" aria-labelledby="ns-channels-title">
      <h3 id="ns-channels-title" className="text-lg font-bold dark:text-gray-100">{t("ns.channels.title")}</h3>
      <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t("ns.channels.desc")}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <WebPushCard data={data} api={api} reload={reload} />
        <EmailCard {...common("email")} accountEmail={data.accountEmail} />
        <TelegramCard {...common("telegram")} extra={ownBot} />
        <WhatsAppCard {...common("whatsapp")} />
        <DeepLinkCard {...common("max")} channel="max" openLabelKey="ns.btn.openMax" hintKey="ns.max.hint" />
        <DeepLinkCard {...common("vk")} channel="vk" openLabelKey="ns.btn.openVk" hintKey="ns.vk.hint" />
        <WebhookCard {...common("webhook")} />
      </div>
    </section>
  );
}
