/* The pure parts of the one-off account sync (src/lib/account-sync.ts): matching, masking, .env / argument parsing, the plan (what is updated, created,
   skipped), the "main wins, empty never blanks" merge, conflicts, idempotency (planning again after applying the plan finds nothing to do).
   Run: npx tsx scripts/check-sync-accounts.ts   (exit code 1 on a failed assertion) */
import { emailKey, emptyCounts, formatSummary, maskEmail, parseArgs, parseEnvFile, planSync, userLine, type Group, type MatchedItem, type SyncPlan, type SyncUser } from "../src/lib/account-sync";
import { FOMO_ID_REGEX } from "../src/lib/fomoId";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const bc = (c: string) => "$2b$10$" + c.repeat(53);
let n = 0;
function user(over: Partial<SyncUser> & { email: string }): SyncUser {
  n++;
  return {
    id: "id" + n, passwordHash: bc("A"), role: "USER", status: "APPROVED", sessionVersion: 0, displayName: "Name" + n, fomoId: "fomo_user" + String(1000000 + n),
    avatarUrl: null, bio: null, firstName: null, lastName: null, birthDate: null, city: null, workplace: null, exchangeExperience: null, specializations: [],
    socialLinks: null, locale: "ru", dmEnabled: true, ...over,
  } as SyncUser;
}

/** What the executor does with a plan, in memory (no avatars): used to prove that planning again finds nothing. */
function applyPlan(plan: SyncPlan, main: SyncUser[], term: SyncUser[], toMain: boolean): void {
  for (const m of plan.matched) {
    const t = term.find((x) => x.id === m.term.id)!;
    Object.assign(t, m.data);
    if (m.bumpSession) t.sessionVersion++;
  }
  let k = 0;
  for (const c of plan.createOnTerminal) term.push({ id: "t-new" + ++k, sessionVersion: 0, avatarUrl: null, ...c.data } as SyncUser);
  if (toMain) for (const c of plan.createOnMain) main.push({ id: "m-new" + ++k, sessionVersion: 0, avatarUrl: null, ...c.data } as SyncUser);
}

