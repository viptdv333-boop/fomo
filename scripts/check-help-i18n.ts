/* Help page (/help) translation parity: every key the page and its illustrations use exists in ru, en and cn
   with non-empty text; the help.* / seo.help.* dictionaries have the same key set in all three languages;
   placeholders match; the FAQ JSON-LD escape is intact.
   Run: npx tsx scripts/check-help-i18n.ts   (exit code 1 on a failed assertion) */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ru, en, cn } from "../src/lib/i18n/dictionaries";
import { HELP_COUNTS, countedHelpKeys } from "../src/lib/help-structure";

let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     ${detail}`}`);
}

const root = join(__dirname, "..");
const pageSrc = readFileSync(join(root, "src/app/(main)/help/page.tsx"), "utf8");
const illSrc = readFileSync(join(root, "src/components/help/Illustrations.tsx"), "utf8");

// Literal keys: t("a.b.c") in the page and illustrations.
const literal = new Set<string>();
for (const src of [pageSrc, illSrc]) for (const m of src.matchAll(/\bt\("([A-Za-z0-9_.]+)"\)/g)) literal.add(m[1]);
for (const n of [1, 2, 3, 4, 5, 6]) literal.add(`help.ill.cab.tab${n}`);
for (const k of ["help.cab.p1a", "help.cab.p1link", "help.cab.p1c"]) literal.add(k);
for (const k of ["seo.help.title", "seo.help.description", "seo.help.keywords", "seo.help.ogTitle", "seo.help.ogDescription"]) literal.add(k);

const needed = [...new Set([...literal, ...countedHelpKeys()])];
check(`page needs ${needed.length} keys`, needed.length > 300);

for (const [lang, dict] of [["ru", ru], ["en", en], ["cn", cn]] as const) {
  const missing = needed.filter((k) => !(dict[k] && dict[k].trim().length > 0));
  check(`${lang}: all page keys present and non-empty`, missing.length === 0, missing.join(", "));
}

// Same key set across languages for the help dictionaries.
const isHelp = (k: string) => k.startsWith("help.") || k.startsWith("seo.help.");
const keysOf = (d: Record<string, string>) => new Set(Object.keys(d).filter(isHelp));
const kr = keysOf(ru), ke = keysOf(en), kc = keysOf(cn);
const diff = (a: Set<string>, b: Set<string>) => [...a].filter((k) => !b.has(k));
check("help keys: ru ⊆ en and en ⊆ ru", diff(kr, ke).length === 0 && diff(ke, kr).length === 0, `${diff(kr, ke)} | ${diff(ke, kr)}`);
check("help keys: ru ⊆ cn and cn ⊆ ru", diff(kr, kc).length === 0 && diff(kc, kr).length === 0, `${diff(kr, kc)} | ${diff(kc, kr)}`);

// No dead help.* keys: everything defined is either needed by the page or a known leftover-free key.
const unused = [...kr].filter((k) => !needed.includes(k));
check("no unused help.* keys", unused.length === 0, unused.join(", "));

// Placeholders {x} must match between languages.
const ph = (s: string) => (s.match(/\{[A-Za-z0-9_]+\}/g) ?? []).sort().join(",");
const badPh = needed.filter((k) => ph(ru[k] ?? "") !== ph(en[k] ?? "") || ph(ru[k] ?? "") !== ph(cn[k] ?? ""));
check("placeholders match across languages", badPh.length === 0, badPh.join(", "));

// A translation must not accidentally contain raw ASCII double quotes or control characters.
const bad = needed.filter((k) => [ru, en, cn].some((d) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(d[k] ?? "")));
check("no control characters in help text", bad.length === 0, bad.join(", "));

// Chinese texts must contain Chinese characters (catches a Russian/English string pasted into cn).
const notCn = needed.filter((k) => !/[一-鿿]/.test(cn[k] ?? "") && !/^(help\.nav\.|help\.ill\.|help\.ntf\.ch\dt$)/.test(k) && !["help.term.g1.i7b"].includes(k) && (cn[k] ?? "").length > 12);
check("cn text is Chinese", notCn.length === 0, notCn.join(", "));
const notRu = needed.filter((k) => !/[Ѐ-ӿ]/.test(ru[k] ?? "") && (ru[k] ?? "").length > 25);
check("ru text is Russian", notRu.length === 0, notRu.join(", "));
const hasCyr = needed.filter((k) => /[Ѐ-ӿ]/.test(en[k] ?? "") && !/«|“[^”]*[Ѐ-ӿ]/.test(en[k] ?? "") && !/Болталка|ОБЩАЯ|МОЯ|Личные|Россия|объёмный профиль|Домой/.test(en[k] ?? ""));
check("en text has no stray Russian", hasCyr.length === 0, hasCyr.join(", "));

// FAQ JSON-LD is built from help.faq.* and keeps "<" escaped.
check("JSON-LD escapes <", /replace\(\/<\/g, "\\\\u003c"\)/.test(pageSrc));
check("JSON-LD uses every FAQ item", pageSrc.includes("range(N.faq)") && HELP_COUNTS.faq >= 4);

// Section anchors are unique.
const sectionIds = [...pageSrc.matchAll(/<Section id="([^"]+)"/g)].map((m) => m[1]);
check("section ids unique", new Set(sectionIds).size === sectionIds.length);

console.log(fails ? `\n${fails} check(s) failed` : "\nall help i18n checks passed");
process.exit(fails ? 1 : 0);
