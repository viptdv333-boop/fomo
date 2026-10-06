import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { seoAlternates } from "@/lib/i18n/locale-url";
import { ogLocales } from "@/lib/i18n/seo-metadata";
import { isTerminalSite } from "@/lib/site-mode";
import { TerminalTermsPage, terminalLegalMetadata } from "@/components/legal/TerminalLegal";

export async function generateMetadata(): Promise<Metadata> {
  // terminal.fomo.spot: its own texts about the terminal product (src/components/legal/TerminalLegal.tsx)
  if (isTerminalSite()) return terminalLegalMetadata("terms");
  const { locale, t } = await getT();
  const title = t("seo.terms.title");
  const description = t("seo.terms.description");
  const alternates = seoAlternates(locale, "/terms");
  return {
    title,
    description,
    alternates,
    openGraph: { title, description, url: alternates.canonical, ...ogLocales(locale) },
    robots: { index: true, follow: true },
  };
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 mb-3">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold mt-8 mb-3 text-gray-900 dark:text-gray-100">{children}</h2>;
}

const B = "text-gray-900 dark:text-gray-100";
const UL = "list-disc pl-5 space-y-1.5 text-[15px] text-gray-700 dark:text-gray-300 mb-3";

export default async function TermsPage() {
  if (isTerminalSite()) return TerminalTermsPage();
  const { t, locale } = await getT();
  // The Russian original has no note; translate() falls back to the key for "".
  const note = locale === "ru" ? "" : t("terms.translationNote");
  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-10">
      {note && note !== "terms.translationNote" && (
        <p className="text-[13px] italic text-gray-500 dark:text-gray-400 mb-4">{note}</p>
      )}
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">
        {t("terms.title")}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("terms.effective")}</p>

      <div className="rounded-xl border-2 border-amber-400/60 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/15 p-5 mb-8">
        <p className="font-bold text-amber-900 dark:text-amber-400 mb-3">
          {t("terms.box.title")}
        </p>
        <ul className="space-y-2 text-[14px] text-gray-800 dark:text-gray-300">
          {range(4).map((n) => (
            <li key={n} className="flex gap-2">
              <span className="text-amber-600 dark:text-amber-500 shrink-0">•</span>
              <span>
                {t("terms.box.subj")}
                <b className={B}>{t(`terms.box.li${n}b`)}</b>
                {t(`terms.box.li${n}c`)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-3">
          {t("terms.box.more")}
        </p>
      </div>

      <H2>{t("terms.s1.h")}</H2>
      <P>
        {t("terms.s1.p1a")}
        <Link href="/privacy" className="text-green-600 hover:underline">{t("terms.s1.link")}</Link>
        {t("terms.s1.p1c")}
      </P>

      <H2>{t("terms.s2.h")}</H2>
      <P>{t("terms.s2.p1")}</P>

      <H2>{t("terms.s3.h")}</H2>
      <ul className={UL}>
        {range(4).map((n) => (
          <li key={n}>{t(`terms.s3.li${n}`)}</li>
        ))}
      </ul>

      <H2>{t("terms.s4.h")}</H2>
      <P>
        <b className={B}>{t("terms.s4.p1b")}</b>
        {t("terms.s4.p1c")}
      </P>
      <P>{t("terms.s4.p2")}</P>

      <H2>{t("terms.s5.h")}</H2>
      <ul className={UL}>
        {range(5).map((n) => (
          <li key={n}>{t(`terms.s5.li${n}`)}</li>
        ))}
      </ul>

      <H2>{t("terms.s6.h")}</H2>
      <P>{t("terms.s6.p1")}</P>

      <H2>{t("terms.s7.h")}</H2>
      <P>{t("terms.s7.p1")}</P>
      <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-2">{t("terms.s7.forbidden")}</p>
      <ul className={UL}>
        {[1, 2, 3].map((n) => (
          <li key={n}>
            <b className={B}>{t(`terms.s7.li${n}b`)}</b>
            {t(`terms.s7.li${n}c`)}
          </li>
        ))}
        <li>{t("terms.s7.li4")}</li>
        <li>
          <b className={B}>{t("terms.s7.li5b")}</b>
          {t("terms.s7.li5c")}
        </li>
        {[6, 7, 8, 9].map((n) => (
          <li key={n}>{t(`terms.s7.li${n}`)}</li>
        ))}
      </ul>
      <P>{t("terms.s7.p2")}</P>

      <H2>{t("terms.s8.h")}</H2>
      <ul className={UL}>
        {range(8).map((n) => (
          <li key={n}>{t(`terms.s8.li${n}`)}</li>
        ))}
      </ul>
      <P>{t("terms.s8.p1")}</P>

      <H2>{t("terms.s9.h")}</H2>
      <P>{t("terms.s9.p1")}</P>

      <H2>{t("terms.s10.h")}</H2>
      <P>{t("terms.s10.p1")}</P>
      <P>{t("terms.s10.p2")}</P>

      <H2>{t("terms.s11.h")}</H2>
      <P>{t("terms.s11.p1")}</P>

      <H2>{t("terms.s12.h")}</H2>
      <P>{t("terms.s12.p1")}</P>
    </div>
  );
}
