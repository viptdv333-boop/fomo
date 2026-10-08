// Glue for the Android shell (android/): the WebView adds " FomoApp/<version> Android" to the user agent, injects the
// `window.FomoApp` bridge (only on the trusted origin) and delivers keyboard-pasted / shared files as DOM events.
// Everything here is pure or feature-detected, so the site behaves exactly as before in a normal browser or PWA.
// Check: npx tsx scripts/check-native-app.ts

/** The @JavascriptInterface object of the Android app. Every method is optional: an older app build may lack some. */
export interface FomoBridge {
  getClipboardImage?: () => string;
  hasClipboardImage?: () => boolean;
  appVersion?: () => string;
  openExternal?: (url: string) => void;
  share?: (text: string, url: string) => void;
  haptic?: () => void;
  getPushToken?: () => string;
  requestNotificationPermission?: () => void;
  /** Opens the native settings screen of the app (app build 1.0.0+ with the settings screen). */
  openSettings?: () => void;
  lockEnabled?: () => boolean;
  /** Hides / shows the Android status and navigation bars (the full-screen chart). App builds with the `immersive` feature. */
  setImmersive?: (on: boolean) => void;
  /** JSON string, see parseAppFeatures. */
  appFeatures?: () => string;
  /**
   * Saves a file into the phone's Downloads (the WebView cannot download blob: / data: links). Returns "ok" or an error code; the app shows its own
   * toast. App builds with the `saveFile` feature (1.0.2+). Use saveBlobAsFile (src/lib/save-file.ts), not these directly.
   */
  saveFile?: (name: string, mime: string, base64: string) => string;
  /** Chunked form for big files: begin -> "ok:<token>", then chunks (base64, length multiple of 4) -> "ok", end -> "ok". */
  saveFileBegin?: (name: string, mime: string) => string;
  saveFileChunk?: (token: string, base64: string) => string;
  saveFileEnd?: (token: string) => string;
  saveFileFailed?: (token: string) => void;
}

/** One file as the app serialises it: base64 without the data: prefix. */
export interface NativeFilePayload {
  name?: unknown;
  type?: unknown;
  dataBase64?: unknown;
}

/** Same ceiling as the app (8 MB of file → ~11 MB of base64). */
export const NATIVE_MAX_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil((NATIVE_MAX_BYTES * 4) / 3) + 8;
export const NATIVE_MAX_FILES = 5;

export const NATIVE_PASTE_EVENT = "fomo-native-paste";
export const NATIVE_SHARE_EVENT = "fomo-native-share";
export const NATIVE_IMMERSIVE_RESET_EVENT = "fomo-native-immersive-reset";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export function nativeBridge(): FomoBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { FomoApp?: FomoBridge }).FomoApp;
  return b && typeof b === "object" ? b : null;
}

/** True inside the Android app (bridge present or the UA marker). */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  if (nativeBridge()) return true;
  return typeof navigator !== "undefined" && /\bFomoApp\//.test(navigator.userAgent);
}

/** True inside the Windows desktop app (desktop/): its shell adds " FomoDesktop/<version> Windows" to the user agent (or the ?appui=1&appdesktop=1 browser preview, which behaves like the shell). */
export function isDesktopApp(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/\bFomoDesktop\//.test(navigator.userAgent)) return true;
  return typeof document !== "undefined" && !!document.documentElement?.classList?.contains(APP_DESKTOP_CLASS);
}

/** True inside either shell (the Android app or the Windows desktop app): nothing to install or download there. */
export function isAnyNativeShell(): boolean {
  return isNativeApp() || isDesktopApp();
}

