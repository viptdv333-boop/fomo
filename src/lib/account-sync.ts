// One-off reconciliation of the two databases (scripts/sync-accounts.ts, docs/terminal-instance.md, "Разовая сверка баз"): fomo.spot (main) is the
// MASTER, the terminal follows it. This file is the pure part (no Prisma, no files, no network) so that scripts/check-sync-accounts.ts can test it:
//   - e-mail matching (case-insensitive, trimmed), masking for the output, .env parsing, command line
//   - the PLAN: which terminal accounts are updated (and in which groups: password / profile / avatar / email), which are created, which are only
//     on one side, which are skipped as alias or duplicate conflicts
// The plan never contains a role, a status, a ban, a rating or a payment field of an EXISTING account. Everything is derived from the same
// whitelist and the same "main wins, empty never blanks" rule as the live mirror (src/lib/account-mirror.ts).
import { normalizeEmail } from "./account-security";
import { generateFomoId } from "./fomoId";
import { PROFILE_FIELDS, altFomoId, mainWinsProfile, profileFromUser, profileToPrismaData, stableJson, type MirrorProfile } from "./account-mirror";

export type SyncUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  sessionVersion: number;
  displayName: string;
  fomoId: string | null;
  avatarUrl: string | null;
  [k: string]: unknown;
};

export type Group = "password" | "profile" | "avatar" | "email";

/** The columns the script reads of both databases (nothing else is ever selected). */
export const SYNC_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  role: true,
  status: true,
  sessionVersion: true,
  displayName: true,
  fomoId: true,
  bio: true,
  avatarUrl: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  city: true,
  workplace: true,
  exchangeExperience: true,
  specializations: true,
  socialLinks: true,
  locale: true,
  dmEnabled: true,
} as const;

// ---------------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------------

/** The key two accounts are matched by: trimmed and lower-cased. */
export function emailKey(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

/** First letter + *** + @domain: all the output ever shows of an address. */
export function maskEmail(email: string): string {
  const e = String(email ?? "").trim();
  const at = e.lastIndexOf("@");
  if (at < 1) return "***";
  return `${e[0]}***${e.slice(at)}`;
}

/** KEY=value lines of an .env file (comments, `export`, one pair of quotes, CRLF). Never throws; values are never printed by the script. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

export interface SyncArgs {
  apply: boolean;
  terminalOnlyToMain: boolean;
  mainEnv: string;
  terminalEnv: string;
  force: boolean;
  unknown: string[];
}

export function parseArgs(argv: string[]): SyncArgs {
  const a: SyncArgs = { apply: false, terminalOnlyToMain: false, mainEnv: "/opt/fomo/.env", terminalEnv: "/opt/fomo-terminal/.env", force: false, unknown: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--apply") a.apply = true;
    else if (x === "--terminal-only-to-main") a.terminalOnlyToMain = true;
    else if (x === "--force") a.force = true;
    else if (x === "--main-env" && argv[i + 1]) a.mainEnv = argv[++i];
    else if (x === "--terminal-env" && argv[i + 1]) a.terminalEnv = argv[++i];
    else a.unknown.push(x);
  }
  return a;
}

function groupBy(users: SyncUser[], keyOf: (u: SyncUser) => string): Map<string, SyncUser[]> {
  const m = new Map<string, SyncUser[]>();
  for (const u of users) {
    const k = keyOf(u);
    const list = m.get(k);
    if (list) list.push(u);
    else m.set(k, [u]);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------------------------------

export interface MatchedItem {
  main: SyncUser;
  term: SyncUser;
  /** Prisma update data for the terminal account (never a role, status, ban, rating or payment field); avatarUrl is added by the executor */
  data: Record<string, unknown>;
  /** the password hash changes: the executor adds sessionVersion + 1 */
  bumpSession: boolean;
  groups: Set<Group>;
  /** names (never values) of the whitelisted profile fields that differ and are written, in whitelist order; fomoId included when it changes */
  profileFields: string[];
  /** the main avatar path, if main has one (the executor compares the picture with the terminal's) */
  avatarFrom: string | null;
  /** main's fomoId is taken by another terminal account: the local one stays */
  fomoIdKept: boolean;
}

