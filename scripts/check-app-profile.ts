/* The Профиль tab of the app UI (src/components/app/profile): every dictionary key its screens use exists in ru, en and cn,
   and the screens keep the old profile's requests (nothing of the old tabs is dropped).
   Run: npx tsx scripts/check-app-profile.ts   (exit code 1 on a failed assertion) */
import fs from "node:fs";
import path from "node:path";
import { DICTIONARIES } from "../src/lib/i18n/dictionaries";

let fails = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (!cond) fails++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : ` ${extra}`}`);
}

const dir = path.join(__dirname, "..", "src", "components", "app", "profile");
const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
const extra = [
  path.join(__dirname, "..", "src", "components", "shared", "DownloadApps.tsx"),
];

// 1) dictionary keys: t("key") / t(`key`) with a literal key
const keys = new Set<string>();
for (const f of [...files.map((x) => path.join(dir, x)), ...extra]) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*["']([a-zA-Z0-9_.]+)["']/g)) keys.add(m[1]);
}
const missing: string[] = [];
for (const k of keys) for (const loc of ["ru", "en", "cn"]) if (!DICTIONARIES[loc][k]) missing.push(`${loc}:${k}`);
ok(`all ${keys.size} dictionary keys exist in ru / en / cn`, missing.length === 0, missing.join(", "));

// the dynamic keys the screens build (ns.status.<status>, ns.ch.<channel>, ns.group.<group>, alerts.exp.<n>d ...)
const dyn = ["connected", "not_connected", "pending", "paused", "not_configured"].map((s) => `ns.status.${s}`)
  .concat(["inapp", "webpush", "email", "telegram", "whatsapp", "max", "vk", "webhook"].flatMap((c) => [`ns.ch.${c}`, `ns.ch.${c}.d`]))
  .concat(["mine", "talk", "subs", "money", "terminal"].map((g) => `ns.group.${g}`))
  .concat(["alerts.exp.none", "alerts.exp.1d", "alerts.exp.7d", "alerts.exp.30d", "calrem.lead.0", "calrem.lead.60", "calrem.lead.n", "alerts.cd.hour", "alerts.cd.min"]);
const missingDyn = dyn.filter((k) => ["ru", "en", "cn"].some((loc) => !DICTIONARIES[loc][k]));
ok("dynamic keys exist in ru / en / cn", missingDyn.length === 0, missingDyn.join(", "));

// 2) nothing of the old profile is dropped: every request of the old tabs is still made by some screen
const all = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
const mustHave: [string, RegExp][] = [
  ["profile: load + save", /\/api\/users\/\$\{uid\}`[\s\S]*method: "PATCH"/],
  ["profile: avatar upload (type avatars)", /"type", "avatars"/],
  ["profile: SBP QR upload", /"payment-qr"/],
  ["profile: education add / delete", /\/education/],
  ["profile: web push of this device", /subscribeToPush/],
  ["profile: watchlist", /WatchlistWidget/],
  ["profile: share links", /ShareButtons/],
  ["ideas: paged list, archive, delete, delete all", /limit=100[\s\S]*moderationStatus[\s\S]*method: "DELETE"/],
  ["rooms: list, create, invite link, delete, leave", /\/api\/rooms[\s\S]*inviteGroup[\s\S]*deleteGroup[\s\S]*leaveGroup/],
  ["security: change password", /\/api\/auth\/change-password/],
  ["security: change e-mail in two steps", /send-code[\s\S]*action: "verify"/],
  ["finance: payments, receipts, confirm / reject", /\/finances[\s\S]*\/api\/payments\/[\s\S]*action/],
  ["finance: payment methods incl. the link method", /\/api\/payment-methods[\s\S]*normalizeLinkDetails/],
  ["finance: unsubscribe", /\/api\/subscriptions", \{ method: "DELETE"/],
  ["subscriptions: my channels, followers, telegram forwarding", /\/followers[\s\S]*\/telegram/],
  ["notifications: the old settings state machine", /useNotifSettings/],
  ["notifications: channel cards incl. the Telegram own bot", /ChannelCards[\s\S]*LegacyTelegramBlock/],
  ["notifications: terminal alert defaults", /saveTerminalNotifyDefaults/],
  ["app: native settings, update, text size, theme, language", /^(?=[\s\S]*openNativeSettings)(?=[\s\S]*forceUpdate)(?=[\s\S]*applyFontStep)(?=[\s\S]*toggleTheme)(?=[\s\S]*switchLocale)/],
  ["home: logout, admin, downloads", /signOut[\s\S]*\/admin[\s\S]*DownloadAppsRow/],
];
for (const [name, re] of mustHave) ok(`kept: ${name}`, re.test(all));

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
