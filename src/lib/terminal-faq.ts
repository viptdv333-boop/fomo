// The FAQ of the terminal landing: dictionary keys (termsite.faq.q1..q5 / a1..a5 in src/lib/i18n/dict/termsite.ts).
// The same list feeds the visible <details> list (TerminalLanding) and the FAQPage JSON-LD (terminal-seo.ts), so they cannot differ.
export const TERMINAL_FAQ_KEYS = [1, 2, 3, 4, 5].map((n) => ({ q: `termsite.faq.q${n}`, a: `termsite.faq.a${n}` }));
