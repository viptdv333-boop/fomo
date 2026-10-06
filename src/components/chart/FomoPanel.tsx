"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { agoLabel } from "@/lib/app-ui";
import { FOMO_COMMUNITY_URL, cleanTicker, type FomoIdeasAnswer } from "@/lib/fomo-ideas";

// Terminal site only (terminal.fomo.spot): «Идеи FOMO» of the open symbol (read from fomo.spot by the server route /api/fomo-ideas)
// and the quiet «FOMO — сообщество трейдеров» card. Everything degrades silently: when fomo.spot does not answer, the ideas list
// shows nothing (the card stays: it is only a link). All links open fomo.spot in a new tab / the system browser (rel noopener).

interface SymbolLike {
  ticker: string;
  dataTicker: string;
}

const FRESH_MS = 5 * 60 * 1000;
const memo = new Map<string, { at: number; answer: FomoIdeasAnswer }>();

/** The ideas of fomo.spot for a symbol: null while loading (and when the symbol has no usable ticker), then the answer (`ok: false` = the board is unreachable). */
export function useFomoIdeas(sym: SymbolLike | null, enabled = true): FomoIdeasAnswer | null {
  const ticker = sym ? cleanTicker(sym.ticker) : null;
  const alt = sym && sym.dataTicker !== sym.ticker ? cleanTicker(sym.dataTicker) : null;
  const key = ticker ? `${ticker}|${alt ?? ""}` : "";
  const [answer, setAnswer] = useState<FomoIdeasAnswer | null>(null);
  useEffect(() => {
    if (!enabled || !ticker) {
      setAnswer(null);
      return;
    }
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) {
      setAnswer(hit.answer);
      return;
    }
    let cancelled = false;
    setAnswer(null);
    const qs = `ticker=${encodeURIComponent(ticker)}${alt ? `&alt=${encodeURIComponent(alt)}` : ""}`;
    fetch(`/api/fomo-ideas?${qs}`)
      .then((r) => (r.ok ? (r.json() as Promise<FomoIdeasAnswer>) : null))
      .then((a) => {
        const ok = a && typeof a === "object" && a.ok === true && Array.isArray(a.ideas) && typeof a.count === "number";
        const out: FomoIdeasAnswer = ok ? a : { ok: false, count: 0, ideas: [], boardUrl: FOMO_COMMUNITY_URL };
        if (ok) memo.set(key, { at: Date.now(), answer: out });
        if (!cancelled) setAnswer(out);
      })
      .catch(() => {
        if (!cancelled) setAnswer({ ok: false, count: 0, ideas: [], boardUrl: FOMO_COMMUNITY_URL });
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return answer;
}

const ext = { target: "_blank", rel: "noopener" } as const;

/** The small «FOMO — сообщество трейдеров» card under the watchlist of the desktop right panel. */
export function FomoCommunityCard() {
  const { t } = useT();
  return (
    <a
      {...ext}
      href={FOMO_COMMUNITY_URL}
      data-fomo-community
      className="tv3-press mt-2 flex items-center gap-2.5 rounded-[14px] bg-[var(--tv3-fill3)] px-3 py-2.5 text-[var(--tv3-text)] hover:bg-[var(--tv3-fill)]"
    >
      <span className="h-8 w-8 shrink-0 rounded-full bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)] flex items-center justify-center" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 20h5v-2a3 3 0 00-5.4-1.8M17 20H7m10 0v-2c0-.7-.1-1.4-.4-2M7 20H2v-2a3 3 0 015.4-1.8M7 20v-2c0-.7.1-1.4.4-2m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{t("termsite.community")}</span>
        <span className="block truncate text-[12px] text-[var(--tv3-muted)]">{t("termsite.community.sub")}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--tv3-muted)]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
      </svg>
    </a>
  );
}

/** The «Идеи FOMO» tab of the desktop right panel: up to five ideas of the open symbol with links to fomo.spot. */
export function FomoIdeasPanel({ inst, visible }: { inst: SymbolLike; visible: boolean }) {
  const { t, locale } = useT();
  const a = useFomoIdeas(inst, visible);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5">
      {a === null && <div className="px-3 py-6 text-center text-[13px] text-[var(--tv3-muted)]">…</div>}
      {a && a.ok && a.ideas.length === 0 && (
        <div className="rounded-[14px] bg-[var(--tv3-fill3)] p-3.5 text-[14px] leading-[1.45] text-[var(--tv3-text)]">{t("termsite.ideas.empty", { ticker: inst.ticker })}</div>
      )}
      {a && a.ok && a.ideas.length > 0 && (
        <ul className="space-y-1.5">
          {a.ideas.map((i) => (
            <li key={i.id}>
              <a {...ext} href={i.url} className="tv3-press block rounded-[14px] bg-[var(--tv3-fill3)] px-3 py-2.5 hover:bg-[var(--tv3-fill)]">
                <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--tv3-text)]">{i.title}</span>
                <span className="mt-1 flex items-center gap-2 text-[12px] text-[var(--tv3-muted)]">
                  <span className="min-w-0 truncate">{i.author}</span>
                  {i.createdAt && <span className="shrink-0">{agoLabel(i.createdAt, locale)}</span>}
                  <span className="ml-auto shrink-0 tabular-nums">▲ {i.likes}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {a && a.ok && (
        <a {...ext} href={a.boardUrl} className="mt-2.5 inline-block text-[13px] font-semibold text-[var(--tv3-accent)] hover:text-[var(--tv3-accent-hover)]">
          {t("termsite.ideas.all")}
        </a>
      )}
      <FomoCommunityCard />
    </div>
  );
}