function stamp(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** A safe display name: no path, no control characters, bounded; generic or missing image names become screenshot-<stamp>.<ext>. */
export function normalizeNativeName(name: unknown, type: string, now: number = Date.now()): string {
  const ext = EXT_BY_MIME[type] ?? (type.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5) ?? "bin";
  let n = typeof name === "string" ? name : "";
  n = n.split(/[\\/]/).pop() || "";
  n = n.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  const generic = !n || /^(image|content|clipboard|unknown|download)[-_ ]?\d*(\.\w+)?$/i.test(n);
  if (generic && type.startsWith("image/")) return `screenshot-${stamp(now)}.${ext}`;
  if (!n) return `file-${stamp(now)}.${ext || "bin"}`;
  return n;
}

/** Base64 (no prefix) → bytes; null when it is not valid base64 or too large. */
export function base64ToBytes(b64: unknown): Uint8Array | null {
  if (typeof b64 !== "string" || !b64 || b64.length > MAX_BASE64_CHARS) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64);
    if (bin.length > NATIVE_MAX_BYTES) return null;
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** The app's {name,type,dataBase64} → File; null for anything malformed (never throws). */
export function fileFromNativePayload(p: unknown, now: number = Date.now()): File | null {
  if (!p || typeof p !== "object") return null;
  const o = p as NativeFilePayload;
  const type = typeof o.type === "string" ? o.type.toLowerCase().trim() : "";
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(type)) return null;
  const bytes = base64ToBytes(o.dataBase64);
  if (!bytes || bytes.length === 0) return null;
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  return new File([buf], normalizeNativeName(o.name, type, now), { type, lastModified: now });
}

/** What the "Share → FOMO" intent delivers: files plus the shared text/title (all optional). */
export interface NativeShare {
  files: File[];
  text: string;
  title: string;
}

export function nativeShareFromDetail(detail: unknown, now: number = Date.now()): NativeShare {
  const out: NativeShare = { files: [], text: "", title: "" };
  if (!detail || typeof detail !== "object") return out;
  const d = detail as { files?: unknown; text?: unknown; title?: unknown };
  if (typeof d.text === "string") out.text = d.text.slice(0, 8000);
  if (typeof d.title === "string") out.title = d.title.slice(0, 300);
  if (Array.isArray(d.files)) {
    for (const f of d.files.slice(0, NATIVE_MAX_FILES)) {
      const file = fileFromNativePayload(f, now);
      if (file) out.files.push(file);
    }
  }
  return out;
}

/** Image from the app's clipboard bridge (the Android WebView cannot read image clipboards through the web API). */
export function readNativeClipboardImage(): { file: File | null; why: string } {
  const b = nativeBridge();
  if (!b || typeof b.getClipboardImage !== "function") return { file: null, why: "" };
  try {
    const raw = b.getClipboardImage();
    if (!raw) return { file: null, why: "в буфере нет картинки" };
    const file = fileFromNativePayload(JSON.parse(raw));
    return file ? { file, why: "" } : { file: null, why: "картинка слишком большая или повреждена" };
  } catch {
    return { file: null, why: "не удалось прочитать буфер" };
  }
}

export function hasNativeClipboardImage(): boolean {
  const b = nativeBridge();
  try {
    return !!b && typeof b.hasClipboardImage === "function" && b.hasClipboardImage() === true;
  } catch {
    return false;
  }
}

/** Subscribes to images committed from the keyboard (Gboard stickers/clipboard) — returns the unsubscribe function. */
export function onNativePaste(cb: (file: File) => void): () => void {
  if (typeof document === "undefined") return () => {};
  const h = (e: Event) => {
    const file = fileFromNativePayload((e as CustomEvent).detail);
    if (file) cb(file);
  };
  document.addEventListener(NATIVE_PASTE_EVENT, h);
  return () => document.removeEventListener(NATIVE_PASTE_EVENT, h);
}

/**
 * Shares delivered by the app. The app also leaves the last one in window.__fomoNativeShare, because the event can fire
 * before React has hydrated; the subscriber takes (and clears) it on subscribe.
 */
