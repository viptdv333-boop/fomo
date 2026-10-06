// Legal pages of the terminal site (terminal.fomo.spot, SITE_MODE=terminal): /privacy and /terms show their OWN texts about the
// terminal product (keys termlegal.* in src/lib/i18n/dict/termlegal.ts), not the fomo.spot texts about the social platform.
// Pure module (no React, no Next): the page layout lives here so scripts/check-site-mode.ts can verify every key exists in ru / en / cn.
// The Russian text is the original, en / cn are convenience translations. These are DRAFTS: have a lawyer review them before relying on them.

/** Effective date shown on both pages (also in the ru dictionary: «06.10.2026»). */
export const TERMINAL_LEGAL_DATE = "06.10.2026";

export type LegalPage = "privacy" | "terms";

/**
 * Block of a section: "p3" = paragraph key `.p3`, "l5" = list of items `.li1` ... `.li5`, "contact" = the contact paragraph
 * (`.email` when TERMINAL_CONTACT_EMAIL is set, `.form` otherwise).
 */
export type LegalBlock = string;
export interface LegalSection {
  n: number;
  blocks: LegalBlock[];
}

export const PRIVACY_LAYOUT: LegalSection[] = [
  { n: 1, blocks: ["p1", "p2"] },
  { n: 2, blocks: ["p1", "l7", "p2"] },
  { n: 3, blocks: ["p1", "l5"] },
  { n: 4, blocks: ["p1", "p2"] },
  { n: 5, blocks: ["p1", "l6", "p2"] },
  { n: 6, blocks: ["p1", "p2"] },
  { n: 7, blocks: ["p1", "l2", "p2", "p3"] },
  { n: 8, blocks: ["p1", "p2", "p3"] },
  { n: 9, blocks: ["p1"] },
  { n: 10, blocks: ["p1", "l6", "p2"] },
  { n: 11, blocks: ["p1"] },
  { n: 12, blocks: ["p1"] },
  { n: 13, blocks: ["contact"] },
];

export const TERMS_LAYOUT: LegalSection[] = [
  { n: 1, blocks: ["p1", "p2"] },
  { n: 2, blocks: ["p1", "p2", "p3"] },
  { n: 3, blocks: ["l5"] },
  { n: 4, blocks: ["p1", "l6", "p2"] },
  { n: 5, blocks: ["p1", "l5", "p2"] },
  { n: 6, blocks: ["p1", "p2", "p3", "p4"] },
  { n: 7, blocks: ["p1", "p2"] },
  { n: 8, blocks: ["p1", "p2"] },
  { n: 9, blocks: ["p1", "p2"] },
  { n: 10, blocks: ["p1", "p2"] },
  { n: 11, blocks: ["p1"] },
  { n: 12, blocks: ["p1"] },
  { n: 13, blocks: ["contact"] },
];

/** The «Не является инвестиционной рекомендацией» box at the top of the terms: number of bullets. */
export const TERMS_BOX_ITEMS = 4;

export const LEGAL_LAYOUTS: Record<LegalPage, LegalSection[]> = { privacy: PRIVACY_LAYOUT, terms: TERMS_LAYOUT };

/** Where the contact paragraph points when no e-mail is configured (the feedback form of the main site). */
export const TERMINAL_CONTACT_FORM_URL = "https://fomo.spot";

/** Every dictionary key a page needs (without the contact variants that depend on the environment: both are listed). */
export function legalKeys(page: LegalPage): string[] {
  const keys = [`termlegal.${page}.title`, `termlegal.${page}.effective`, `termlegal.seo.${page}.title`, `termlegal.seo.${page}.description`];
  if (page === "terms") {
    keys.push("termlegal.terms.box.title", "termlegal.terms.box.more", "termlegal.terms.s1.link");
    for (let i = 1; i <= TERMS_BOX_ITEMS; i++) keys.push(`termlegal.terms.box.li${i}`);
  }
  for (const s of LEGAL_LAYOUTS[page]) {
    keys.push(`termlegal.${page}.s${s.n}.h`);
    for (const b of s.blocks) {
      if (b === "contact") keys.push(`termlegal.${page}.s${s.n}.email`, `termlegal.${page}.s${s.n}.form`);
      else if (b[0] === "p") keys.push(`termlegal.${page}.s${s.n}.${b}`);
      else for (let i = 1; i <= Number(b.slice(1)); i++) keys.push(`termlegal.${page}.s${s.n}.li${i}`);
    }
  }
  return keys;
}

/**
 * Public contact e-mail of the terminal operator: TERMINAL_CONTACT_EMAIL, read at RUN time on the server (never inlined at build).
 * Returns null when unset or not an address; the legal pages then point to the feedback form of fomo.spot instead of printing an e-mail.
 */
export function terminalContactEmail(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.TERMINAL_CONTACT_EMAIL ?? "").trim().replace(/^["']|["']$/g, "").trim();
  if (!v || v.length > 254) return null;
  return /^[^\s@<>"'`\\]+@[^\s@<>"'`\\]+\.[^\s@<>"'`\\]{2,}$/.test(v) ? v : null;
}

/** Splits `text` at {name} placeholders: strings and the values from `map` in order (the page replaces them with links). */
export function splitPlaceholders(text: string, names: string[]): (string | { name: string })[] {
  const re = new RegExp(`\\{(${names.join("|")})\\}`, "g");
  const out: (string | { name: string })[] = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ name: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
