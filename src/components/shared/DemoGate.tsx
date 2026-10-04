"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { localizedPath, type Locale } from "@/lib/i18n/locale-url";
import { useDemoGate } from "@/lib/useDemoGate";

/* Guest demo gate. The server renders the normal page; after hydration a guest uses it freely until the daily demo time is
   used up (see lib/demo-gate.ts), then the content is blurred, inert, and a lock card with sign-in / register links covers it.
   Signed-in users (and a session that is still loading) never see any of this. Nothing here shows the remaining time.

   Layouts:
   - "fill": goes INSIDE an already positioned, full-size layer (the fixed terminal / calendar layers under the site header).
     The blur is applied to an inner box, never to an ancestor of the fixed layer (a filter would turn it into the containing
     block of its fixed descendants). The overlay sits above the chart (z-50 in the layer's stacking context); the site header
     is outside the layer and stays usable.
   - "flow": an ordinary block in the page flow (the board); the card follows the scroll (sticky) over the blurred list. */

export type DemoKind = "terminal" | "calendar" | "feed";

const COPY: Record<DemoKind, { title: string; text: string }> = {
  terminal: { title: "tg.lockTitle", text: "tg.lockText" },
  calendar: { title: "dg.cal.title", text: "dg.cal.text" },
  feed: { title: "dg.feed.title", text: "dg.feed.text" },
};

interface Props {
  kind: DemoKind;
  /** the page path without a language prefix, e.g. "/terminal": where the sign-in links return to */
  path: string;
  layout?: "fill" | "flow";
  children: ReactNode;
}

export default function DemoGate({ kind, path, layout = "fill", children }: Props) {
  const { locked } = useDemoGate();
  const flow = layout === "flow";
  const lockProps = locked ? { inert: true, "aria-hidden": true } : {};
  // the content box keeps the same element in both states, so locking never remounts the chart
  const content = (
    <div className={`${flow ? "" : "w-full h-full"} ${locked ? "blur-[6px] pointer-events-none select-none" : ""}`} {...lockProps}>
      {children}
    </div>
  );
  if (flow) {
    return (
      <div className="relative min-h-[60vh]">
        {content}
        {locked && (
          <div className="absolute inset-0 z-20 flex items-start justify-center p-4 bg-black/10 dark:bg-black/30">
            <div className="sticky top-24 mt-10 w-full max-w-sm">
              <LockCard kind={kind} path={path} site />
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <>
      {content}
      {locked && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/20">
          <LockCard kind={kind} path={path} />
        </div>
      )}
    </>
  );
}

function LockCard({ kind, path, site }: { kind: DemoKind; path: string; site?: boolean }) {
  const { t, locale: lang } = useT();
  const locale = lang as Locale;
  const copy = COPY[kind];
  // back to the same page (and the same chart / filters) after signing in
  const back = `${localizedPath(locale, path)}${typeof window !== "undefined" ? window.location.search : ""}`;
  const q = `?callbackUrl=${encodeURIComponent(back)}`;

  const card = site
    ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-xl border border-gray-200 dark:border-gray-700"
    : "bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]";
  const iconBox = site ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" : "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]";
  const muted = site ? "text-gray-500 dark:text-gray-400" : "text-[var(--tv3-muted)]";
  const primary = site
    ? "bg-green-600 hover:bg-green-700 text-white"
    : "bg-[var(--tv3-accent)] hover:bg-[var(--tv3-accent-hover)] text-white";
  const secondary = site
    ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:brightness-95 dark:hover:brightness-125"
    : "bg-[var(--tv3-fill)] text-[var(--tv3-text)] hover:brightness-95 dark:hover:brightness-125";
  const link = site ? "text-green-700 dark:text-green-400" : "text-[var(--tv3-accent)]";

  return (
    <div role="dialog" aria-labelledby="demo-gate-title" className={`w-full max-w-sm rounded-2xl p-6 text-center ${card}`}>
      <div className={`mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center ${iconBox}`}>
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 118 0v3" />
        </svg>
      </div>
      <h2 id="demo-gate-title" className="text-lg font-bold">
        {t(copy.title)}
      </h2>
      <p className={`mt-1.5 text-sm ${muted}`}>{t(copy.text)}</p>
      <div className="mt-5 flex flex-col gap-2">
        <Link href={`${localizedPath(locale, "/login")}${q}`} className={`h-10 inline-flex items-center justify-center rounded-[10px] font-semibold ${primary}`}>
          {t("tg.login")}
        </Link>
        <Link href={`${localizedPath(locale, "/register")}${q}`} className={`h-10 inline-flex items-center justify-center rounded-[10px] font-semibold ${secondary}`}>
          {t("tg.register")}
        </Link>
      </div>
      {kind === "terminal" && (
        <Link href={localizedPath(locale, "/terminal/features")} className={`mt-4 inline-block text-xs font-semibold hover:underline ${link}`}>
          {t("tf.more")}
        </Link>
      )}
    </div>
  );
}
