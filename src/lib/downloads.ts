// "Download the app" block (landing page, profile menus): platform detection, file links and the version / size text.
// The files live in public/app/dl/ (published from the `downloads` branch, see docs/downloads.md); versions and sizes
// come from public/app/dl-info.json, which scripts/publish-downloads.ps1 rewrites. Nothing is hard-coded here.
// Check: npx tsx scripts/check-downloads.ts
import rawInfo from "../../public/app/dl-info.json";

export type DlPlatform = "android" | "windows" | "ios";
export type DetectedPlatform = DlPlatform | "other";

export const DL_PATHS = {
  android: "/app/dl/FOMO.apk",
  windows: "/app/dl/FOMO-Setup.exe",
} as const;

/** File name offered by the browser's "Save as" (the `download` attribute). */
export const DL_FILE_NAMES = {
  android: "FOMO.apk",
  windows: "FOMO-Setup.exe",
} as const;

export const DL_ORDER: DlPlatform[] = ["android", "windows", "ios"];

export interface DlFileInfo {
  version: string;
  size: number;
}

export interface DlInfo {
  android: DlFileInfo | null;
  windows: DlFileInfo | null;
}

function fileInfo(v: unknown): DlFileInfo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { version?: unknown; size?: unknown };
  if (typeof o.version !== "string" || !/^\d+(\.\d+){0,3}$/.test(o.version)) return null;
  if (typeof o.size !== "number" || !Number.isFinite(o.size) || o.size <= 0) return null;
  return { version: o.version, size: o.size };
}

/** Versions and sizes from dl-info.json; a missing or malformed entry gives null (the UI then shows no numbers). */
export function parseDlInfo(raw: unknown): DlInfo {
  const o = raw && typeof raw === "object" ? (raw as { android?: unknown; windows?: unknown }) : {};
  return { android: fileInfo(o.android), windows: fileInfo(o.windows) };
}

export const DL_INFO: DlInfo = parseDlInfo(rawInfo);

export interface PlatformInput {
  userAgent: string;
  /** navigator.platform: iPadOS 13+ Safari reports "MacIntel". */
  platform?: string;
  maxTouchPoints?: number;
}

/** The visitor's own platform among the three download targets ("other" for macOS, Linux, ...). */
export function detectPlatform(i: PlatformInput): DetectedPlatform {
  const ua = i.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (i.platform === "MacIntel" && (i.maxTouchPoints ?? 0) > 1) return "ios";
  if (/Windows NT/i.test(ua) && !/Windows Phone/i.test(ua)) return "windows";
  return "other";
}

/** Own platform first, the rest in the default order. */
export function platformOrder(own: DetectedPlatform): DlPlatform[] {
  if (own === "other") return DL_ORDER;
  return [own, ...DL_ORDER.filter((p) => p !== own)];
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
