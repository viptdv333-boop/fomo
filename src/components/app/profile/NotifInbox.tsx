"use client";

import { useMemo } from "react";
import { notifEmoji } from "@/lib/notif-icon";
import { groupByDay, linkTarget, relativeTime, typeLabelKey, type DayGroup, type InboxRow } from "@/lib/notif-inbox";
import AppIcon from "../AppIcon";
import { useProf } from "./ProfileCtx";
import { Nav } from "./parts";
import { useNotifInbox } from "./useNotifInbox";
import "./notif-inbox.css";

const BCP47: Record<string, string> = { ru: "ru", en: "en-US", cn: "zh-CN" };

/**
 * «Уведомления» of the Профиль tab (a screen pushed from the profile list, so Android Back returns to it): the user's latest notifications, newest
 * first, grouped by day, 50 per page. A tap opens the notification's link inside the app (tab roots through the tab host, the rest through the router)
 * and marks that row read; «Прочитать все»; the rows that light the Профиль tab are marked read by themselves (useNotifInbox).
 */
export default function NotifInbox() {
  const { t, locale, user, openLink, flash } = useProf();
  const n = useNotifInbox(user?.id);
  const now = new Date();
  const groups = useMemo(() => groupByDay(n.rows, new Date()), [n.rows]);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(BCP47[locale] ?? "ru", { day: "numeric", month: "long", weekday: "short" }), [locale]);
  const dayFmtYear = useMemo(() => new Intl.DateTimeFormat(BCP47[locale] ?? "ru", { day: "numeric", month: "long", year: "numeric" }), [locale]);

  const dayTitle = (g: DayGroup) =>
    g.kind === "today" ? t("appprof.inbox.today") : g.kind === "yesterday" ? t("appprof.inbox.yesterday") : (g.day.getFullYear() === now.getFullYear() ? dayFmt : dayFmtYear).format(g.day);

  const timeText = (iso: string) => {
    const r = relativeTime(iso, new Date());
    if (r.unit === "now") return t("appprof.inbox.now");
    if (r.unit === "time") return r.hhmm;
    return t(r.unit === "min" ? "appprof.inbox.min" : "appprof.inbox.hour", { n: r.n });
  };

  const open = (row: InboxRow) => {
    n.readOne(row.id);
    const target = linkTarget(row.link, window.location.origin);
    if (target.kind === "path") openLink(target.path);
    else if (target.kind === "external") window.open(target.url, "_blank", "noopener");
  };

  const refreshing = n.refreshing && n.status === "ready";
  const title = (row: InboxRow) => row.title.trim() || t(typeLabelKey(row.type));

  return (
    <>
      <Nav title={t("appprof.inbox.title")} right={[{ key: "refresh", label: refreshing ? "…" : t("appprof.inbox.refresh"), disabled: n.refreshing, onClick: () => void n.reload() }]} />
      <div className="ac-page ni">
        {n.status === "loading" && (
          <div className="ni-skel" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="ni-sk-row">
                <span className="ni-sk-tile" />
                <span className="ni-sk-lines">
                  <span className="ni-sk-l1" />
                  <span className="ni-sk-l2" />
                </span>
              </div>
            ))}
          </div>
        )}

        {n.status === "error" && (
          <div className="ni-state" role="alert">
            <div className="ni-state-ico">
              <AppIcon name="info" size={30} stroke={1.6} />
            </div>
            <div className="ni-state-t">{t("appprof.inbox.error")}</div>
            <button type="button" className="ni-btn" onClick={() => void n.reload()} disabled={n.refreshing}>
              {t("appprof.inbox.retry")}
            </button>
          </div>
        )}

        {n.status === "ready" && (
          <>
            <div className="ni-bar">
              <span className="ni-count" data-on={n.unread > 0 ? "1" : undefined} aria-live="polite">
                {n.unread > 0 ? t("appprof.inbox.unreadN", { n: n.unread }) : t("appprof.inbox.allRead")}
              </span>
              <button
                type="button"
                className="ni-btn"
                disabled={n.unread === 0}
                onClick={() => {
                  void n.readAll();
                  flash(t("appprof.inbox.allRead"));
                }}
              >
                {t("appprof.inbox.readAll")}
              </button>
            </div>
            {n.stale && (
              <div className="ni-offline" role="status">
                {t("appprof.inbox.offline")}
              </div>
            )}

            {n.rows.length === 0 ? (
              <div className="ni-state">
                <div className="ni-state-ico">
                  <AppIcon name="bell" size={30} stroke={1.6} />
                </div>
                <div className="ni-state-t">{t("appprof.inbox.empty")}</div>
                <div className="ni-state-s">{t("appprof.inbox.emptySub")}</div>
              </div>
            ) : (
              <>
                {groups.map((g) => (
                  <section key={g.key} className="ni-day">
                    <h2 className="ni-dayt">{dayTitle(g)}</h2>
                    <div className="ac-secbox">
                      {g.rows.map((row) => {
                        const lit = !row.isRead || n.fresh.has(row.id);
                        return (
                          <button key={row.id} type="button" className="ni-row" data-new={lit ? "1" : undefined} onClick={() => open(row)}>
                            <span className="ni-tile" aria-hidden="true">
                              {notifEmoji(row.type)}
                            </span>
                            <span className="ni-body">
                              <span className="ni-line">
                                <span className="ni-title">{title(row)}</span>
                                <span className="ni-time">{timeText(row.createdAt)}</span>
                              </span>
                              {row.body ? <span className="ni-text">{row.body}</span> : null}
                            </span>
                            {lit ? (
                              <span className="ni-dot" role="img" aria-label={t("appprof.inbox.new")} />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {n.hasMore ? (
                  <button type="button" className="ni-more" onClick={() => void n.loadMore()} disabled={n.moreBusy} data-err={n.moreError ? "1" : undefined}>
                    {n.moreBusy ? t("appprof.inbox.moreBusy") : n.moreError ? t("appprof.inbox.moreError") : t("appprof.inbox.more")}
                  </button>
                ) : (
                  <div className="ni-end">{t("appprof.inbox.end")}</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
