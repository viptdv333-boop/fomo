/* Primes (or refreshes) the corporate-events cache of the economic calendar: dividends, bond coupons and reporting dates of Russian
   issuers from the T-Invest API, written to the table "CorporateEvent" (src/lib/calendar/corporate.ts). The site refreshes the same
   data lazily in the background every 6 hours; this script is for the first fill after the migration, or a manual refresh.

   On the server (where TINKOFF_TOKEN / DATABASE_URL live):
     cd /opt/fomo && NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npx tsx scripts/refresh-corp-events.ts --env /opt/fomo/.env
   Options: --shares 150   --bonds 100 (corporate bonds; all OFZ are always included)   --gap 700 (ms between calls)   --dry (no database: counts only)
   Needs the table first:  npx prisma db execute --file prisma/migrations/20261004193000_corporate_events/migration.sql --schema prisma/schema.prisma
   A read-only T-Invest token is enough (TINKOFF_READONLY_TOKEN is preferred over TINKOFF_TOKEN). The token is never printed.
   Takes ~5 minutes (about 460 API calls at <= 85 per minute; the Instruments service allows 200). Exit code 0 = at least one call succeeded. */
import { readFileSync } from "node:fs";
import { corpToken, createMemStore, createPrismaStore, refreshCorporate } from "../src/lib/calendar/corporate";

const args = process.argv.slice(2);
const arg = (name: string, def = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const envFile = arg("env");
if (envFile) {
  try {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(TINKOFF_READONLY_TOKEN|TINKOFF_TOKEN|DATABASE_URL)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    console.log(`cannot read ${envFile}`);
    process.exit(2);
  }
}

async function main() {
  const token = corpToken();
  if (!token) {
    console.log("TINKOFF_READONLY_TOKEN / TINKOFF_TOKEN is not set: nothing to do (no network call was made).");
    process.exit(2);
  }
  const dry = args.includes("--dry");
  const store = dry ? createMemStore() : createPrismaStore();
  console.log(`corporate events refresh  ${new Date().toISOString()}  (token present, not shown; ${dry ? "dry run, no database" : "writing to the database"})`);
  const rep = await refreshCorporate({
    token,
    fetchImpl: fetch,
    store,
    sharesLimit: +arg("shares", "150") || 150,
    corpBondsLimit: +arg("bonds", "100") || 100,
    gapMs: +arg("gap", "700") || 700,
    log: (l) => console.log("  " + l),
  });
  console.log("\nresult:", JSON.stringify(rep));
  if (rep.reason === "unauthorized") console.log("401 / 403: the token is invalid or has no access to InstrumentsService.");
  if (!dry && rep.ok) {
    const { rows } = await store.load();
    const by: Record<string, number> = {};
    for (const r of rows) by[r.kind] = (by[r.kind] ?? 0) + 1;
    console.log("rows in the table:", JSON.stringify(by));
  }
  process.exit(rep.ok ? 0 : 1);
}

main().catch((e) => {
  // never print anything that could carry the token
  console.log(`FAIL  refresh crashed: ${(e as Error)?.name ?? "error"}${(e as { code?: string })?.code ? " " + (e as { code?: string }).code : ""}`);
  process.exit(1);
});
