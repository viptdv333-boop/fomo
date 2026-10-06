"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { isAnyNativeShell } from "@/lib/native-app";
import { openIosSteps } from "@/lib/pwa-install";
import { DL_FILE_NAMES, DL_PATHS, detectPlatform, dlMeta, platformOrder, type DetectedPlatform, type DlPlatform } from "@/lib/downloads";
import PlatformIcon from "./PlatformIcons";

// "Download the app": the block under the login on the landing page (DownloadAppsBlock) and the compact row in the
// profile menus (DownloadAppsRow). Android and Windows are plain file links to /app/dl/*; iPhone has no file, its icon
// opens the "how to install" sheet (IosInstallModal). Nothing renders on the server or before mount, and nothing inside
// the Android app / Windows desktop app, so there is no hydration mismatch and no flash in the apps.

interface DlEnv {
  ready: boolean;
  hidden: boolean;
  own: DetectedPlatform;
}

function useDlEnv(): DlEnv {
  const [env, setEnv] = useState<DlEnv>({ ready: false, hidden: true, own: "other" });
  useEffect(() => {
    setEnv({
      ready: true,
      hidden: isAnyNativeShell(),
      own: detectPlatform({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }),
    });
  }, []);
  return env;
}

const LABEL_KEY = { android: "dl.android", windows: "dl.windows", ios: "dl.ios" } as const;
const NAME_KEY = { android: "dl.androidName", windows: "dl.windowsName", ios: "dl.iosName" } as const;
const HINT_KEY = { android: "dl.hint.android", windows: "dl.hint.windows", ios: "dl.hint.ios" } as const;

/** The block under the login window on the landing page. */
export function DownloadAppsBlock({ isDark, className = "" }: { isDark: boolean; className?: string }) {
  const { t, locale } = useT();
  const env = useDlEnv();
  if (!env.ready || env.hidden) return null;

  const order = platformOrder(env.own);
  const tile = (own: boolean) =>
    `dl-tile flex flex-col items-center justify-center gap-1 w-[104px] min-h-[84px] px-2 py-2.5 rounded-xl border-2 text-center transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${
      own
        ? isDark
          ? "border-green-500 text-white bg-gray-800/60"
          : "border-green-600 text-gray-900 bg-green-50"
        : isDark
          ? "border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
          : "border-gray-300 text-gray-700 hover:bg-gray-50"
    }`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <section className={`dl-block flex flex-col items-center ${className}`} aria-label={t("dl.title")}>
      <h2 className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${muted}`}>{t("dl.title")}</h2>
      <div className="flex items-stretch justify-center gap-2.5">
        {order.map((p) => {
          const own = env.own === p;
          const meta = dlMeta(p, locale);
          const inner = (
            <>
              <PlatformIcon platform={p} size={28} />
              <span className="text-xs font-medium leading-tight">{t(LABEL_KEY[p])}</span>
              {meta && <span className={`text-[10px] leading-none ${muted}`}>{meta}</span>}
            </>
          );
          const common = { className: tile(own), "data-platform": p, "data-own": own ? "1" : undefined, title: own ? `${t(NAME_KEY[p])} · ${t("dl.yours")}` : t(NAME_KEY[p]) };
          return p === "ios" ? (
            <button key={p} type="button" onClick={openIosSteps} {...common}>
              {inner}
            </button>
          ) : (
            <a key={p} href={DL_PATHS[p]} download={DL_FILE_NAMES[p]} {...common}>
              {inner}
            </a>
          );
        })}
      </div>
      <ul className={`mt-3 max-w-[22rem] space-y-1 text-[11px] leading-snug text-left ${muted}`}>
        {order.map((p) => (
          <li key={p} className={`flex gap-1.5 ${env.own === p ? (isDark ? "text-gray-200" : "text-gray-800") : ""}`}>
            <PlatformIcon platform={p} size={12} className="mt-[1px] flex-none" />
            <span>{t(HINT_KEY[p])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type RowVariant = "dropdown" | "plain" | "app";

const ROW_CLASS: Record<RowVariant, string> = {
  // the dropdown is narrow: the label gets a line of its own and the icons sit under it
  dropdown: "flex flex-col items-start gap-0.5 px-4 pt-2 pb-1 text-sm text-gray-700 dark:text-gray-300",
  plain: "flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300",
  app: "app-row app-dl",
};
const ICON_LINK_CLASS: Record<RowVariant, string> = {
  dropdown: "inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-green-600",
  plain: "inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-green-600",
  app: "app-dl-link",
};

/** One compact row for the profile menus: «Скачать приложение» + the platform icons as links. */
export function DownloadAppsRow({ variant, onNavigate }: { variant: RowVariant; onNavigate?: () => void }) {
  const { t } = useT();
  const env = useDlEnv();
  if (!env.ready || env.hidden) return null;

  // closing the menu unmounts the links: wait a moment so the browser still starts the download
  const done = () => {
    if (onNavigate) setTimeout(onNavigate, 200);
  };
  const order = platformOrder(env.own);

  return (
    <div className={ROW_CLASS[variant]} data-dl-row="1">
      {variant === "app" ? (
        <>
          <span className="app-row-ico" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
          </span>
          <span className="app-row-label">{t("dl.title")}</span>
        </>
      ) : (
        <span className={variant === "dropdown" ? "" : "flex-1 min-w-0"}>⬇️ {t("dl.title")}</span>
      )}
      <span className={variant === "app" ? "app-dl-links" : variant === "dropdown" ? "flex items-center gap-1 -ml-2" : "flex items-center gap-0.5"}>
        {order.map((p: DlPlatform) =>
          p === "ios" ? (
            <button
              key={p}
              type="button"
              className={ICON_LINK_CLASS[variant]}
              aria-label={t(NAME_KEY[p])}
              title={t(NAME_KEY[p])}
              onClick={() => {
                openIosSteps();
                done();
              }}
            >
              <PlatformIcon platform={p} size={variant === "app" ? 20 : 18} />
            </button>
          ) : (
            <a key={p} href={DL_PATHS[p]} download={DL_FILE_NAMES[p]} className={ICON_LINK_CLASS[variant]} aria-label={t(NAME_KEY[p])} title={t(NAME_KEY[p])} onClick={done}>
              <PlatformIcon platform={p} size={variant === "app" ? 20 : 18} />
            </a>
          )
        )}
      </span>
    </div>
  );
}