export function onNativeShare(cb: (share: NativeShare) => void): () => void {
  if (typeof document === "undefined") return () => {};
  const w = window as unknown as { __fomoNativeShare?: unknown };
  const take = (detail: unknown) => {
    const s = nativeShareFromDetail(detail);
    if (s.files.length || s.text) cb(s);
  };
  if (w.__fomoNativeShare) {
    const pending = w.__fomoNativeShare;
    delete w.__fomoNativeShare;
    take(pending);
  }
  const h = (e: Event) => {
    delete w.__fomoNativeShare;
    take((e as CustomEvent).detail);
  };
  document.addEventListener(NATIVE_SHARE_EVENT, h);
  return () => document.removeEventListener(NATIVE_SHARE_EVENT, h);
}

// ---------------------------------------------------------------------------
// Push (Firebase). The app owns the token; the page registers it with the signed-in user's session.
// ---------------------------------------------------------------------------

export const NATIVE_PUSH_TOKEN_EVENT = "fomo-native-push-token";

/** FCM registration tokens are url-safe strings of 100+ chars; anything else is not sent to the server. */
export function isValidPushToken(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_:.\-]{20,4096}$/.test(t);
}

/** The device's FCM token, or "" when the app has none yet (no Firebase config, offline, permission pending). */
export function nativePushToken(): string {
  const b = nativeBridge();
  try {
    const t = b && typeof b.getPushToken === "function" ? b.getPushToken() : "";
    return isValidPushToken(t) ? t : "";
  } catch {
    return "";
  }
}

/** Android 13+ shows the system dialog; older versions and repeated calls do nothing. */
export function requestNativeNotifications(): void {
  const b = nativeBridge();
  try {
    b?.requestNotificationPermission?.();
  } catch {
    /* old app build */
  }
}

/** The app got a new token (first fetch or rotation) — returns the unsubscribe function. */
export function onNativePushToken(cb: (token: string) => void): () => void {
  if (typeof document === "undefined") return () => {};
  const h = (e: Event) => {
    const t = (e as CustomEvent).detail?.token;
    if (isValidPushToken(t)) cb(t);
  };
  document.addEventListener(NATIVE_PUSH_TOKEN_EVENT, h);
  return () => document.removeEventListener(NATIVE_PUSH_TOKEN_EVENT, h);
}

// ---------------------------------------------------------------------------
// Native settings screen / app lock (feature-detected: older app builds and browsers simply do not have them).
// ---------------------------------------------------------------------------

/** What the installed app build can do: the JSON of FomoApp.appFeatures(). */
export interface NativeFeatures {
  schema: number;
  versionName: string;
  versionCode: number;
  /** The native settings screen exists (FomoApp.openSettings). */
  settings: boolean;
  /** The device can ask for a biometric / PIN, so the app lock can be switched on. */
  appLock: boolean;
  /** The app lock is switched on right now. */
  lockEnabled: boolean;
  /** Android 8+: sound / vibration are set per notification channel. */
  notificationChannels: boolean;
  updateCheck: boolean;
  /** FomoApp.setImmersive exists: the full-screen chart can hide the system bars. */
  immersive: boolean;
  /** FomoApp.saveFile / saveFileBegin exist: blob / data downloads (chart CSV, screenshot) go to the phone's Downloads. */
  saveFile: boolean;
}

/** Tolerant parser of FomoApp.appFeatures(): null for anything that is not a JSON object; missing fields become false / "". */
export function parseAppFeatures(raw: unknown): NativeFeatures | null {
  if (typeof raw !== "string" || !raw || raw.length > 4096) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const d = o as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 40) : "");
  return {
    schema: num(d.schema),
    versionName: str(d.versionName),
    versionCode: num(d.versionCode),
    settings: d.settings === true,
    appLock: d.appLock === true,
    lockEnabled: d.lockEnabled === true,
    notificationChannels: d.notificationChannels === true,
    updateCheck: d.updateCheck === true,
    immersive: d.immersive === true,
    saveFile: d.saveFile === true,
  };
}

