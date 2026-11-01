/* ONE-OFF reconciliation of the accounts of fomo.spot (main, the MASTER) and terminal.fomo.spot (terminal), directly in the two databases.
   Run on the server, from /opt/fomo:
     npx tsx scripts/sync-accounts.ts                          dry run (default): reads, plans, prints, writes NOTHING (no database rows, no files)
     npx tsx scripts/sync-accounts.ts --apply                  writes
     npx tsx scripts/sync-accounts.ts --apply --terminal-only-to-main    also creates the terminal-only accounts on main (default: off)
   Options: --main-env <file> (default /opt/fomo/.env), --terminal-env <file> (default /opt/fomo-terminal/.env), --force (skip the "this is a terminal .env" check).
   Rules (see docs/terminal-instance.md, "Разовая сверка баз", and src/lib/account-sync.ts):
     - accounts are matched by e-mail, trimmed and case-insensitively; alias spellings (gmail dots, +tags) and duplicated addresses are skipped and listed, never merged
     - on both sides: terminal := main for the password hash (sessionVersion + 1 only if the hash changed), the e-mail (main's spelling), every whitelisted profile field
       that HAS a value on main (empty never blanks), the fomoId (unless another terminal account holds it) and the avatar picture (copied, re-encoded like an upload)
     - role, status, ban, rating and payment fields of an existing account are never touched; nothing is ever deleted
     - only on main and APPROVED: created on the terminal (USER, APPROVED); only on the terminal: NOT created on main unless --terminal-only-to-main
   Safe to re-run: the second run reports no changes. Output: counts and one line per changed / created / conflicting account, with ids and a masked
   address only (never a hash, a password or a connection string). */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { MAX_AVATAR_BYTES, isMirrorAvatarPath } from "../src/lib/account-mirror";
import { reencodeAvatar } from "../src/lib/avatar-image";
import { SYNC_SELECT, describeChange, emptyCounts, formatSummary, parseArgs, parseEnvFile, planSync, userLine, type CreateItem, type Group, type SyncUser } from "../src/lib/account-sync";

type Db = PrismaClient;

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

function readEnv(file: string, what: string): Record<string, string> {
  if (!existsSync(file)) fail(`${what} env file not found: ${file}`);
  return parseEnvFile(readFileSync(file, "utf8"));
}

/** host:port/database of a connection string, for the "same database" check only (never printed). */
function dbIdentity(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`.toLowerCase();
  } catch {
    return url;
  }
}

/** What the executor needs to copy one avatar picture. */
type AvatarStep = { missing: true } | { missing: false; changed: false } | { missing: false; changed: true; url: string; write: () => Promise<void> };

const avatarCache = new Map<string, Promise<Awaited<ReturnType<typeof reencodeAvatar>> | null>>();
function loadAvatar(srcPublic: string, avatarPath: string) {
  const key = srcPublic + "|" + avatarPath;
  let p = avatarCache.get(key);
  if (!p) {
    p = (async () => {
      if (!isMirrorAvatarPath(avatarPath)) return null;
      const file = path.join(srcPublic, avatarPath);
      try {
        const st = await stat(file);
        if (!st.isFile() || st.size > MAX_AVATAR_BYTES) return null;
        return await reencodeAvatar(await readFile(file));
      } catch {
        return null;
      }
    })();
    avatarCache.set(key, p);
  }
  return p;
}

/** Reads the source picture (read only, also in the dry run), decides whether the target already has exactly that picture, prepares the write. */
async function avatarStep(srcPublic: string, dstPublic: string, dstUserId: string, avatarPath: string, currentUrl: string | null): Promise<AvatarStep> {
  const re = await loadAvatar(srcPublic, avatarPath);
  if (!re) return { missing: true };
  const url = `/uploads/avatars/${dstUserId}/${re.name}.jpg`;
  if (url === currentUrl) return { missing: false, changed: false };
  return {
    missing: false,
    changed: true,
    url,
    write: async () => {
      const dir = path.join(dstPublic, "uploads", "avatars", dstUserId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${re.name}.jpg`), re.buffer);
    },
  };
}

