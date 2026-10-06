import { hasNativeClipboardImage, readNativeClipboardImage } from "@/lib/native-app";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * The file (screenshot, copied image or file) in a paste event, or null when
 * the clipboard holds only text. Screenshots arrive as a generic "image.png",
 * so they get a timestamped name to tell them apart in the chat.
 */
export function getPastedFile(
  e: { clipboardData: DataTransfer | null },
  only: "image" | "any" = "any"
): File | null {
  const data = e.clipboardData;
  if (!data) return null;

  let file: File | null = data.files?.[0] ?? null;
  if (!file) {
    for (const item of Array.from(data.items ?? [])) {
      if (item.kind === "file") {
        file = item.getAsFile();
        if (file) break;
      }
    }
  }
  if (!file) return null;
  if (only === "image" && !file.type.startsWith("image/")) return null;

  if (/^image\.\w+$/i.test(file.name) || !file.name) {
    const ext = EXT_BY_MIME[file.type] ?? "png";
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return new File([file], `screenshot-${stamp}.${ext}`, { type: file.type, lastModified: Date.now() });
  }
  return file;
}

/** Image from the system clipboard via the async API (needs a user gesture); null when there is none or access is denied. */
export async function readClipboardImage(): Promise<File | null> {
  // Android app: the WebView cannot read an image clipboard through the web API, the app bridge can
  const native = readNativeClipboardImage();
  if (native.file) return native.file;
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const it of items) {
      const type = it.types.find((x) => x.startsWith("image/"));
      if (!type) continue;
      const blob = await it.getType(type);
      const ext = EXT_BY_MIME[type] ?? "png";
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
      return new File([blob], `screenshot-${stamp}.${ext}`, { type });
    }
  } catch {}
  return null;
}

/** Floating "paste the screenshot" chip: the Android Paste menu does not deliver images to web fields, the clipboard API does. */
function offerClipboardImage(onPick: () => void) {
  if (typeof document === "undefined" || document.getElementById("composer-clip-chip")) return;
  const d = document.createElement("div");
  d.id = "composer-clip-chip";
  d.style.cssText =
    "position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:200;display:flex;align-items:center;gap:6px;padding:6px 8px 6px 14px;border-radius:999px;background:#16a34a;color:#fff;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,.35)";
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = "📋 Вставить скриншот";
  b.style.cssText = "background:none;border:0;color:#fff;font-size:14px;font-weight:600;padding:6px 4px";
  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "✕";
  x.style.cssText = "background:rgba(0,0,0,.2);border:0;color:#fff;width:28px;height:28px;border-radius:50%;font-size:13px";
  const close = () => d.remove();
  // keep the field focused while tapping the chip (otherwise the keyboard collapses before the click lands)
  d.addEventListener("pointerdown", (e) => e.preventDefault());
  b.addEventListener("click", () => {
    close();
    onPick();
  });
  x.addEventListener("click", close);
  d.append(b, x);
  document.body.appendChild(d);
  setTimeout(close, 10000);
}

async function clipboardReadGranted(): Promise<boolean> {
  try {
    const st = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
    return st.state === "granted";
  } catch {
    return false;
  }
}

/** On focusing a message field: when the clipboard (already permitted) holds an image, show the paste chip. */
export function maybeOfferClipboardImage(onFile: (file: File) => void) {
  if (hasNativeClipboardImage()) {
    const f = readNativeClipboardImage().file;
    if (f) offerClipboardImage(() => onFile(f));
    return;
  }
  clipboardReadGranted().then((ok) => {
    if (!ok) return;
    readClipboardImage().then((f) => {
      if (f) offerClipboardImage(() => onFile(f));
    });
  });
}

/** Like readClipboardImage but explains why nothing came back (shown to the user, since phones cannot be inspected remotely). */
export async function readClipboardImageDetailed(): Promise<{ file: File | null; why: string }> {
  const native = readNativeClipboardImage();
  if (native.file) return { file: native.file, why: "" };
  if (typeof navigator === "undefined" || !navigator.clipboard) return { file: null, why: "clipboard API недоступен" };
  if (typeof navigator.clipboard.read !== "function") return { file: null, why: "clipboard.read не поддерживается" };
  try {
    const items = await navigator.clipboard.read();
    const types: string[] = [];
    for (const it of items) {
      types.push(...it.types);
      const type = it.types.find((x) => x.startsWith("image/"));
      if (!type) continue;
      const blob = await it.getType(type);
      const ext = EXT_BY_MIME[type] ?? "png";
      return { file: new File([blob], `screenshot-${Date.now()}.${ext}`, { type }), why: "" };
    }
    return { file: null, why: items.length ? `в буфере нет картинки (типы: ${types.join(", ") || "—"})` : "буфер пуст" };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return { file: null, why: `${err.name || "Error"}: ${err.message || ""}`.trim() };
  }
}

/** A file shared into the installed app ("Share → FOMO"); the service worker keeps it for 15 minutes. Returns it once. */
export async function consumeSharedFile(): Promise<File | null> {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open("fomo-share");
    const res = await cache.match("/__shared__");
    if (!res) return null;
    await cache.delete("/__shared__");
    if (Date.now() - Number(res.headers.get("X-Time") || 0) > 15 * 60_000) return null;
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get("X-Name") || "shared");
    const isShot = /^image\.\w+$/i.test(name) || !name;
    return new File([blob], isShot ? `screenshot-${Date.now()}.png` : name, { type: blob.type });
  } catch {
    return null;
  }
}

/** Looks at the shared file without taking it (the destination picker shows a preview). */
export async function peekSharedFile(): Promise<File | null> {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open("fomo-share");
    const res = await cache.match("/__shared__");
    if (!res) return null;
    if (Date.now() - Number(res.headers.get("X-Time") || 0) > 15 * 60_000) return null;
    const blob = await res.blob();
    return new File([blob], decodeURIComponent(res.headers.get("X-Name") || "shared"), { type: blob.type });
  } catch {
    return null;
  }
}

/** Android app: a file from the "Share → FOMO" intent goes into the same cache the service worker uses, so peek/consumeSharedFile work unchanged. */
export async function stashSharedFile(file: File): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const cache = await caches.open("fomo-share");
    await cache.put(
      "/__shared__",
      new Response(file, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Name": encodeURIComponent(file.name || "shared"),
          "X-Time": String(Date.now()),
        },
      })
    );
    return true;
  } catch {
    return false;
  }
}
