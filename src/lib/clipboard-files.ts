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
  clipboardReadGranted().then((ok) => {
    if (!ok) return;
    readClipboardImage().then((f) => {
      if (f) offerClipboardImage(() => onFile(f));
    });
  });
}
