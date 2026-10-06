// "Download the app" block (landing page, profile menus): platform detection, file links and the version / size text.
// The files live in public/app/dl/ (published from the `downloads` branch, see docs/downloads.md); versions and sizes
// come from public/app/dl-info.json, which scripts/publish-downloads.ps1 rewrites. Nothing is hard-coded here.
// Check: npx tsx scripts/check-downloads.ts
import rawInfo from "../../public/app/dl-info.json";

export type DlFlavor = "main" | "terminal";
/** Platforms that have a file to download. */
export type DlFilePlatform = "android" | "windows" | "macos";
export type DlPlatform = DlFilePlatform | "ios";
export type DetectedPlatform = DlPlatform | "other";

interface DlFile {
  path: string;
  /** File name offered by the browser's "Save as" (the `download` attribute). */
  fileName: string;
}

/** The files of both sites. The terminal site (SITE_MODE=terminal) has its own apps: FOMO-Terminal.*. */
export const DL_FILES: Record<DlFlavor, Record<DlFilePlatform, DlFile>> = {
  main: {
    android: { path: "/app/dl/FOMO.apk", fileName: "FOMO.apk" },
    windows: { path: "/app/dl/FOMO-Setup.exe", fileName: "FOMO-Setup.exe" },
    macos: { path: "/app/dl/FOMO.dmg", fileName: "FOMO.dmg" },
  },
  terminal: {
    android: { path: "/app/dl/FOMO-Terminal.apk", fileName: "FOMO-Terminal.apk" },
    windows: { path: "/app/dl/FOMO-Terminal-Setup.exe", fileName: "FOMO-Terminal-Setup.exe" },
    macos: { path: "/app/dl/FOMO-Terminal.dmg", fileName: "FOMO-Terminal.dmg" },
  },
};

export const DL_PATHS = {
  android: DL_FILES.main.android.path,
  windows: DL_FILES.main.windows.path,
  macos: DL_FILES.main.macos.path,
} as const;

export const DL_FILE_NAMES = {
  android: DL_FILES.main.android.fileName,
  windows: DL_FILES.main.windows.fileName,
  macos: DL_FILES.main.macos.fileName,
} as const;

export const DL_ORDER: DlPlatform[] = ["android", "windows", "macos", "ios"];

export interface DlFileInfo {
  version: string;
  size: number;
}

/** One site's entries of dl-info.json: null = no valid entry (macOS: no file published yet, so no tile). */
export interface DlInfo {
  android: DlFileInfo | null;
  windows: DlFileInfo | null;
  macos: DlFileInfo | null;
}

function fileInfo(v: unknown): DlFileInfo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { version?: unknown; size?: unknown };
  if (typeof o.version !== "string" || !/^\d+(\.\d+){0,3}$/.test(o.version)) return null;
  if (typeof o.size !== "number" || !Number.isFinite(o.size) || o.size <= 0) return null;
  return { version: o.version, size: o.size };
}

/** Versions and sizes of one site from dl-info.json; a missing or malformed entry gives null (the UI then shows no numbers). */
export function parseDlInfo(raw: unknown): DlInfo {
  const o = raw && typeof raw === "object" ? (raw as { android?: unknown; windows?: unknown; macos?: unknown }) : {};
  return { android: fileInfo(o.android), windows: fileInfo(o.windows), macos: fileInfo(o.macos) };
}

/** Both sites: the main entries sit at the top level of dl-info.json, the terminal ones under `terminal`. */
export function parseDlInfoFor(raw: unknown, flavor: DlFlavor): DlInfo {
  if (flavor === "main") return parseDlInfo(raw);
  const t = raw && typeof raw === "object" ? (raw as { terminal?: unknown }).terminal : null;
  return parseDlInfo(t);
}

export const DL_INFO: DlInfo = parseDlInfoFor(rawInfo, "main");
export const DL_INFO_TERMINAL: DlInfo = parseDlInfoFor(rawInfo, "terminal");

export function dlInfoFor(flavor: DlFlavor): DlInfo {
  return flavor === "terminal" ? DL_INFO_TERMINAL : DL_INFO;
}

/** Tiles that are always offered (their files have been on the server from the start); the others need a valid dl-info.json entry. */
const ALWAYS: Record<DlFlavor, DlFilePlatform[]> = { main: ["android", "windows"], terminal: ["android"] };

/**
 * The platforms a site offers, in the default order. A platform without a published file (macOS until a .dmg exists,
 * the terminal Windows installer until it is published) is not in the list: no fake links. iPhone has no file, only the
 * "how to install" steps, and only the main site has them.
 */
export function availablePlatforms(flavor: DlFlavor, info: DlInfo = dlInfoFor(flavor)): DlPlatform[] {
  return DL_ORDER.filter((p) => {
    if (p === "ios") return flavor === "main";
    return ALWAYS[flavor].includes(p) || info[p] !== null;
  });
}

export interface PlatformInput {
  userAgent: string;
  /** navigator.platform: iPadOS 13+ Safari reports "MacIntel". */
  platform?: string;
  maxTouchPoints?: number;
}

/** The visitor's own platform among the download targets ("other" for Linux, ...). */
export function detectPlatform(i: PlatformInput): DetectedPlatform {
  const ua = i.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (i.platform === "MacIntel" && (i.maxTouchPoints ?? 0) > 1) return "ios";
  if (/Windows NT/i.test(ua) && !/Windows Phone/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  return "other";
}

/** Own platform first (if it is offered), the rest in the default order. */
export function platformOrder(own: DetectedPlatform, available: DlPlatform[] = DL_ORDER): DlPlatform[] {
  if (own === "other" || !available.includes(own)) return [...available];
  return [own, ...available.filter((p) => p !== own)];
}

const UNITS: Record<string, [string, string]> = {
  ru: ["КБ", "МБ"],
  en: ["KB", "MB"],
  cn: ["KB", "MB"],
};

/** "1.5 MB" / "1,5 МБ" / "94 MB": one decimal below 10, none from 10 up. */
export function formatSize(bytes: number, locale: string): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const [kb, mb] = UNITS[locale] || UNITS.en;
  const sep = locale === "ru" ? "," : ".";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ${kb}`;
  const v = bytes / (1024 * 1024);
  return `${v < 10 ? v.toFixed(1).replace(".", sep) : String(Math.round(v))} ${mb}`;
}

/** "v1.0.0 · 1,5 МБ" for a platform, or "" when dl-info.json has nothing valid for it. */
export function dlMeta(p: DlPlatform, locale: string, info: DlInfo = DL_INFO): string {
  if (p === "ios") return "";
  const f = info[p];
  if (!f) return "";
  return `v${f.version} · ${formatSize(f.size, locale)}`;
}
