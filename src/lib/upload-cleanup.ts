import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const IDEAS_DIR = path.join(process.cwd(), "public", "uploads", "ideas");

/**
 * Attachment urls (as stored on an idea) that point at the AUTHOR's own idea uploads: /uploads/ideas/<authorId>/<file>.
 * Anything else (another user's file, a path trick) is ignored, so an edited attachment url can never make a delete reach a foreign file.
 */
export function ideaUploadUrls(attachments: unknown, authorId: string): string[] {
  if (!/^[A-Za-z0-9_-]+$/.test(authorId)) return [];
  if (!Array.isArray(attachments)) return [];
  const out: string[] = [];
  for (const a of attachments) {
    const url = a && typeof a === "object" ? (a as { url?: unknown }).url : null;
    if (typeof url === "string" && url.startsWith(`/uploads/ideas/${authorId}/`) && /^\/uploads\/ideas\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(url) && !url.includes("..")) out.push(url);
  }
  return out;
}

/** Removes the files of attachments that are no longer used (idea deleted / attachment dropped). Never throws. A file another idea still lists stays. */
export async function removeIdeaUploads(urls: string[], exceptIdeaId: string): Promise<void> {
  for (const url of urls) {
    try {
      const used = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Idea" WHERE "id" <> ${exceptIdeaId} AND "attachments"::text LIKE ${"%" + url + "%"} LIMIT 1`;
      if (used.length > 0) continue;
      const full = path.join(process.cwd(), "public", url);
      if (!full.startsWith(IDEAS_DIR + path.sep)) continue;
      await unlink(full);
    } catch {
      /* already gone */
    }
  }
}
