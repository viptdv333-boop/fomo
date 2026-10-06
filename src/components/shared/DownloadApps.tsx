"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { isAnyNativeShell } from "@/lib/native-app";
import { openIosSteps } from "@/lib/pwa-install";
import { DL_FILES, DL_FILE_NAMES, DL_PATHS, availablePlatforms, detectPlatform, dlInfoFor, dlMeta, platformOrder, type DetectedPlatform, type DlFlavor, type DlPlatform } from "@/lib/downloads";
import PlatformIcon from "./PlatformIcons";

// "Download the app": the block under the login on the landing pages of both sites (DownloadAppsBlock, flavor main / terminal) and the compact row in the
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

const LABEL_KEY = { android: "dl.android", windows: "dl.windows", macos: "dl.macos", ios: "dl.ios" } as const;
const NAME_KEY = { android: "dl.androidName", windows: "dl.windowsName", macos: "dl.macosName", ios: "dl.iosName" } as const;
const HINT_KEY = { android: "dl.hint.android", windows: "dl.hint.windows", macos: "dl.hint.macos", ios: "dl.hint.ios" } as const;
// the terminal site names its own apps; the tile labels and the hints are the same words
const TERMINAL_NAME_KEY = { android: "termsite.dl.androidName", windows: "termsite.dl.windowsName", macos: "termsite.dl.macosName", ios: "dl.iosName" } as const;

// the soft plate behind a coloured icon: a tint of the brand colour (Apple: neutral, so it reads on both themes)
const PLATE: Record<DlPlatform, { dark: string; light: string }> = {
  android: { dark: "bg-[#3DDC84]/10", light: "bg-[#3DDC84]/15" },
  windows: { dark: "bg-[#00A4EF]/10", light: "bg-[#00A4EF]/10" },
  macos: { dark: "bg-white/10", light: "bg-gray-900/[0.06]" },
  ios: { dark: "bg-white/10", light: "bg-gray-900/[0.06]" },
};

/**
 * The block under the login window on the landing page, for both sites: `flavor="main"` is fomo.spot (Android, Windows,
 * iPhone steps, macOS once a .dmg is published), `flavor="terminal"` is terminal.fomo.spot (its own FOMO-Terminal.* files).
 * Which tiles exist comes from availablePlatforms(): no file, no tile.
 */
export function DownloadAppsBlock({ isDark, className = "", flavor = "main" }: { isDark: boolean; className?: string; flavor?: DlFlavor }) {
  const { t, locale } = useT();
  const env = useDlEnv();
  if (!env.ready || env.hidden) return null;

  const terminal = flavor === "terminal";
  const info = dlInfoFor(flavor);
  const available = availablePlatforms(flavor, info);
  const order = platformOrder(env.own, available);
  const files = DL_FILES[flavor];
  const nameKey = terminal ? TERMINAL_NAME_KEY : NAME_KEY;
  const tile = (own: boolean) =>
    `dl-tile group flex flex-col items-center justify-start gap-2 w-[104px] sm:w-[136px] min-h-[132px] sm:min-h-[152px] px-2 pt-3.5 pb-3 rounded-2xl border text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${
      own
        ? isDark
          ? "border-green-500/70 ring-1 ring-green-500/30 text-white bg-white/[0.07]"
          : "border-green-600/60 ring-1 ring-green-600/20 text-gray-900 bg-green-50"
        : isDark
          ? "border-white/10 text-gray-300 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20 hover:text-white"
          : "border-gray-200 text-gray-700 bg-white hover:border-gray-300 hover:bg-gray-50 hover:shadow-gray-200/80"
    }`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const appleTone = isDark ? "text-gray-100" : "text-gray-900";

  return (
    <section className={`dl-block flex flex-col items-center ${className}`} aria-label={t(terminal ? "termsite.dl.title" : "dl.title")} data-flavor={flavor}>
      <h2 className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${muted}`}>{t(terminal ? "termsite.dl.title" : "dl.title")}</h2>
      <div className="flex flex-wrap items-stretch justify-center gap-2.5 sm:gap-3">
        {order.map((p) => {
          const own = env.own === p;
          const meta = p === "ios" ? "" : dlMeta(p, locale, info);
          const inner = (
            <>
              <span className={`flex h-14 w-14 sm:h-[68px] sm:w-[68px] items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 ${isDark ? PLATE[p].dark : PLATE[p].light}`}>
                <PlatformIcon platform={p} size={52} colored className={`h-11 w-11 sm:h-[52px] sm:w-[52px] ${p === "macos" || p === "ios" ? appleTone : ""}`} />
              </span>
              <span className="text-xs sm:text-[13px] font-semibold leading-tight">{t(LABEL_KEY[p])}</span>
              {meta && <span className={`text-[10px] sm:text-[11px] leading-none ${muted}`}>{meta}</span>}
            </>
          );
          const name = t(nameKey[p]);
          const common = { className: tile(own), "data-platform": p, "data-own": own ? "1" : undefined, title: own ? `${name} · ${t("dl.yours")}` : name };
          return p === "ios" ? (
            <button key={p} type="button" onClick={openIosSteps} {...common}>
              {inner}
            </button>
          ) : (
            <a key={p} href={files[p].path} download={files[p].fileName} {...common}>
              {inner}
            </a>
          );
        })}
      </div>
      <ul className={`mt-3.5 max-w-[22rem] space-y-1 text-[11px] leading-snug text-left ${muted}`}>
        {order.map((p) => (
          <li key={p} className={`flex gap-1.5 ${env.own === p ? (isDark ? "text-gray-200" : "text-gray-800") : ""}`}>
            <PlatformIcon platform={p} size={12} colored className={`mt-[1px] flex-none ${p === "macos" || p === "ios" ? appleTone : ""}`} />
            <span>{t(HINT_KEY[p])}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type RowVariant = "dropdown" | "plain" | "app" | "profile";

const ROW_CLASS: Record<RowVariant, string> = {
  // the dropdown is narrow: the label gets a line of its own and the icons sit under it
  dropdown: "flex flex-col items-start gap-0.5 px-4 pt-2 pb-1 text-sm text-gray-700 dark:text-gray-300",
  plain: "flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300",
  app: "app-row app-dl",
  profile: "",
};
const ICON_LINK_CLASS: Record<RowVariant, string> = {
  dropdown: "inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-green-600",
  plain: "inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-green-600",
  app: "app-dl-link",
  profile: "ap-dl-link",
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
  const order = platformOrder(env.own, availablePlatforms("main"));

  // the design's list row of the app UI's Профиль screen (its own markup: the row sits inside a section box)
  if (variant === "profile") {
    return (
      <div className="ac-sr ap-dl" data-dl-row="1">
        <div className="ac-sr-ico" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="m7 10 5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        </div>
        <div className="ac-sr-body">
          <div className="ac-sr-txt">
            <div className="ac-sr-label">{t("dl.title")}</div>
          </div>
          <span className="ap-dl-links">
            {order.map((p: DlPlatform) =>
              p === "ios" ? (
                <button key={p} type="button" className={ICON_LINK_CLASS[variant]} aria-label={t(NAME_KEY[p])} title={t(NAME_KEY[p])} onClick={() => openIosSteps()}>
                  <PlatformIcon platform={p} size={20} />
                </button>
              ) : (
                <a key={p} href={DL_PATHS[p]} download={DL_FILE_NAMES[p]} className={ICON_LINK_CLASS[variant]} aria-label={t(NAME_KEY[p])} title={t(NAME_KEY[p])}>
                  <PlatformIcon platform={p} size={20} />
                </a>
              )
            )}
          </span>
        </div>
      </div>
    );
  }

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
