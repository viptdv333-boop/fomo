/* ONE-OFF (and repeatable) reconciliation of the terminal data of every account that exists on BOTH sites: settings, indicators, drawings, templates ...
   (the kinds of src/lib/userdata-sync.ts) of fomo.spot (main) and terminal.fomo.spot (terminal), directly in the two databases. The live copy
   (account mirror, op "userdata") keeps new edits in step; this script brings the data that is ALREADY there to one state and repairs what a
   restart of one site may have dropped. Run on the server, from /opt/fomo:
     npx tsx scripts/sync-userdata.ts            dry run (default): reads, plans, prints, writes NOTHING
     npx tsx scripts/sync-userdata.ts --apply    writes
   Options: --main-env <file> (default /opt/fomo/.env), --terminal-env <file> (default /opt/fomo-terminal/.env), --force (skip the "this is a terminal .env" check).
   Rules: accounts are matched by e-mail (trimmed, case-insensitive); a row that exists on one side only is copied to the other; a row on both sides keeps the
   NEWER copy (updatedAt) on both; the same instant is stored on both sides, so the second run reports no changes; equal instants with different data are
   listed and left alone. Nothing is ever deleted. A row that would exceed the per-kind byte cap is skipped; drawings are copied only while the target holds
   fewer than 200 symbols (no eviction here). Output: counts and one line per changed account with ids only (never an address, a connection string or data). */
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseEnvFile } from "../src/lib/account-sync";
import { MIRRORED_KINDS, newerSide } from "../src/lib/userdata-sync";
import { EVICT_KINDS, KIND_MAX_BYTES, MAX_BYTES, MAX_PER_KIND } from "../src/lib/userdata-store";

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}
function arg(name: string, def: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

function readEnv(file: string, what: string): Record<string, string> {
  if (!existsSync(file)) fail(`${what} env file not found: ${file}`);
  return parseEnvFile(readFileSync(file, "utf8"));
}

type Row = { kind: string; key: string; data: unknown; updatedAt: Date; createdAt: Date };
const canon = (v: unknown) => JSON.stringify(v);
const rowKey = (r: { kind: string; key: string }) => `${r.kind}\u0000${r.key}`;

async function main() {
  const mainEnv = readEnv(arg("--main-env", "/opt/fomo/.env"), "main");
  const termEnv = readEnv(arg("--terminal-env", "/opt/fomo-terminal/.env"), "terminal");
  if (!FORCE && (termEnv.SITE_MODE ?? "").toLowerCase() !== "terminal") fail("the terminal .env has no SITE_MODE=terminal (arguments swapped? --force skips this check)");
  if (!FORCE && (mainEnv.SITE_MODE ?? "").toLowerCase() === "terminal") fail("the main .env has SITE_MODE=terminal (arguments swapped?)");
  if (!mainEnv.DATABASE_URL || !termEnv.DATABASE_URL) fail("DATABASE_URL missing in an .env");
  if (mainEnv.DATABASE_URL === termEnv.DATABASE_URL) fail("both .env files point to the same database");

  const main = new PrismaClient({ datasourceUrl: mainEnv.DATABASE_URL });
  const term = new PrismaClient({ datasourceUrl: termEnv.DATABASE_URL });
  try {
    const mUsers = await main.user.findMany({ select: { id: true, email: true } });
    const tUsers = await term.user.findMany({ select: { id: true, email: true } });
    const norm = (e: string) => e.trim().toLowerCase();
    const mBy = new Map<string, string>();
    const dup = new Set<string>();
    for (const u of mUsers) (mBy.has(norm(u.email)) ? dup.add(norm(u.email)) : mBy.set(norm(u.email), u.id));
    const tBy = new Map<string, string>();
    for (const u of tUsers) (tBy.has(norm(u.email)) ? dup.add(norm(u.email)) : tBy.set(norm(u.email), u.id));
    const pairs = [...mBy.entries()].filter(([e]) => tBy.has(e) && !dup.has(e)).map(([e, mid]) => ({ mid, tid: tBy.get(e) as string }));
    console.log(`accounts on both sites: ${pairs.length} (main ${mUsers.length}, terminal ${tUsers.length}); duplicated addresses skipped: ${dup.size}`);

    const stats = { toTerminal: 0, toMain: 0, newerMain: 0, newerTerminal: 0, same: 0, conflicts: 0, skippedSize: 0, skippedLimit: 0, accountsChanged: 0, errors: 0, lists: 0 };
    for (const { mid, tid } of pairs) {
      const sel = { kind: true, key: true, data: true, updatedAt: true, createdAt: true } as const;
      const mRows = (await main.terminalUserData.findMany({ where: { userId: mid, kind: { in: [...MIRRORED_KINDS] } }, select: sel })) as Row[];
      const tRows = (await term.terminalUserData.findMany({ where: { userId: tid, kind: { in: [...MIRRORED_KINDS] } }, select: sel })) as Row[];
      const mMap = new Map(mRows.map((r) => [rowKey(r), r]));
      const tMap = new Map(tRows.map((r) => [rowKey(r), r]));
      const counts = { main: new Map<string, number>(), term: new Map<string, number>() };
      for (const r of mRows) counts.main.set(r.kind, (counts.main.get(r.kind) ?? 0) + 1);
      for (const r of tRows) counts.term.set(r.kind, (counts.term.get(r.kind) ?? 0) + 1);
      let changed = 0;

      // the MAIN watchlist (table TerminalWatchItem): the whole list; its instant is the newest createdAt of its rows; the newer list is copied to the other side
      // (an empty side has no instant: it only receives, a list is never emptied here)
      {
        const wsel = { source: true, ticker: true, dataTicker: true, name: true, sortOrder: true, createdAt: true } as const;
        const mL = await main.terminalWatchItem.findMany({ where: { userId: mid }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: wsel });
        const tL = await term.terminalWatchItem.findMany({ where: { userId: tid }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: wsel });
        const at = (l: typeof mL) => (l.length ? Math.max(...l.map((r) => r.createdAt.getTime())) : null);
        const sig = (l: typeof mL) => l.map((r) => `${r.source}:${r.dataTicker}`).join(",");
        const side = newerSide(at(mL), at(tL));
        const copy = async (db: PrismaClient, userId: string, from: typeof mL, st: "toTerminal" | "toMain") => {
          if (APPLY) {
            const when = new Date(Math.max(...from.map((r) => r.createdAt.getTime())));
            await db.$transaction([
              db.terminalWatchItem.deleteMany({ where: { userId } }),
              db.terminalWatchItem.createMany({ data: from.map((r, idx) => ({ userId, source: r.source, ticker: r.ticker, dataTicker: r.dataTicker, name: r.name, sortOrder: idx, createdAt: when })) }),
            ]);
          }
          stats.lists++;
          void st;
          changed++;
        };
        try {
          if (side === "a" && (sig(mL) !== sig(tL) || at(mL) !== at(tL))) await copy(term, tid, mL, "toTerminal");
          else if (side === "b" && (sig(mL) !== sig(tL) || at(mL) !== at(tL))) await copy(main, mid, tL, "toMain");
        } catch {
          stats.errors++;
        }
      }

      const write = async (db: PrismaClient, userId: string, src: Row, side: "main" | "term") => {
        const bytes = canon(src.data).length;
        if (bytes > (KIND_MAX_BYTES[src.kind] ?? MAX_BYTES)) { stats.skippedSize++; return; }
        const have = counts[side].get(src.kind) ?? 0;
        const target = side === "main" ? mMap : tMap;
        const isNew = !target.has(rowKey(src));
        if (isNew && (have >= (EVICT_KINDS[src.kind] ?? MAX_PER_KIND))) { stats.skippedLimit++; return; }
        if (APPLY) {
          try {
            await db.terminalUserData.upsert({
              where: { userId_kind_key: { userId, kind: src.kind, key: src.key } },
              create: { userId, kind: src.kind, key: src.key, data: src.data as object, createdAt: src.createdAt, updatedAt: src.updatedAt },
              update: { data: src.data as object, updatedAt: src.updatedAt },
            });
          } catch {
            stats.errors++;
            return;
          }
        }
        if (isNew) counts[side].set(src.kind, have + 1);
        changed++;
      };

      const keys = new Set([...mMap.keys(), ...tMap.keys()]);
      for (const k of keys) {
        const m = mMap.get(k);
        const t = tMap.get(k);
        if (m && !t) { await write(term, tid, m, "term"); stats.toTerminal++; continue; }
        if (t && !m) { await write(main, mid, t, "main"); stats.toMain++; continue; }
        if (!m || !t) continue;
        const side = newerSide(m.updatedAt.getTime(), t.updatedAt.getTime());
        if (side === "same") {
          if (canon(m.data) !== canon(t.data)) stats.conflicts++;
          else stats.same++;
        } else if (side === "a") {
          await write(term, tid, m, "term");
          stats.newerMain++;
        } else {
          await write(main, mid, t, "main");
          stats.newerTerminal++;
        }
      }
      if (changed) {
        stats.accountsChanged++;
        console.log(`  ${APPLY ? "synced" : "would sync"} main:${mid} <-> terminal:${tid} (${changed} rows)`);
      }
    }
    console.log(`\n${APPLY ? "APPLIED" : "DRY RUN (nothing written)"}:`);
    console.log(`  rows copied main -> terminal (missing there): ${stats.toTerminal}`);
    console.log(`  rows copied terminal -> main (missing there): ${stats.toMain}`);
    console.log(`  both sides, main newer -> terminal updated:   ${stats.newerMain}`);
    console.log(`  both sides, terminal newer -> main updated:   ${stats.newerTerminal}`);
    console.log(`  identical already: ${stats.same}; same instant but different data (left alone): ${stats.conflicts}`);
    console.log(`  skipped (over the size cap): ${stats.skippedSize}; skipped (drawings limit of the target): ${stats.skippedLimit}; errors: ${stats.errors}`);
    console.log(`  main watchlists copied (the newer list wins): ${stats.lists}`);
    console.log(`  accounts touched: ${stats.accountsChanged}`);
    process.exit(stats.errors ? 1 : 0);
  } finally {
    await main.$disconnect().catch(() => undefined);
    await term.$disconnect().catch(() => undefined);
  }
}

main().catch((e) => fail(e instanceof Error ? e.name : "failed"));
