"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/app-chat";
import { daysLeft, endDateLabel, validGrantDays, type ChannelItem } from "@/lib/app-channels";
import AppSheet from "../chat/AppSheet";
import "../chat/app-chat.css";
import "./app-channels.css";

interface Member {
  id: string;
  subscriberId: string;
  displayName: string;
  avatarUrl: string | null;
  fomoId: string | null;
  isActive: boolean;
  endDate: string;
}

interface Candidate {
  id: string;
  displayName: string;
  fomoId: string | null;
  avatarUrl: string | null;
}

/**
 * Channel owner's tools of the old page's «Подписчики» window as a design sheet: the list of subscribers, add days to one or to all active,
 * remove a subscriber, add a site user for free. Same endpoints as the old page.
 */
export default function AppMembersSheet({ channel, onClose, onChanged, flash }: { channel: ChannelItem; onClose: () => void; onChanged: () => void; flash: (m: string) => void }) {
  const { t, locale } = useT();
  const base = `/api/users/${channel.author.id}/tariffs/${channel.id}/subscribers`;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(base, { cache: "no-store" });
      setMembers(r.ok ? await r.json() : []);
    } catch {
      setMembers([]);
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  // site users the owner can add for free (debounced search while the picker is open)
  useEffect(() => {
    if (!adding) return;
    let alive = true;
    setCands(null);
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`${base}/candidates?q=${encodeURIComponent(q)}`);
        const j = r.ok ? await r.json() : [];
        if (alive) setCands(Array.isArray(j) ? j : []);
      } catch {
        if (alive) setCands([]);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [adding, q, base]);

  async function send(method: "POST" | "DELETE", body: Record<string, unknown>, failKey: string): Promise<boolean> {
    setBusy(true);
    try {
      const r = await fetch(base, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        flash(j.error || t(failKey));
        return false;
      }
      return true;
    } catch {
      flash(t(failKey));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const needDays = () => {
    const n = validGrantDays(days);
    if (n === null) flash(t("channel2.daysRangeError"));
    return n;
  };

  async function grant(subscriptionId?: string) {
    const n = needDays();
    if (n === null) return;
    if (!subscriptionId && !window.confirm(t("channel2.grantAllConfirm", { days: n, count: (members ?? []).filter((m) => m.isActive).length }))) return;
    if (await send("POST", { days: n, subscriptionId }, "channel2.addDaysFailed")) {
      await load();
      onChanged();
    }
  }
  async function remove(m: Member) {
    if (!window.confirm(t("channel2.removeSubConfirm", { name: m.displayName }))) return;
    if (await send("DELETE", { subscriptionId: m.id }, "channel2.removeSubFailed")) {
      await load();
      onChanged();
    }
  }
  async function addPicked() {
    const n = needDays();
    if (n === null || !picked) return;
    if (await send("POST", { userId: picked, days: n }, "channel2.addMemberFailed")) {
      setAdding(false);
      setPicked(null);
      setQ("");
      await load();
      onChanged();
    }
  }

  const ava = (name: string, src: string | null) => <div className="ach-mem-ava">{src ? <img src={src} alt="" /> : initials(name || "?")}</div>;

  const daysField = (
    <div className="ach-mem-tools">
      <span>{t("channel2.addDaysLabel")}</span>
      <input type="number" inputMode="numeric" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} aria-label={t("channel2.addDaysLabel")} />
      {!adding && (
        <button type="button" disabled={busy} onClick={() => void grant()}>
          {t("channel2.allActive")}
        </button>
      )}
    </div>
  );

  return (
    <AppSheet
      title={t("subs.channelSubscribers")}
      onClose={onClose}
      height="full"
      doneLabel={t("appui.chat.done")}
      left={adding ? { label: t("common.back"), onClick: () => (setAdding(false), setPicked(null)) } : undefined}
      right={adding ? null : undefined}
      search={adding ? { value: q, ph: t("channel2.searchNameOrId"), onChange: setQ } : undefined}
      btn={adding ? { label: t("channel2.add"), disabled: !picked || busy, onClick: () => void addPicked() } : undefined}
    >
      {daysField}
      {adding ? (
        <>
          <div className="ach-sheetnote">{t("channel2.pickUserHint", { days: days || 0 })}</div>
          {cands === null ? (
            <div className="ach-sheetnote">{t("common.loading")}</div>
          ) : cands.length === 0 ? (
            <div className="ach-sheetnote">{t("channel2.nobodyFound")}</div>
          ) : (
            <div className="ach-mem-box">
              {cands.map((u) => (
                <button key={u.id} type="button" className="ach-mem-row" data-sel={picked === u.id ? "1" : undefined} onClick={() => setPicked(u.id)}>
                  {ava(u.displayName, u.avatarUrl)}
                  <div className="ach-mem-body">
                    <div className="ach-mem-txt">
                      <div className="ach-mem-name">{u.displayName}</div>
                      {u.fomoId && <div className="ach-mem-sub">#{u.fomoId}</div>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {members === null ? (
            <div className="ach-sheetnote">{t("common.loading")}</div>
          ) : members.length === 0 ? (
            <div className="ach-sheetnote">{t("subs.noChannelSubscribers")}</div>
          ) : (
            <div className="ach-mem-box">
              {members.map((m) => (
                <div key={m.id} className="ach-mem-row">
                  {ava(m.displayName, m.avatarUrl)}
                  <div className="ach-mem-body">
                    <div className="ach-mem-txt">
                      <div className="ach-mem-name">{m.displayName}</div>
                      {m.isActive ? (
                        <div className="ach-mem-sub">
                          {t("subs.subscriberUntil")} {endDateLabel(m.endDate, locale)} {t("channel2.daysLeft", { days: daysLeft(m.endDate) })}
                        </div>
                      ) : (
                        <div className="ach-mem-sub" data-tone="off">
                          {t("subs.subscriberInactive")}
                        </div>
                      )}
                    </div>
                    <div className="ach-mem-actions">
                      <button type="button" disabled={busy} onClick={() => void grant(m.id)} title={t("channel2.addDaysToSubTitle", { days: days || 0 })}>
                        {t("channel2.plusDays", { days: days || 0 })}
                      </button>
                      {m.isActive && (
                        <button type="button" data-tone="danger" disabled={busy} onClick={() => void remove(m)}>
                          {t("common.delete")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="ach-cta ach-mem-add" data-tone="soft" style={{ width: "calc(100% - 32px)" }} onClick={() => setAdding(true)}>
            {t("channel2.addMember")}
          </button>
        </>
      )}
    </AppSheet>
  );
}
