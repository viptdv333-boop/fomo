/* Like notifications: link/token round trip, the one-per-(actor,target) rule, merging of bursts into the unread row, texts in 3 languages.
   Pure (no DB): the Prisma side (src/lib/like-notify-server.ts) only feeds the rows of the target into planLikeNotification.
   Run: npx tsx scripts/check-like-notify.ts   (exit code 1 on a failed assertion) */
import {
  LIKE_EMOJI,
  LIKE_TOKEN_CAP,
  actorToken,
  buildLikeLink,
  likeBaseLink,
  likeBody,
  likeTitle,
  parseLikeLink,
  planLikeNotification,
  type LikeRowLite,
} from "../src/lib/like-notify";
import { renderNotifText } from "../src/lib/notif-render";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const A = "ckactorAAAAAAAAAAAAAAAA01";
const B = "ckactorBBBBBBBBBBBBBBBB02";
const C = "ckactorCCCCCCCCCCCCCCCC03";
const idea = likeBaseLink("ckidea00001");
const cmt = likeBaseLink("ckidea00001", "cmcomment01");

eq("base links", [idea, cmt], ["/ideas/ckidea00001", "/ideas/ckidea00001?comment=cmcomment01"]);
eq("emoji of a like", LIKE_EMOJI, "👍");
eq("token = last 8 chars", actorToken(A), "AAAAAA01");

/* ---- link round trip ---- */
const l1 = buildLikeLink(idea, 1, [actorToken(A)]);
const l2 = buildLikeLink(cmt, 2, [actorToken(A), actorToken(B)]);
eq("idea link: ? separator", l1, "/ideas/ckidea00001?lk=1_AAAAAA01");
eq("comment link: & separator (the ?comment= anchor stays first)", l2, "/ideas/ckidea00001?comment=cmcomment01&lk=2_AAAAAA01.BBBBBB02");
eq("parse round trip", [parseLikeLink(l1), parseLikeLink(l2)], [{ base: idea, count: 1, tokens: ["AAAAAA01"] }, { base: cmt, count: 2, tokens: ["AAAAAA01", "BBBBBB02"] }]);
eq("parse: bare / null / junk links", [parseLikeLink(idea), parseLikeLink(null), parseLikeLink("/ideas/x?lk=abc")], [{ base: idea, count: 0, tokens: [] }, { base: "", count: 0, tokens: [] }, { base: "/ideas/x?lk=abc", count: 0, tokens: [] }]);
const many = buildLikeLink(idea, 40, Array.from({ length: 30 }, (_, i) => `t${String(i).padStart(7, "0")}`));
eq("token list is capped to the latest ones, the count is kept", [parseLikeLink(many).tokens.length, parseLikeLink(many).count, parseLikeLink(many).tokens[LIKE_TOKEN_CAP - 1], many.length < 200], [LIKE_TOKEN_CAP, 40, "t0000029", true]);

/* ---- planning ---- */
eq("first like: a new row with count 1", planLikeNotification([], idea, A), { action: "create", link: l1, count: 1 });
const rowA: LikeRowLite = { id: "n1", link: l1, isRead: false };
eq("the same actor again (unlike -> like): nothing", planLikeNotification([rowA], idea, A), { action: "skip" });
eq("the same actor again after the row was READ: still nothing (once per actor and target, ever)", planLikeNotification([{ ...rowA, isRead: true }], idea, A), { action: "skip" });
eq("a second actor merges into the unread row", planLikeNotification([rowA], idea, B), { action: "update", id: "n1", link: buildLikeLink(idea, 2, [actorToken(A), actorToken(B)]), count: 2 });
const rowAB: LikeRowLite = { id: "n1", link: buildLikeLink(idea, 2, [actorToken(A), actorToken(B)]), isRead: false };
eq("a third one: count 3, the row id stays", planLikeNotification([rowAB], idea, C), { action: "update", id: "n1", link: buildLikeLink(idea, 3, [actorToken(A), actorToken(B), actorToken(C)]), count: 3 });
eq("a new liker after the unread row was read starts a NEW row (count 1)", planLikeNotification([{ ...rowAB, isRead: true }], idea, C), { action: "create", link: buildLikeLink(idea, 1, [actorToken(C)]), count: 1 });
eq("an old actor of a READ row stays blocked even when an unread row of the target exists", planLikeNotification([{ id: "n2", link: buildLikeLink(idea, 1, [actorToken(C)]), isRead: false }, { ...rowAB, isRead: true }], idea, A), { action: "skip" });
eq("another target (comment of the same idea) is independent", planLikeNotification([rowA], cmt, A), { action: "create", link: buildLikeLink(cmt, 1, [actorToken(A)]), count: 1 });
eq("rows of other targets are ignored", planLikeNotification([{ id: "z", link: buildLikeLink("/ideas/other0001", 1, [actorToken(A)]), isRead: false }], idea, A), { action: "create", link: l1, count: 1 });
eq("a legacy bare row (no lk) is merged into, counted as 1", planLikeNotification([{ id: "n9", link: idea, isRead: false }], idea, B), { action: "update", id: "n9", link: buildLikeLink(idea, 2, [actorToken(B)]), count: 2 });
// a simulated burst: 50 different people, all unread -> still one row, count 50
let row: LikeRowLite = { id: "n1", link: l1, isRead: false };
let rowsCreated = 1;
for (let i = 0; i < 49; i++) {
  const p = planLikeNotification([row], idea, `ckburst${String(i).padStart(18, "0")}`);
  if (p.action === "create") rowsCreated++;
  else if (p.action === "update") row = { id: p.id, link: p.link, isRead: false };
}
eq("burst of 50 likers: ONE row, count 50, link stays short", [rowsCreated, parseLikeLink(row.link).count, row.link!.length < 200], [1, 50, true]);

/* ---- texts ---- */
eq("ru idea, 1", renderNotifText(likeTitle("idea_like", "Анна", 1), "ru"), "Анна оценил(а) вашу идею");
eq("ru idea, 3 (name + 2 others)", renderNotifText(likeTitle("idea_like", "Анна", 3), "ru"), "Анна и ещё 2 оценили вашу идею");
eq("ru comment, 1", renderNotifText(likeTitle("comment_like", "Анна", 1), "ru"), "Анна поставил(а) лайк вашему комментарию");
eq("ru comment, 2", renderNotifText(likeTitle("comment_like", "Анна", 2), "ru"), "Анна и ещё 1 поставили лайк вашему комментарию");
eq("en", [renderNotifText(likeTitle("idea_like", "Ann", 1), "en"), renderNotifText(likeTitle("idea_like", "Ann", 4), "en"), renderNotifText(likeTitle("comment_like", "Ann", 1), "en")], ["Ann liked your idea", "Ann and 3 more liked your idea", "Ann liked your comment"]);
eq("cn has its own text", ["idea_like", "comment_like"].every((k) => renderNotifText(likeTitle(k as never, "A", 1), "cn") !== renderNotifText(likeTitle(k as never, "A", 1), "en") && renderNotifText(likeTitle(k as never, "A", 5), "cn").includes("4")), true);
eq("body: quoted, cut, empty -> none", [likeBody("Нефть на подходе"), likeBody("x".repeat(100))!.length, likeBody("  \n "), likeBody(null)], ["«Нефть на подходе»", 82, undefined, undefined]);

if (fails) {
  console.error(`\n${fails} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall like-notify checks passed");
