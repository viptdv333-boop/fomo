// "Download this file" for files the page builds itself (chart CSV, chart screenshot, indicator code).
//
// In a browser / PWA / the Windows app an <a download href=blob:...> works. In the Android app's WebView it does NOT: the download
// listener gets a blob:/data: URL that DownloadManager cannot fetch. So inside the app (build with the `saveFile` feature, 1.0.2+) the bytes
// go through the native bridge (FomoApp.saveFile / saveFileBegin+Chunk+End) into the phone's Downloads, and everywhere else the standard
// anchor download is used. Always call saveBlobAsFile instead of building an <a download> by hand.
// Check: npx tsx scripts/check-native-app.ts

import { nativeBridge, nativeAppFeatures, type FomoBridge } from "./native-app";

/** Raw bytes per bridge chunk: a multiple of 3, so every base64 piece stands on its own (no "=" in the middle). 384 KB -> 512 K characters. */
export const SAVE_CHUNK_BYTES = 393216;
/** Files up to this many raw bytes go over the bridge in one call (576 KB -> 768 K characters of base64). */
export const SAVE_SINGLE_MAX_BYTES = 589824;
/** Longest file name sent / used (the app applies the same limit). */
export const SAVE_NAME_MAX = 100;

const EXT_BY_TYPE: Record<string, string> = {
  "text/csv": "csv",
  "text/plain": "txt",
  "text/html": "html",
  "application/json": "json",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 || i === name.length - 1 ? "" : name.slice(i + 1).toLowerCase();
}

/**
 * A safe file name: last path segment only, no control / reserved characters, no leading dots or trailing dots / spaces, at most
 * SAVE_NAME_MAX characters with the extension kept, an extension from the MIME type when there is none, "download" when nothing is left.
 * Same rules as SaveFilePolicy.sanitizeName in the app (android/), which enforces them again on its side.
 */
export function sanitizeSaveName(name: unknown, type?: string): string {
  let n = typeof name === "string" ? name : "";
  n = n.split(/[\\/]/).pop() ?? "";
  n = n.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[<>:"|?*]/g, "_");
  n = n.trim().replace(/^\.+/, "").replace(/[. ]+$/, "");
  const mimeExt = EXT_BY_TYPE[(type ?? "").split(";")[0].trim().toLowerCase()];
  if (!n) n = "download";
  if (!extOf(n) && mimeExt) n = `${n.replace(/\.+$/, "")}.${mimeExt}`;
  if (n.length > SAVE_NAME_MAX) {
    const ext = extOf(n);
    const dot = ext ? `.${ext.slice(0, 10)}` : "";
    const stem = ext ? n.slice(0, n.length - ext.length - 1) : n;
    n = stem.slice(0, SAVE_NAME_MAX - dot.length).replace(/[. ]+$/, "") + dot;
  }
  return n;
}

/** Bytes -> base64 (no data: prefix). Works piecewise, so big arrays do not overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + STEP)));
  }
  return btoa(bin);
}

/** True inside an app build that can save files into Downloads (the bridge methods exist and the build says so). */
export function canSaveNativeFile(): boolean {
  const b = nativeBridge();
  if (!b || typeof b.saveFile !== "function" || typeof b.saveFileBegin !== "function") return false;
  return nativeAppFeatures()?.saveFile === true;
}

const isOk = (r: unknown) => r === "ok";

async function saveViaBridge(b: FomoBridge, blob: Blob, name: string): Promise<boolean> {
  const type = blob.type || "application/octet-stream";
  if (blob.size > 0 && blob.size <= SAVE_SINGLE_MAX_BYTES) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return isOk(b.saveFile!(name, type, bytesToBase64(bytes)));
  }
  const begin = String(b.saveFileBegin!(name, type));
  if (!begin.startsWith("ok:")) return false; // the app has shown its own toast
  const token = begin.slice(3);
  try {
    for (let i = 0; i < blob.size; i += SAVE_CHUNK_BYTES) {
      const bytes = new Uint8Array(await blob.slice(i, i + SAVE_CHUNK_BYTES).arrayBuffer());
      if (!isOk(b.saveFileChunk!(token, bytesToBase64(bytes)))) return false; // the app dropped the half file and told the user
    }
  } catch {
    try {
      b.saveFileFailed?.(token);
    } catch {
      /* ignore */
    }
    return false;
  }
  return isOk(b.saveFileEnd!(token));
}

/** The standard download: object URL + <a download>, revoked a little later (the browser has started reading it by then). */
function saveViaAnchor(blob: Blob, name: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads `blob` as `filename`. Android app: into the phone's Downloads through the bridge (the app confirms with a toast);
 * browser / PWA / Windows app: the usual <a download>. Resolves true when the save was started / done, false when it failed (inside
 * the app the user has already seen the app's own error toast). Never throws.
 */
export async function saveBlobAsFile(blob: Blob, filename: string): Promise<boolean> {
  const name = sanitizeSaveName(filename, blob.type);
  if (canSaveNativeFile()) {
    try {
      return await saveViaBridge(nativeBridge()!, blob, name);
    } catch {
      return false;
    }
  }
  return saveViaAnchor(blob, name);
}

/** Same for a data: URL (canvas.toDataURL). Falls back to a plain data: anchor if the URL cannot be turned into a Blob. */
export async function saveDataUrlAsFile(dataUrl: string, filename: string): Promise<boolean> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    return await saveBlobAsFile(blob, filename);
  } catch {
    if (canSaveNativeFile() || typeof document === "undefined") return false;
    try {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = sanitizeSaveName(filename);
      a.click();
      return true;
    } catch {
      return false;
    }
  }
}
