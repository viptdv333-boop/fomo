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