async function main() {
  /* ---- helpers ---- */
  eq("emailKey: trimmed and lower-cased", [" Anna@B.co ", "anna@b.co", "\tANNA@b.co "].map(emailKey), ["anna@b.co", "anna@b.co", "anna@b.co"]);
  eq("maskEmail: first letter, ***, domain - nothing else", [maskEmail("Anna.Smith@Mail.com"), maskEmail("x@y.zz"), maskEmail("junk"), maskEmail("")], ["A***@Mail.com", "x***@y.zz", "***", "***"]);
  eq("parseEnvFile: KEY=value, quotes, export, comments, CRLF, equals signs inside", parseEnvFile('# c\r\nA=1\r\nexport B="x=y z"\nC=\'q\'\n  D = plain # note\nbad line\nDATABASE_URL="postgresql://u:p@h:5432/db?schema=public"\n'), {
    A: "1", B: "x=y z", C: "q", D: "plain", DATABASE_URL: "postgresql://u:p@h:5432/db?schema=public",
  });
  eq("parseEnvFile: never throws on junk", [parseEnvFile(""), parseEnvFile(undefined as unknown as string), parseEnvFile("=\n===\n")], [{}, {}, {}]);
  eq("parseArgs: dry run by default", parseArgs([]), { apply: false, terminalOnlyToMain: false, mainEnv: "/opt/fomo/.env", terminalEnv: "/opt/fomo-terminal/.env", force: false, unknown: [] });
  eq("parseArgs: flags and overrides", parseArgs(["--apply", "--terminal-only-to-main", "--main-env", "/a/.env", "--terminal-env", "/b/.env"]), { apply: true, terminalOnlyToMain: true, mainEnv: "/a/.env", terminalEnv: "/b/.env", force: false, unknown: [] });
  eq("parseArgs: an unknown argument is reported (the script refuses to run)", parseArgs(["--aply"]).unknown, ["--aply"]);

  /* ---- matched accounts: terminal := main ---- */
  {
    const m = user({ email: "Anna@B.co", passwordHash: bc("M"), displayName: "Anna", bio: "main bio", city: "Kazan", locale: "en", dmEnabled: false, specializations: ["futures"], socialLinks: { telegram: "@a" }, fomoId: "fomo_user7000001", role: "OWNER", status: "APPROVED" });
    const t = user({ email: " anna@b.co", passwordHash: bc("T"), displayName: "Old", bio: "term bio", city: null, locale: "ru", role: "USER", status: "BANNED", sessionVersion: 3, fomoId: "fomo_user8000001" });
    const plan = await planSync([m], [t], { terminalOnlyToMain: false });
    const it = plan.matched[0];
    eq("match: by trimmed, case-insensitive address", [plan.matched.length, plan.createOnTerminal.length, plan.conflicts.length], [1, 0, 0]);
    eq("matched: password, e-mail (main's spelling) and profile change; the groups say so", [...it.groups].sort(), ["email", "password", "profile"]);
    eq("matched: the update carries the master hash, the master spelling and the profile fields that have a value on main", it.data, {
      passwordHash: bc("M"), email: "Anna@B.co", displayName: "Anna", bio: "main bio", city: "Kazan", specializations: ["futures"], socialLinks: { telegram: "@a" }, locale: "en", dmEnabled: false, fomoId: "fomo_user7000001",
    });
    eq("matched: sessions are closed because the hash changed", it.bumpSession, true);
    eq("matched: role, status, ban, rating and payment fields are never in the update (even though they differ)", Object.keys(it.data).filter((k) => ["role", "status", "bannedUntil", "banReason", "rating", "ratingBonus", "paymentCard", "donationCard", "sbpQrUrl", "subscriptionPrice", "sessionVersion", "id"].includes(k)), []);
  }
  {
    const m = user({ email: "a@b.co", displayName: "Main", bio: null, city: "", firstName: "  ", locale: "ru", dmEnabled: true, specializations: [], socialLinks: {} });
    const t = user({ email: "a@b.co", displayName: "Main", bio: "keep bio", city: "keep city", firstName: "Keep", locale: "en", dmEnabled: false, specializations: ["keep"], socialLinks: { vk: "k" }, fomoId: m.fomoId });
    const plan = await planSync([m], [t], { terminalOnlyToMain: false });
    eq("matched: empty values on main (null, blank, empty list, defaults) never blank the terminal's own; nothing to do", [plan.matched[0].groups.size, Object.keys(plan.matched[0].data), plan.matched[0].bumpSession], [0, [], false]);
  }
  {
    const m = user({ email: "a@b.co", passwordHash: bc("A"), fomoId: "fomo_user1" + "000000", displayName: "Same" });
    const t = user({ email: "a@b.co", passwordHash: bc("A"), fomoId: "fomo_user1" + "000000", displayName: "Same" });
    const plan = await planSync([m], [t], { terminalOnlyToMain: false });
    eq("matched: identical accounts -> no change, no session bump", [plan.matched[0].groups.size, plan.matched[0].bumpSession], [0, false]);
  }
  {
    const m = user({ email: "a@b.co", passwordHash: bc("A"), displayName: "Same", fomoId: "fomo_user5555555" });
    const t = user({ email: "a@b.co", passwordHash: bc("A"), displayName: "Same", fomoId: "fomo_user6666666" });
    const other = user({ email: "other@b.co", fomoId: "fomo_user5555555" });
    const plan = await planSync([m], [t, other], { terminalOnlyToMain: false });
    eq("fomoId: main's wins unless another terminal account holds it (then the local one stays, reported)", [plan.matched[0].data.fomoId, plan.matched[0].fomoIdKept, plan.matched[0].groups.size], [undefined, true, 0]);
    const plan2 = await planSync([m], [t], { terminalOnlyToMain: false });
    eq("fomoId: free on the terminal -> main's wins", [plan2.matched[0].data.fomoId, plan2.matched[0].fomoIdKept], ["fomo_user5555555", false]);
  }
  {
    const m = user({ email: "a@b.co", avatarUrl: "/uploads/avatars/mainid/abc.jpg", displayName: "Same", fomoId: "fomo_user2222222" });
    const t = user({ email: "a@b.co", avatarUrl: null, displayName: "Same", fomoId: "fomo_user2222222", passwordHash: m.passwordHash });
    const bad = user({ email: "b@b.co", avatarUrl: "https://evil.example/a.jpg", displayName: "Same" });
    const plan = await planSync([m, bad], [t, user({ email: "b@b.co", displayName: "Same" })], { terminalOnlyToMain: false });
    eq("avatar: the main picture path is handed to the executor (it compares the pictures); an external URL is not", [plan.matched[0].avatarFrom, plan.matched[1].avatarFrom], ["/uploads/avatars/mainid/abc.jpg", null]);
    const noAv = await planSync([user({ email: "c@b.co", avatarUrl: null })], [user({ email: "c@b.co", avatarUrl: "/uploads/avatars/t/keep.jpg" })], { terminalOnlyToMain: false });
    eq("avatar: no avatar on main -> the terminal's own is left alone", noAv.matched[0].avatarFrom, null);
  }

  /* ---- only on main / only on the terminal ---- */
  {
    const mainOnly = user({ email: "new@b.co", passwordHash: bc("N"), displayName: "New", city: "Oslo", bio: null, fomoId: "fomo_user9100001", role: "ADMIN" });
    const pending = user({ email: "pend@b.co", status: "PENDING" });
    const banned = user({ email: "ban@b.co", status: "BANNED" });
    const taken = user({ email: "tk@b.co", fomoId: "fomo_user9200001", displayName: "Tk" });
    const holder = user({ email: "holder@b.co", fomoId: "fomo_user9200001" });
    const plan = await planSync([mainOnly, pending, banned, taken], [holder], { terminalOnlyToMain: false });
    eq("create: main-only APPROVED accounts are created on the terminal; PENDING / BANNED are not", [plan.createOnTerminal.map((c) => c.from.id), plan.mainOnlySkipped.map((u) => u.id)], [[mainOnly.id, taken.id], [pending.id, banned.id]]);
    const c = plan.createOnTerminal[0].data;
    eq("create: role USER, status APPROVED (whatever the source role), the same hash, e-mail and profile; nulls left out", [c.role, c.status, c.passwordHash === bc("N"), c.email, c.displayName, c.city, "bio" in c, c.fomoId], ["USER", "APPROVED", true, "new@b.co", "New", "Oslo", false, "fomo_user9100001"]);
    const c2 = plan.createOnTerminal[1];
    eq("create: a taken fomoId gets the deterministic alternative", [c2.fomoIdChanged, FOMO_ID_REGEX.test(String(c2.data.fomoId)), String(c2.data.fomoId).startsWith("fomo_user9200001_")], [true, true, true]);
    eq("create: only fields of the whitelist and the credentials, no id, rating, ban or payment fields", Object.keys(c).filter((k) => ["id", "rating", "bannedUntil", "banReason", "paymentCard", "sbpQrUrl", "subscriptionPrice", "sessionVersion"].includes(k)), []);
  }
  {
    const tOnly = user({ email: "t1@b.co", fomoId: "fomo_user9300001" });
    const tPend = user({ email: "t2@b.co", status: "PENDING" });
    const off = await planSync([], [tOnly, tPend], { terminalOnlyToMain: false });
    eq("terminal-only: counted, NOT created on main by default", [off.terminalOnly.length, off.createOnMain.length], [2, 0]);
    const on = await planSync([], [tOnly, tPend], { terminalOnlyToMain: true });
    eq("terminal-only with --terminal-only-to-main: APPROVED ones are created on main (USER / APPROVED), the others are listed as skipped", [on.createOnMain.map((c) => c.from.id), on.terminalOnlySkipped.map((u) => u.id), on.createOnMain[0]?.data.role, on.createOnMain[0]?.data.status], [[tOnly.id], [tPend.id], "USER", "APPROVED"]);
  }

  /* ---- conflicts ---- */
  {
    const gm = user({ email: "john.doe@gmail.com" });
    const gt = user({ email: "johndoe+x@gmail.com" });
    const fine = user({ email: "fine@b.co", displayName: "Fine" });
    const plan = await planSync([gm, fine], [gt, user({ email: "fine@b.co", displayName: "Fine" })], { terminalOnlyToMain: true });
    eq("alias: gmail dots / +tags equate the two accounts, they are not the same string -> both skipped and listed, never merged, never created", [
      plan.conflicts.map((c) => [c.side, c.reason]).sort(), plan.createOnTerminal.length, plan.createOnMain.length, plan.terminalOnly.length, plan.matched.length,
    ], [[["main", "alias"], ["terminal", "alias"]], 0, 0, 0, 1]);
    const dup = await planSync([user({ email: "d@b.co" }), user({ email: " D@b.co" })], [user({ email: "d@b.co" })], { terminalOnlyToMain: false });
    eq("duplicate: an address twice in one database is ambiguous - all rows skipped, including the other side's", [dup.conflicts.length, dup.matched.length, dup.createOnTerminal.length], [3, 0, 0]);
    const aliasOnMain = await planSync([user({ email: "a.b@gmail.com" }), user({ email: "ab@gmail.com" })], [], { terminalOnlyToMain: false });
    eq("alias: two accounts on main that are aliases of each other are not copied to the terminal", [aliasOnMain.conflicts.length, aliasOnMain.createOnTerminal.length], [2, 0]);
  }

  /* ---- idempotency ---- */
  {
    const main = [
      user({ email: "A@b.co", passwordHash: bc("M"), displayName: "A", city: "C", locale: "en", socialLinks: { telegram: "@a", vk: "v" }, fomoId: "fomo_user7100001", birthDate: new Date("1990-05-17T00:00:00Z") }),
      user({ email: "b@b.co", passwordHash: bc("M"), displayName: "B", fomoId: "fomo_user7100002" }),
      user({ email: "new@b.co", passwordHash: bc("N"), displayName: "New", fomoId: "fomo_user7100003" }),
      user({ email: "pend@b.co", status: "PENDING" }),
    ];
    const term = [
      user({ email: "a@b.co", passwordHash: bc("T"), displayName: "Old", fomoId: "fomo_user7200001", sessionVersion: 1 }),
      user({ email: "b@b.co", passwordHash: bc("M"), displayName: "B", fomoId: "fomo_user7100002" }),
      user({ email: "only@b.co", fomoId: "fomo_user7200002" }),
    ];
    const p1 = await planSync(main, term, { terminalOnlyToMain: true });
    const changed1 = p1.matched.filter((x: MatchedItem) => x.groups.size > 0).length;
    applyPlan(p1, main, term, true);
    const p2 = await planSync(main, term, { terminalOnlyToMain: true });
    eq("first run: one matched account changes, one is identical, one is created on the terminal, the terminal-only one on main", [changed1, p1.createOnTerminal.length, p1.createOnMain.length], [1, 1, 1]);
    eq("idempotent: planning again after applying finds no change and nothing to create", [p2.matched.filter((x) => x.groups.size > 0).length, p2.createOnTerminal.length, p2.createOnMain.length, p2.conflicts.length], [0, 0, 0, 0]);
    eq("idempotent: the session was bumped exactly once, for the account whose hash changed", [term[0].sessionVersion, term[1].sessionVersion], [2, 0]);
    eq("idempotent: the terminal account now has the master hash, spelling and profile", [term[0].passwordHash === bc("M"), term[0].email, term[0].displayName, term[0].city, term[0].locale, term[0].fomoId], [true, "A@b.co", "A", "C", "en", "fomo_user7100001"]);
    // a JSON column returns its keys in another order: that is no change
    const reordered = await planSync([user({ email: "j@b.co", displayName: "J", socialLinks: { telegram: "@a", vk: "v" }, fomoId: "fomo_user7300001" })], [user({ email: "j@b.co", displayName: "J", socialLinks: { vk: "v", telegram: "@a" }, fomoId: "fomo_user7300001" })], { terminalOnlyToMain: false });
    eq("idempotent: the same social links in another key order are not a change", reordered.matched[0].groups.size, 0);
  }

  /* ---- output ---- */
  {
    const c = emptyCounts();
    c.mainUsers = 10; c.terminalUsers = 8; c.identical = 3; c.changed = 4; c.byGroup = { password: 3, profile: 2, avatar: 1, email: 1 } as Record<Group, number>; c.createdOnTerminal = 2; c.terminalOnly = 1; c.conflicts = 1; c.errors = 0;
    const dry = formatSummary(c, false, false);
    const done = formatSummary(c, true, true);
    eq("summary: every category is there; dry run says nothing was written", ["matched, identical", "password", "profile", "avatar", "e-mail", "to be created on the terminal", "only on the terminal", "alias / duplicate conflicts", "errors", "DRY RUN: nothing was written"].filter((w) => !dry.includes(w)), []);
    eq("summary: apply says so and shows the main-creation lines when the flag is on", [done.includes("APPLY"), done.includes("--terminal-only-to-main"), dry.includes("--terminal-only-to-main")], [true, true, false]);
    const line = userLine("changed", { main: "idA", term: "idB" }, "Anna.Smith@mail.com", "[password]");
    eq("per-user line: ids and a masked address only", [line.includes("A***@mail.com"), line.includes("Anna.Smith"), line.includes("main:idA term:idB")], [true, false, true]);
    eq("no hash-like text in the summary or the lines", /\$2[aby]\$/.test(dry + done + line), false);
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