export interface CreateItem {
  /** the account the new one is a copy of */
  from: SyncUser;
  /** Prisma create data (without id and avatarUrl: the executor adds them) */
  data: Record<string, unknown>;
  avatarFrom: string | null;
  fomoIdChanged: boolean;
}

export type Conflict = { side: "main" | "terminal"; user: SyncUser; reason: "alias" | "duplicate" };

export interface SyncPlan {
  matched: MatchedItem[];
  createOnTerminal: CreateItem[];
  mainOnlySkipped: SyncUser[];
  terminalOnly: SyncUser[];
  createOnMain: CreateItem[];
  /** with --terminal-only-to-main: the terminal-only accounts that are not APPROVED (not created) */
  terminalOnlySkipped: SyncUser[];
  conflicts: Conflict[];
}

function stripNulls(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

/** A new account as a copy of `from`: USER / APPROVED, the same hash and the whole whitelisted profile; fomoId kept unless `taken`. */
async function buildCreate(from: SyncUser, takenFomoIds: Set<string>): Promise<CreateItem> {
  const profile = profileFromUser(from);
  const fallbackName = from.email.split("@")[0].slice(0, 100) || "user";
  const data: Record<string, unknown> = {
    ...stripNulls(profileToPrismaData(profile)),
    email: from.email,
    passwordHash: from.passwordHash,
    status: "APPROVED",
    role: "USER",
    displayName: profile.displayName || fallbackName,
  };
  let fomoIdChanged = false;
  let fomoId: string | null = profile.fomoId ?? null;
  if (fomoId && takenFomoIds.has(fomoId)) {
    const alt = await altFomoId(fomoId, from.email);
    fomoId = takenFomoIds.has(alt) ? null : alt;
    fomoIdChanged = true;
  }
  if (!fomoId) {
    do {
      fomoId = generateFomoId();
    } while (takenFomoIds.has(fomoId));
  }
  takenFomoIds.add(fomoId);
  data.fomoId = fomoId;
  return { from, data, avatarFrom: profile.avatarUrl ?? null, fomoIdChanged };
}

/**
 * Plans the reconciliation. `main` is the master. Matching is by trimmed, lower-cased e-mail; two accounts that only equal after
 * normalizeEmail (gmail dots, +tags) are NOT the same person here: they are listed as conflicts and left alone, and so is every address that
 * appears more than once in one database. Nothing is ever merged or deleted.
 */
export async function planSync(main: SyncUser[], term: SyncUser[], opts: { terminalOnlyToMain: boolean }): Promise<SyncPlan> {
  const plan: SyncPlan = { matched: [], createOnTerminal: [], mainOnlySkipped: [], terminalOnly: [], createOnMain: [], terminalOnlySkipped: [], conflicts: [] };
  const mainByKey = groupBy(main, (u) => emailKey(u.email));
  const termByKey = groupBy(term, (u) => emailKey(u.email));
  const mainByAlias = groupBy(main, (u) => normalizeEmail(u.email));
  const termByAlias = groupBy(term, (u) => normalizeEmail(u.email));

  const termFomoIds = new Set(term.map((u) => u.fomoId).filter((x): x is string => !!x));
  const mainFomoIds = new Set(main.map((u) => u.fomoId).filter((x): x is string => !!x));
  const flagged = new Set<SyncUser>();
  const conflict = (side: "main" | "terminal", user: SyncUser, reason: "alias" | "duplicate") => {
    if (flagged.has(user)) return;
    flagged.add(user);
    plan.conflicts.push({ side, user, reason });
  };

  // an address that appears twice in one database is ambiguous: both rows (and the other side's matching rows) are skipped
  for (const [key, list] of mainByKey) {
    if (list.length > 1) {
      list.forEach((u) => conflict("main", u, "duplicate"));
      (termByKey.get(key) ?? []).forEach((u) => conflict("terminal", u, "duplicate"));
    }
  }
  for (const [key, list] of termByKey) {
    if (list.length > 1) {
      list.forEach((u) => conflict("terminal", u, "duplicate"));
      (mainByKey.get(key) ?? []).forEach((u) => conflict("main", u, "duplicate"));
    }
  }

  for (const m of main) {
    if (flagged.has(m)) continue;
    const key = emailKey(m.email);
    const t = termByKey.get(key)?.[0];
    if (t) {
      plan.matched.push(matchPair(m, t, termFomoIds));
      continue;
    }
    // only on main
    const aliasOnTerminal = (termByAlias.get(normalizeEmail(m.email)) ?? []).length > 0;
    const aliasOnMain = (mainByAlias.get(normalizeEmail(m.email)) ?? []).filter((x) => x !== m).length > 0;
    if (aliasOnTerminal || aliasOnMain) {
      conflict("main", m, "alias");
      continue;
    }
    if (m.status !== "APPROVED") {
      plan.mainOnlySkipped.push(m);
      continue;
    }
    plan.createOnTerminal.push(await buildCreate(m, termFomoIds));
  }

  for (const t of term) {
    if (flagged.has(t)) continue;
    if (mainByKey.has(emailKey(t.email))) continue; // matched above
    const aliasOnMain = (mainByAlias.get(normalizeEmail(t.email)) ?? []).length > 0;
    const aliasOnTerminal = (termByAlias.get(normalizeEmail(t.email)) ?? []).filter((x) => x !== t).length > 0;
    if (aliasOnMain || aliasOnTerminal) {
      conflict("terminal", t, "alias");
      continue;
    }
    plan.terminalOnly.push(t);
    if (opts.terminalOnlyToMain) {
      if (t.status === "APPROVED") plan.createOnMain.push(await buildCreate(t, mainFomoIds));
      else plan.terminalOnlySkipped.push(t);
    }
  }
  return plan;
}

/** A profile in comparison form: social links without blank values (and gone altogether when nothing is left). */
function effectiveProfile(p: MirrorProfile): MirrorProfile {
  const out: Record<string, unknown> = { ...p };
  if (p.socialLinks && typeof p.socialLinks === "object") {
    const kept = Object.fromEntries(Object.entries(p.socialLinks).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
    if (Object.keys(kept).length > 0) out.socialLinks = kept;
    else delete out.socialLinks;
  }
  return out as MirrorProfile;
}

function matchPair(main: SyncUser, term: SyncUser, termFomoIds: Set<string>): MatchedItem {
  const data: Record<string, unknown> = {};
  const groups = new Set<Group>();
  let bumpSession = false;
  let fomoIdKept = false;

  if (term.passwordHash !== main.passwordHash) {
    data.passwordHash = main.passwordHash;
    bumpSession = true; // the old sessions of the terminal die with the old hash, and only then
    groups.add("password");
  }
  if (term.email !== main.email) {
    data.email = main.email; // the master's spelling
    groups.add("email");
  }

  // main wins for every whitelisted field that has a value there; empty never blanks (locale ru / dmEnabled true are the column defaults, not values).
  // Both sides are compared in the SAME normalised form (profileFromUser: clipped, invalid parts dropped, dates as ISO text; social links without their
  // blank keys): the form editors store links like {"telegram":"@a","vk":""}, and a stored copy must not look "different" from main only because it
  // keeps a blank key that "has no value" on main.
  const wins = mainWinsProfile(profileFromUser(main));
  const termView = effectiveProfile(profileFromUser(term));
  const winsView = effectiveProfile(wins);
  const profileFields: string[] = [];
  const changedKeys: Array<keyof MirrorProfile> = [];
  for (const f of PROFILE_FIELDS) {
    if (f === "fomoId" || f === "avatarUrl") continue;
    if (winsView[f] === undefined) continue;
    if (stableJson(winsView[f]) !== stableJson(termView[f])) changedKeys.push(f);
  }
  if (changedKeys.length > 0) {
    const subset: Record<string, unknown> = {};
    for (const k of changedKeys) subset[k] = wins[k];
    Object.assign(data, profileToPrismaData(subset as MirrorProfile));
    profileFields.push(...changedKeys);
    groups.add("profile");
  }
  if (wins.fomoId !== undefined && wins.fomoId !== term.fomoId) {
    const takenByOther = termFomoIds.has(wins.fomoId);
    if (takenByOther) fomoIdKept = true;
    else {
      data.fomoId = wins.fomoId;
      termFomoIds.add(wins.fomoId);
      profileFields.push("fomoId");
      groups.add("profile");
    }
  }
  return { main, term, data, bumpSession, groups, profileFields, avatarFrom: wins.avatarUrl ?? null, fomoIdKept };
}

// ---------------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------------

export interface Counts {
  mainUsers: number;
  terminalUsers: number;
  identical: number;
  changed: number;
  byGroup: Record<Group, number>;
  createdOnTerminal: number;
  mainOnlySkipped: number;
  terminalOnly: number;
  createdOnMain: number;
  terminalOnlySkipped: number;
  conflicts: number;
  fomoIdKept: number;
  avatarMissing: number;
  errors: number;
}

export function emptyCounts(): Counts {
  return {
    mainUsers: 0, terminalUsers: 0, identical: 0, changed: 0, byGroup: { password: 0, profile: 0, avatar: 0, email: 0 }, createdOnTerminal: 0, mainOnlySkipped: 0,
    terminalOnly: 0, createdOnMain: 0, terminalOnlySkipped: 0, conflicts: 0, fomoIdKept: 0, avatarMissing: 0, errors: 0,
  };
}

/** The summary table (counts only; no address, no hash). `apply` switches the wording from "would" to "done". */
export function formatSummary(c: Counts, apply: boolean, terminalOnlyToMain: boolean): string {
  const row = (label: string, n: number | string) => `  ${label.padEnd(58)} ${String(n).padStart(6)}`;
  const g = c.byGroup;
  const verb = apply ? "" : "would be ";
  const lines = [
    apply ? "== APPLY: the changes below were written ==" : "== DRY RUN: nothing was written (add --apply to write) ==",
    row("accounts on fomo.spot (main)", c.mainUsers),
    row("accounts on the terminal", c.terminalUsers),
    "",
    row("matched, identical", c.identical),
    row(`matched, ${verb}changed`, c.changed),
    row("   of them: password", g.password),
    row("   of them: profile", g.profile),
    row("   of them: avatar", g.avatar),
    row("   of them: e-mail", g.email),
    row(`${apply ? "created" : "to be created"} on the terminal (only on main, APPROVED)`, c.createdOnTerminal),
    row("only on main, not APPROVED (not created)", c.mainOnlySkipped),
    row("only on the terminal (NOT synced" + (terminalOnlyToMain ? ", see below)" : ")"), c.terminalOnly),
    ...(terminalOnlyToMain ? [row(`${apply ? "created" : "to be created"} on main (--terminal-only-to-main)`, c.createdOnMain), row("   not APPROVED (not created)", c.terminalOnlySkipped)] : []),
    row("alias / duplicate conflicts (skipped, listed above)", c.conflicts),
    row("main fomoId taken on the terminal (local one kept)", c.fomoIdKept),
    row("avatar file missing or unreadable (avatar skipped)", c.avatarMissing),
    row("errors", c.errors),
  ];
  return lines.join("\n");
}

/** "password,profile:city+bio,avatar": the changed groups, with the NAMES of the differing profile fields (never values). */
export function describeChange(groups: Iterable<Group>, profileFields: string[]): string {
  return [...groups].map((g) => (g === "profile" && profileFields.length ? `profile:${profileFields.join("+")}` : g)).join(",");
}

/** One per-user line: only ids and a masked address. */
export function userLine(kind: string, ids: Record<string, string>, email: string, extra = ""): string {
  const idPart = Object.entries(ids).map(([k, v]) => `${k}:${v}`).join(" ");
  return `${kind.padEnd(18)} ${idPart}  ${maskEmail(email)}${extra ? "  " + extra : ""}`;
}
