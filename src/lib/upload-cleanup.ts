import { unlink } from "fs/promises";
import path from "path";

const IDEAS_DIR = path.join(process.cwd(), "public", "uploads", "ideas");

/** Attachment urls (as stored on an idea) that point at our own idea uploads: /uploads/ideas/<userId>/<file>. */
export function ideaUploadUrls(attachments: unknown): string[] {
  if (!Array.isArray(attachments)) return [];
  const out: string[] = [];
  for (const a of attachments) {
    const url = a && typeof a === "object" ? (a as { url?: unknown }).url : null;
    if (typeof url === "string" && /^\/uploads\/ideas\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(url) && !url.includes("..")) out.push(url);
  }
  return out;
}

/** Removes the files of attachments that are no longer used (idea deleted / attachment dropped). Never throws. */
export async function removeIdeaUploads(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      const full = path.join(process.cwd(), "public", url);
      if (!full.startsWith(IDEAS_DIR + path.sep)) continue;
      await unlink(full);
    } catch {
      /* already gone */
    }
  }
}
