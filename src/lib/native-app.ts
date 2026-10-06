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
