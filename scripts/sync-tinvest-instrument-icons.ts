/**
 * Download official T-Invest instrument logos and generate a ticker lookup.
 * Run on a server with TINKOFF_TOKEN and the configured Russian-root CA:
 *   npx tsx scripts/sync-tinvest-instrument-icons.ts
 *
 * Options inherit the logo of their underlying asset in the UI; T-Invest's
 * OptionsBy endpoint is scoped to one underlying and has no global logo list.
 */
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { ruCaFetch } from "../src/lib/algopack-tls";
import sharp from "sharp";

const ROOT = process.cwd();
const API = "https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1.InstrumentsService";
const CDN = "https://invest-brands.cdn-tinkoff.ru";
const OUTPUT = join(ROOT, "public/icons/instruments/tinvest");
const MANIFEST = join(ROOT, "src/lib/tinvest-icons.generated.json");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Kind = "stock" | "bond" | "fund" | "future" | "currency";
type ApiInstrument = { ticker?: string; isin?: string; uid?: string; figi?: string; classCode?: string; brand?: { logoName?: string; logoBaseColor?: string; textColor?: string } };
const METHODS: Array<{ method: string; kind: Kind }> = [
  { method: "Shares", kind: "stock" },
  { method: "Futures", kind: "future" },
  { method: "Etfs", kind: "fund" },
  { method: "Bonds", kind: "bond" },
  { method: "Currencies", kind: "currency" },
];

function loadEnv(path: string): void {
  let text = "";
  try { text = readFileSync(path, "utf8"); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function safeLogoName(name: string): string | null {
  const base = name.replace(/\.png$/i, "");
  return /^[A-Za-z0-9_-]{1,100}$/.test(base) ? base : null;
}

async function main(): Promise<void> {
  if (process.argv[2]) loadEnv(process.argv[2]);
  else loadEnv(join(ROOT, ".env"));
  const token = (process.env.TINKOFF_READONLY_TOKEN || process.env.TINKOFF_TOKEN || "").trim();
  if (!token) throw new Error("TINKOFF_TOKEN is not configured");

  const aliases: Record<string, string> = {};
  const logos = new Map<string, { file: string; baseColor?: string; textColor?: string }>();
  const totals: Record<string, { instruments: number; mapped: number }> = {};

  for (const { method, kind } of METHODS) {
    await sleep(350);
    const response = await ruCaFetch(`${API}/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ instrumentStatus: "INSTRUMENT_STATUS_BASE" }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`);
    const payload = await response.json() as { instruments?: ApiInstrument[] };
    const instruments = Array.isArray(payload.instruments) ? payload.instruments : [];
    const row = totals[kind] = { instruments: instruments.length, mapped: 0 };
    for (const inst of instruments) {
      const logoName = safeLogoName(inst.brand?.logoName || "");
      const ticker = (inst.ticker || "").trim().toUpperCase();
      if (!logoName || !ticker) continue;
      const file = `/icons/instruments/tinvest/${logoName}x160.webp`;
      logos.set(logoName, { file, baseColor: inst.brand?.logoBaseColor, textColor: inst.brand?.textColor });
      // The class-specific key avoids a collision where an exchange reuses a ticker.
      for (const key of [
        `${kind}:${ticker}`,
      ]) aliases[key] = file;
      if (inst.isin) aliases[`isin:${inst.isin.toUpperCase()}`] = file;
      row.mapped++;
    }
  }

  mkdirSync(OUTPUT, { recursive: true });
  let downloaded = 0;
  let failed = 0;
  const availablePaths = new Set<string>();
  const entries = [...logos.entries()];
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < entries.length) {
      const [logoName, meta] = entries[cursor++];
      const dest = join(OUTPUT, `${logoName}x160.webp`);
      try {
        const res = await fetch(`${CDN}/${logoName}x160.png`, { redirect: "error" });
        const mime = res.headers.get("content-type") || "";
        if (!res.ok || !mime.toLowerCase().includes("image/")) { failed++; continue; }
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length < 100 || bytes.length > 2_000_000) { failed++; continue; }
        writeFileSync(dest, await sharp(bytes).resize(64, 64, { fit: "contain" }).webp({ quality: 84 }).toBuffer());
        // The source PNG is only a download buffer; keep the optimized webp in the site bundle.
        try { unlinkSync(join(OUTPUT, `${logoName}x160.png`)); } catch { /* first run */ }
        availablePaths.add(meta.file);
        downloaded++;
      } catch { failed++; }
    }
  });
  await Promise.all(workers);

  const availableAliases = Object.fromEntries(Object.entries(aliases).filter(([, path]) => availablePaths.has(path)));
  const output = { version: 1, generatedAt: new Date().toISOString(), aliases: availableAliases, totals, downloaded, failed };
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify(output)}\n`);
  console.log(JSON.stringify({ totals, uniqueLogos: logos.size, downloaded, failed, aliases: Object.keys(availableAliases).length, manifest: MANIFEST }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "icon sync failed");
  process.exitCode = 1;
});
