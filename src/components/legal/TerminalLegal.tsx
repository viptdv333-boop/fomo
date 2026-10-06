import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { seoAlternates } from "@/lib/i18n/locale-url";
import { ogLocales } from "@/lib/i18n/seo-metadata";
import {
  LEGAL_LAYOUTS,
  TERMINAL_CONTACT_FORM_URL,
  TERMS_BOX_ITEMS,
  splitPlaceholders,
  terminalContactEmail,
  type LegalPage,
} from "@/lib/terminal-legal";

// /privacy and /terms of the terminal site (SITE_MODE=terminal): the pages in src/app/(main)/privacy|terms hand over to these when
// isTerminalSite(). Same look as the fomo.spot pages (P / H2 / UL), own texts (termlegal.* in src/lib/i18n/dict/termlegal.ts),
// layout of the sections in src/lib/terminal-legal.ts. The contact e-mail is read from TERMINAL_CONTACT_EMAIL at run time.

const UL = "list-disc pl-5 space-y-1.5 text-[15px] text-gray-700 dark:text-gray-300 mb-3";
const LINK = "text-green-600 hover:underline break-words";

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 mb-3">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold mt-8 mb-3 text-gray-900 dark:text-gray-100">{children}</h2>;
}

/** Metadata of the terminal legal pages: own title / description, canonical + hreflang as on the main site, indexable. */
export async function terminalLegalMetadata(page: LegalPage): Promise<Metadata> {
  const { locale, t } = await getT();
  const title = t(`termlegal.seo.${page}.title`);
  const description = t(`termlegal.seo.${page}.description`);
  const alternates = seoAlternates(locale, `/${page}`);
  return {
    title,
    description,
    alternates,
    openGraph: { title, description, url: alternates.canonical, ...ogLocales(locale) },
    robots: { index: true, follow: true },
  };
}

type T = (key: string, vars?: Record<string, string | number>) => string;

function Sections({ page, t, email }: { page: LegalPage; t: T; email: string | null }) {
  return (
    <>
      {LEGAL_LAYOUTS[page].map((s) => {
        const k = (suffix: string) => `termlegal.${page}.s${s.n}.${suffix}`;
        return (
          <section key={s.n}>
            <H2>{t(k("h"))}</H2>
            {s.blocks.map((b) => {
              if (b === "contact") {
                // the e-mail goes through the environment (never hard-coded); without it the feedback form of fomo.spot is named
                const raw = t(k(email ? "email" : "form"));
                return (
                  <P key={b}>
                    {splitPlaceholders(raw, ["email", "url"]).map((part, i) =>
                      typeof part === "string" ? (
                        part
                      ) : part.name === "email" ? (
                        <a key={i} href={`mailto:${email}`} className={LINK}>
                          {email}
                        </a>
                      ) : (
                        <a key={i} href={TERMINAL_CONTACT_FORM_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                          {TERMINAL_CONTACT_FORM_URL}
                        </a>
                      ),
                    )}
                  </P>
                );
              }
              if (b[0] === "l") {
                const n = Number(b.slice(1));
                return (
                  <ul key={b} className={UL}>
                    {Array.from({ length: n }, (_, i) => (
                      <li key={i}>{t(k(`li${i + 1}`))}</li>
                    ))}
                  </ul>
                );
              }
              // terms s1.p1 carries {privacy}: a link to the privacy page
              const parts = splitPlaceholders(t(k(b)), ["privacy"]);
              return (
                <P key={b}>
                  {parts.map((part, i) =>
                    typeof part === "string" ? (
                      part
                    ) : (
                      <Link key={i} href="/privacy" className="text-green-600 hover:underline">
                        {t("termlegal.terms.s1.link")}
                      </Link>
                    ),
                  )}
                </P>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

async function renderLegal(page: LegalPage) {
  const { t, locale } = await getT();
  const email = terminalContactEmail();
  // The Russian original has no note
  const note = locale === "ru" ? "" : t("termlegal.note");
  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-10" data-terminal-legal={page}>
      {note && note !== "termlegal.note" && <p className="text-[13px] italic text-gray-500 dark:text-gray-400 mb-4">{note}</p>}
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">{t(`termlegal.${page}.title`)}</h1>
      <p className={`text-sm text-gray-500 dark:text-gray-400 ${page === "terms" ? "mb-6" : "mb-8"}`}>{t(`termlegal.${page}.effective`)}</p>

      {page === "terms" && (
        <div className="rounded-xl border-2 border-amber-400/60 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/15 p-5 mb-8" role="note">
          <p className="font-bold text-amber-900 dark:text-amber-400 mb-3">{t("termlegal.terms.box.title")}</p>
          <ul className="space-y-2 text-[14px] text-gray-800 dark:text-gray-300">
            {Array.from({ length: TERMS_BOX_ITEMS }, (_, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-600 dark:text-amber-500 shrink-0">•</span>
                <span>{t(`termlegal.terms.box.li${i + 1}`)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-3">{t("termlegal.terms.box.more")}</p>
        </div>
      )}

      <Sections page={page} t={t} email={email} />
    </div>
  );
}

/** Called from the page component: `return TerminalPrivacyPage();` */
export function TerminalPrivacyPage() {
  return renderLegal("privacy");
}

export function TerminalTermsPage() {
  return renderLegal("terms");
}
