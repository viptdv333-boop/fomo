import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const cwd = process.cwd();
  const dir = await mkdtemp(path.join(os.tmpdir(), "fomo-idea-cleanup-"));
  try {
    process.chdir(dir);
    const urls = ["/uploads/ideas/author/own.jpg", "/uploads/ideas/author/shared.jpg", "/uploads/ideas/other/keep.jpg", "/uploads/messages/commenter/comment.jpg", "/uploads/messages/commenter/shared.jpg"];
    for (const url of urls) {
      const file = path.join(dir, "public", url);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "fixture");
    }
    (globalThis as any).prisma = { $queryRaw: async (_sql: unknown, ...args: unknown[]) => args.some(v => String(v).includes("shared.jpg")) ? [{ id: "still-used" }] : [] };
    const { removeDeletedIdeaUploads, ideaUploadUrls } = await import("../src/lib/upload-cleanup");
    assert.deepEqual(ideaUploadUrls([{ url: "/uploads/ideas/author/../other/keep.jpg" }], "author"), []);
    const rows = [{ id: "deleted", authorId: "author", attachments: urls.slice(0, 3).map(url => ({ url })), comments: urls.slice(3).map(fileUrl => ({ userId: "commenter", fileUrl })) }];
    await removeDeletedIdeaUploads(rows);
    for (const i of [0, 3]) await assert.rejects(access(path.join(dir, "public", urls[i])));
    for (const i of [1, 2, 4]) await access(path.join(dir, "public", urls[i]));
    await removeDeletedIdeaUploads(rows);
    console.log("OK: own post/comment files removed, shared files and foreign owner preserved, traversal rejected, repeat cleanup safe");
  } finally {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