/** Capabilities of the installed app build, or null outside the app / in a build without appFeatures(). */
export function nativeAppFeatures(): NativeFeatures | null {
  const b = nativeBridge();
  try {
    return b && typeof b.appFeatures === "function" ? parseAppFeatures(b.appFeatures()) : null;
  } catch {
    return null;
  }
}

/** True only inside an app build that has the native settings screen. Always false in a browser or PWA. */
export function canOpenNativeSettings(): boolean {
  const b = nativeBridge();
  if (!b || typeof b.openSettings !== "function") return false;
  const f = nativeAppFeatures();
  return f ? f.settings : true;
}

/** Opens the native settings screen; false when there is none (nothing happens then). */
export function openNativeSettings(): boolean {
  if (!canOpenNativeSettings()) return false;
  try {
    nativeBridge()?.openSettings?.();
    return true;
  } catch {
    return false;
  }
}

/** True only inside an app build that can hide the system bars (the full-screen chart); false in a browser / PWA / old app. */
export function canSetNativeImmersive(): boolean {
  const b = nativeBridge();
  if (!b || typeof b.setImmersive !== "function") return false;
  const f = nativeAppFeatures();
  return f ? f.immersive : false;
}

/** Hides (true) or shows (false) the system bars of the app; false when this app build has no such method. Never throws. */
export function setNativeImmersive(on: boolean): boolean {
  if (!canSetNativeImmersive()) return false;
  try {
    nativeBridge()?.setImmersive?.(on === true);
    return true;
  } catch {
    return false;
  }
}

/** The app left immersive mode on its own (it was stopped while the chart was full screen): the chart must collapse. Returns the unsubscribe function. */
export function onNativeImmersiveReset(cb: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const h = () => cb();
  document.addEventListener(NATIVE_IMMERSIVE_RESET_EVENT, h);
  return () => document.removeEventListener(NATIVE_IMMERSIVE_RESET_EVENT, h);
}

// ---------------------------------------------------------------------------
// App-only lightweight UI (tab bar + compact header). Switched on by the app itself, or by the preview flag in a browser.
// ---------------------------------------------------------------------------

/** sessionStorage key of the browser preview: opening any page with ?appui=1 sets it, ?appui=0 clears it. */
export const APP_UI_FLAG_KEY = "fomo-appui";
/** Class on <html> that every app-only style hangs on. */
export const APP_UI_CLASS = "app-ui";
/** Preview of the desktop-window layout of the app UI in a browser: ?appui=1&appdesktop=1 (sessionStorage), ?appdesktop=0 clears it. */
export const APP_DESKTOP_FLAG_KEY = "fomo-appdesktop";
/** Class on <html> next to `app-ui` inside the Windows / macOS desktop app (user agent marker FomoDesktop/) or in the preview: the wide-window layout, the mouse + keyboard navigation. */
export const APP_DESKTOP_CLASS = "app-desktop";

export interface AppUiInput {
  userAgent: string;
  /** window.FomoApp is an object */
  hasBridge: boolean;
  /** location.search */
  search: string;
  /** sessionStorage[APP_UI_FLAG_KEY] (null when unset or unreadable) */
  stored: string | null;
  /** sessionStorage[APP_DESKTOP_FLAG_KEY] (null when unset or unreadable) */
  storedDesktop?: string | null;
}

