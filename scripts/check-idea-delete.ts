// Integration check. All fixtures and mutations are rolled back, including on failure.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { deleteIdeaRecords } from "../src/lib/idea-delete";

const db = new PrismaClient();
const rollback = new Error("rollback fixtures");
async function main() {
  const uid = `delete-check-${Date.now()}`;
  try {
    await db.$transaction(async tx => {
      await tx.user.create({ data: { id: uid, email: `${uid}@example.invalid`, displayName: "Deletion test", passwordHash: "disabled" } });
      const one = await tx.idea.create({ data: { authorId: uid, title: "fixture", preview: "fixture", content: "fixture" } });
      const two = await tx.idea.create({ data: { id: `${one.id}suffix`, authorId: uid, title: "keep", preview: "keep", content: "keep" } });
      const archived = await tx.idea.create({ data: { authorId: uid, title: "archive stays", preview: "fixture", content: "fixture", moderationStatus: "archived" } });
      await tx.ideaVote.create({ data: { userId: uid, ideaId: one.id, value: 1 } });
      await tx.ideaComment.create({ data: { userId: uid, ideaId: one.id, text: "fixture", fileUrl: `/uploads/messages/${uid}/test.jpg` } });
      await tx.notification.createMany({ data: [one.id, `${one.id}#comments`, `${one.id}?comment=x`, two.id].map(id => ({ userId: uid, type: "new_idea", title: "fixture", link: `/ideas/${id}` })) });
      const removed = await deleteIdeaRecords(tx, { id: one.id, authorId: uid });
      assert.equal(removed.length, 1);
      assert.equal(removed[0].comments.length, 1);
      assert.equal(await tx.idea.count({ where: { id: one.id } }), 0);
      assert.equal(await tx.ideaComment.count({ where: { ideaId: one.id } }), 0);
      assert.equal(await tx.ideaVote.count({ where: { ideaId: one.id } }), 0);
      assert.equal(await tx.notification.count({ where: { userId: uid } }), 1);
      assert.equal(await tx.idea.count({ where: { id: two.id } }), 1);
      assert.deepEqual(await deleteIdeaRecords(tx, { id: one.id }), []);
      assert.deepEqual(await deleteIdeaRecords(tx, { id: two.id, authorId: "different-author" }), []);
      assert.equal((await tx.idea.findUniqueOrThrow({ where: { id: archived.id } })).moderationStatus, "archived");
      throw rollback;
    });
  } catch (e) { if (e !== rollback) throw e; }
  assert.equal(await db.user.count({ where: { id: uid } }), 0);
  console.log("OK: permanent delete, comment/vote cascades, notification boundaries, author scope, repeat delete, fixture rollback");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