function errName(e: unknown): string {
  const code = (e as { code?: string })?.code;
  return `${e instanceof Error ? e.name : "error"}${code ? `(${code})` : ""}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unknown.length) fail(`unknown argument(s): ${args.unknown.join(" ")}\nusage: npx tsx scripts/sync-accounts.ts [--apply] [--terminal-only-to-main] [--main-env <file>] [--terminal-env <file>] [--force]`);

  const mainEnv = readEnv(args.mainEnv, "main");
  const termEnv = readEnv(args.terminalEnv, "terminal");
  const mainUrl = mainEnv.DATABASE_URL;
  const termUrl = termEnv.DATABASE_URL;
  if (!mainUrl || !termUrl) fail("DATABASE_URL is missing in one of the env files");
  if (dbIdentity(mainUrl) === dbIdentity(termUrl)) fail("both env files point to the SAME database, refusing to continue");
  const termMode = (termEnv.SITE_MODE || termEnv.NEXT_PUBLIC_SITE_MODE || "").toLowerCase();
  if (termMode !== "terminal" && !args.force) fail("the terminal env file has no SITE_MODE=terminal (wrong file?). Use --force only if you are sure");
  if (((mainEnv.SITE_MODE || mainEnv.NEXT_PUBLIC_SITE_MODE || "").toLowerCase()) === "terminal" && !args.force) fail("the main env file says SITE_MODE=terminal (arguments swapped?)");

  const mainPublic = path.join(path.dirname(path.resolve(args.mainEnv)), "public");
  const termPublic = path.join(path.dirname(path.resolve(args.terminalEnv)), "public");

  console.log(`fomo.spot main:  env ${args.mainEnv}, files ${mainPublic}`);
  console.log(`terminal:        env ${args.terminalEnv}, files ${termPublic}`);
  console.log(args.apply ? "mode: APPLY" : "mode: dry run (nothing will be written)");

  const mainDb: Db = new PrismaClient({ datasourceUrl: mainUrl });
  const termDb: Db = new PrismaClient({ datasourceUrl: termUrl });
  const counts = emptyCounts();
  try {
    const mainUsers = (await mainDb.user.findMany({ select: SYNC_SELECT })) as unknown as SyncUser[];
    const termUsers = (await termDb.user.findMany({ select: SYNC_SELECT })) as unknown as SyncUser[];
    counts.mainUsers = mainUsers.length;
    counts.terminalUsers = termUsers.length;

    const plan = await planSync(mainUsers, termUsers, { terminalOnlyToMain: args.terminalOnlyToMain });
    counts.conflicts = plan.conflicts.length;
    counts.mainOnlySkipped = plan.mainOnlySkipped.length;
    counts.terminalOnly = plan.terminalOnly.length;
    counts.terminalOnlySkipped = plan.terminalOnlySkipped.length;

    const lines: string[] = [];
    for (const c of plan.conflicts) lines.push(userLine(`conflict-${c.reason}`, { [c.side === "main" ? "main" : "term"]: c.user.id }, c.user.email, "(skipped, not merged)"));

    // ---- accounts on both sides: terminal := main ----
    for (const item of plan.matched) {
      try {
        const data: Record<string, unknown> = { ...item.data };
        const groups = new Set<Group>(item.groups);
        if (item.fomoIdKept) counts.fomoIdKept++;
        let write: (() => Promise<void>) | null = null;
        if (item.avatarFrom) {
          const a = await avatarStep(mainPublic, termPublic, item.term.id, item.avatarFrom, item.term.avatarUrl);
          if (a.missing) counts.avatarMissing++;
          else if (a.changed) {
            data.avatarUrl = a.url;
            groups.add("avatar");
            write = a.write;
          }
        }
        if (groups.size === 0) {
          counts.identical++;
          continue;
        }
        if (args.apply) {
          await write?.();
          await termDb.user.update({ where: { id: item.term.id }, data: { ...data, ...(item.bumpSession ? { sessionVersion: { increment: 1 } } : {}) } as never });
        }
        counts.changed++;
        for (const g of groups) counts.byGroup[g]++;
        lines.push(userLine("changed", { main: item.main.id, term: item.term.id }, item.main.email, `[${describeChange(groups, item.profileFields)}]${item.fomoIdKept ? " fomoId kept" : ""}`));
      } catch (e) {
        counts.errors++;
        lines.push(userLine("ERROR", { main: item.main.id, term: item.term.id }, item.main.email, errName(e)));
      }
    }

    // ---- create (a copy of the source account in the other database) ----
    const create = async (item: CreateItem, db: Db, srcPublic: string, dstPublic: string, kind: string, onDone: () => void) => {
      try {
        // the id is chosen here (cuid-shaped) so that the avatar folder and the row are one single create
        const id = "c" + randomBytes(12).toString("hex");
        const data: Record<string, unknown> = { ...item.data, id };
        let write: (() => Promise<void>) | null = null;
        if (item.avatarFrom) {
          const a = await avatarStep(srcPublic, dstPublic, id, item.avatarFrom, null);
          if (a.missing) counts.avatarMissing++;
          else if (a.changed) {
            data.avatarUrl = a.url;
            write = a.write;
          }
        }
        if (args.apply) {
          await write?.();
          await db.user.create({ data: data as never, select: { id: true } });
        }
        onDone();
        lines.push(userLine(kind, { from: item.from.id }, item.from.email, item.fomoIdChanged ? "fomoId changed (taken)" : ""));
      } catch (e) {
        counts.errors++;
        lines.push(userLine("ERROR", { from: item.from.id }, item.from.email, errName(e)));
      }
    };
    for (const item of plan.createOnTerminal) await create(item, termDb, mainPublic, termPublic, "create-on-terminal", () => counts.createdOnTerminal++);
    for (const item of plan.createOnMain) await create(item, mainDb, termPublic, mainPublic, "create-on-main", () => counts.createdOnMain++);

    for (const l of lines) console.log(l);
    if (lines.length) console.log("");
    console.log(formatSummary(counts, args.apply, args.terminalOnlyToMain));
    if (!args.apply) console.log("\nNothing was written. Review the numbers, then run again with --apply.");
    else console.log("\nDone. Run the script again: it should now report no changes.");
  } finally {
    await mainDb.$disconnect().catch(() => {});
    await termDb.$disconnect().catch(() => {});
  }
  process.exit(counts.errors > 0 ? 1 : 0);
}

main().catch((e) => {
  // never print the error text: a connection error can carry the connection string
  console.error(`FAILED: ${errName(e)}`);
  process.exit(1);
});