function flagQuery(search: string, name: string): "1" | "0" | null {
  let out: "1" | "0" | null = null;
  const re = new RegExp("[?&]" + name + "=([01])(?=&|#|$)", "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(search || ""))) out = m[1] as "1" | "0";
  return out;
}

/** The ?appui= query value ("1" / "0") or null. The last occurrence wins. */
export function appUiQuery(search: string): "1" | "0" | null {
  return flagQuery(search, "appui");
}

/** The ?appdesktop= query value ("1" / "0") or null. The last occurrence wins. */
export function appDesktopQuery(search: string): "1" | "0" | null {
  return flagQuery(search, "appdesktop");
}

/**
 * Pure decision of the app UI: active inside the Android app (UA marker or bridge), inside the desktop app (UA marker FomoDesktop/, which ?appui=0
 * switches off for that page: the escape hatch to the ordinary site), or when the preview flag is set.
 * `store` says what to do with the ?appui flag: "1" write it, "0" clear it, null leave it alone; `storeDesktop` the same for ?appdesktop.
 * `desktop`: the wide-window layout (desktop shell or the ?appdesktop=1 preview), never inside the Android app.
 */
export function resolveAppUi(i: AppUiInput): { active: boolean; store: "1" | "0" | null; desktop: boolean; storeDesktop: "1" | "0" | null } {
  const q = appUiQuery(i.search);
  const qd = appDesktopQuery(i.search);
  const flag = q === "1" ? true : q === "0" ? false : i.stored === "1";
  const flagDesktop = qd === "1" ? true : qd === "0" ? false : i.storedDesktop === "1";
  const android = i.hasBridge || /\bFomoApp\//.test(i.userAgent || "");
  const shell = /\bFomoDesktop\//.test(i.userAgent || "");
  const active = android || (shell && q !== "0") || flag;
  return { active, store: q, desktop: active && !android && (shell || flagDesktop), storeDesktop: qd };
}

/**
 * Inline script for the root layout <head> (runs before first paint, no secrets). Same logic as resolveAppUi;
 * scripts/check-app-ui.ts runs both against the same cases so they cannot drift apart.
 */
export const APP_UI_BOOT_SCRIPT =
  "try{var d=document.documentElement,u=navigator.userAgent,q=null,w=null,r=/[?&]appui=([01])(?=&|#|$)/g,v=/[?&]appdesktop=([01])(?=&|#|$)/g,m,f=null,g=null;" +
  "while((m=r.exec(location.search)))q=m[1];while((m=v.exec(location.search)))w=m[1];" +
  "try{if(q==='1')sessionStorage.setItem('fomo-appui','1');else if(q==='0')sessionStorage.removeItem('fomo-appui');f=sessionStorage.getItem('fomo-appui');" +
  "if(w==='1')sessionStorage.setItem('fomo-appdesktop','1');else if(w==='0')sessionStorage.removeItem('fomo-appdesktop');g=sessionStorage.getItem('fomo-appdesktop')}catch(e){f=q==='1'?'1':null;g=w==='1'?'1':null}" +
  "var a=/\\bFomoApp\\//.test(u)||!!(window.FomoApp&&typeof window.FomoApp==='object'),s=/\\bFomoDesktop\\//.test(u);" +
  "if(a||(s&&q!=='0')||(q!=='0'&&f==='1')||q==='1'){d.classList.add('app-ui');if(!a&&(s||w==='1'||(w!=='0'&&g==='1')))d.classList.add('app-desktop')}}catch(e){}";

/** True when the app UI is on: the class the boot script set, or the same decision made right now. Always false on the server. */
export function isNativeUi(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (document.documentElement.classList.contains(APP_UI_CLASS)) return true;
  return currentAppUi().active;
}

/** True when the wide-window layout of the app UI is on (desktop shell, or the preview): the class the boot script set, or the same decision made right now. Always false on the server. */
export function isDesktopUi(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (document.documentElement.classList.contains(APP_DESKTOP_CLASS)) return true;
  return currentAppUi().desktop;
}

function currentAppUi() {
  let stored: string | null = null;
  let storedDesktop: string | null = null;
  try {
    stored = sessionStorage.getItem(APP_UI_FLAG_KEY);
    storedDesktop = sessionStorage.getItem(APP_DESKTOP_FLAG_KEY);
  } catch {
    /* private mode */
  }
  return resolveAppUi({ userAgent: navigator.userAgent, hasBridge: nativeBridge() !== null, search: window.location.search, stored, storedDesktop });
}
