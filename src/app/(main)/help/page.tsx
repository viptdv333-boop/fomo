import type { Metadata } from "next";
import Link from "next/link";
import {
  RegistrationSteps,
  CabinetTabs,
  RatingScale,
  PaymentFlow,
  ChannelCard,
  FreeVsPaid,
} from "@/components/help/Illustrations";
import { getT } from "@/lib/i18n/server";
import { isPageHidden } from "@/lib/hidden-pages";
import { HTML_LANG, seoAlternates, type Locale } from "@/lib/i18n/locale-url";
import { keywordList, ogLocales } from "@/lib/i18n/seo-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getT();
  const alternates = seoAlternates(locale, "/help");
  return {
    title: t("seo.help.title"),
    description: t("seo.help.description"),
    keywords: keywordList(t("seo.help.keywords")),
    alternates,
    openGraph: {
      url: alternates.canonical,
      title: t("seo.help.ogTitle"),
      description: t("seo.help.ogDescription"),
      ...ogLocales(locale),
    },
  };
}

// FAQPage markup: these questions are exactly what people type into search,
// and the answers can surface directly in results. Built per language so
// /en/help and /zh/help carry their own FAQ rich results.
function buildFaqJsonLd(locale: Locale, t: (key: string) => string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: HTML_LANG[locale],
    mainEntity: [1, 2, 3, 4].map((n) => ({
      "@type": "Question",
      name: t(`seo.faq.q${n}`),
      acceptedAnswer: {
        "@type": "Answer",
        text: t(`seo.faq.a${n}`),
      },
    })),
  };
}

const SECTIONS = [
  { id: "start", key: "help.nav.start" },
  { id: "registration", key: "help.nav.registration" },
  { id: "cabinet", key: "help.nav.cabinet" },
  { id: "ideas", key: "help.nav.ideas" },
  { id: "rating", key: "help.nav.rating" },
  { id: "paid-ideas", key: "help.nav.paidIdeas" },
  { id: "channels", key: "help.nav.channels" },
  { id: "payments", key: "help.nav.payments" },
  { id: "commission", key: "help.nav.commission" },
  { id: "terminal", key: "help.nav.terminal" },
  { id: "rules", key: "help.nav.rules" },
  { id: "faq", key: "help.nav.faq" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 mb-14">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">
        {children}
      </div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-green-500 bg-green-50 dark:bg-green-900/20 rounded-r-lg px-4 py-3 text-[14px] text-gray-700 dark:text-gray-300">
      {children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-r-lg px-4 py-3 text-[14px] text-gray-700 dark:text-gray-300">
      {children}
    </div>
  );
}

function Steps({ items }: { items: { t: string; d: React.ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={s.t} className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-green-600 text-white text-[12px] font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{s.t}</span>
            {s.d && <span className="block text-[14px] mt-0.5">{s.d}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

// Class for inline bold fragments inside translated paragraphs.
const B = "text-gray-900 dark:text-gray-100";

export default async function HelpPage() {
  const { t, locale } = await getT();
  const terminalHidden = await isPageHidden("terminal");
  const faqJsonLd = buildFaqJsonLd(locale, t);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <div className="max-w-6xl w-full mx-auto px-4 py-8">
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">
            {t("help.title")}
          </h1>
          <p className="mt-3 text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
            {t("help.subtitle")}
          </p>
        </header>

        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
          {/* Оглавление */}
          <nav className="mb-10 lg:mb-0">
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                {t("help.toc")}
              </p>
              <ul className="space-y-1.5">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-[14px] text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition"
                    >
                      {t(s.key)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <main>
            <Section id="start" title={t("help.start.title")}>
              <p>{t("help.start.p1")}</p>
              <p>{t("help.start.p2")}</p>
              <ul className="list-disc pl-5 space-y-1.5">
                {[1, 2, 3].map((n) => (
                  <li key={n}>
                    <b className={B}>{t(`help.start.li${n}b`)}</b>
                    {t(`help.start.li${n}`)}
                  </li>
                ))}
              </ul>
              <Note>{t("help.start.note")}</Note>
            </Section>

            <Section id="registration" title={t("help.reg.title")}>
              <p>{t("help.reg.p1")}</p>
              <RegistrationSteps t={t} />
              <Steps
                items={[1, 2, 3].map((n) => ({ t: t(`help.reg.s${n}t`), d: t(`help.reg.s${n}d`) }))}
              />
              <Warn>{t("help.reg.warn")}</Warn>
              <p>{t("help.reg.pwa")}</p>
            </Section>

            <Section id="cabinet" title={t("help.cab.title")}>
              <p>
                {t("help.cab.p1a")}
                <Link href="/profile" className="text-green-600 hover:underline">{t("help.cab.p1link")}</Link>
                {t("help.cab.p1c")}
              </p>
              <CabinetTabs t={t} />
              <div className="grid sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4]
                  .map((n) => ({ t: t(`help.cab.c${n}t`), d: t(`help.cab.c${n}d`) }))
                  .map((c) => (
                    <div
                      key={c.t}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800"
                    >
                      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{c.t}</p>
                      <p className="text-[14px] text-gray-600 dark:text-gray-400">{c.d}</p>
                    </div>
                  ))}
              </div>
            </Section>

            <Section id="ideas" title={t("help.ideas.title")}>
              <p>
                {t("help.ideas.p1a")}
                <b className={B}>{t("help.ideas.p1b")}</b>
                {t("help.ideas.p1c")}
              </p>
              <Steps
                items={[1, 2, 3, 4].map((n) => ({ t: t(`help.ideas.s${n}t`), d: t(`help.ideas.s${n}d`) }))}
              />
              <Note>{t("help.ideas.note")}</Note>
              <p>{t("help.ideas.p2")}</p>
            </Section>

            <Section id="rating" title={t("help.rating.title")}>
              <p>{t("help.rating.p1")}</p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 font-mono text-[13px] leading-relaxed overflow-x-auto">
                <div className="text-gray-900 dark:text-gray-100">{t("help.rating.f1")}</div>
                <div className="text-green-700 dark:text-green-400">{t("help.rating.f2")}</div>
                <div className="text-green-700 dark:text-green-400">{t("help.rating.f3")}</div>
                <div className="text-green-700 dark:text-green-400">{t("help.rating.f4")}</div>
                <div className="text-red-600 dark:text-red-400">{t("help.rating.f5")}</div>
                <div className="text-red-600 dark:text-red-400">{t("help.rating.f6")}</div>
                <div className="text-gray-500 dark:text-gray-400 mt-1">{t("help.rating.f7")}</div>
              </div>
              <RatingScale t={t} />
              <p>
                {t("help.rating.p2a")}
                <b className={B}>{t("help.rating.p2b")}</b>
                {t("help.rating.p2c")}
              </p>
              <Warn>{t("help.rating.warn")}</Warn>
            </Section>

            <Section id="paid-ideas" title={t("help.paid.title")}>
              <p>{t("help.paid.p1")}</p>
              <FreeVsPaid t={t} />
              <p>{t("help.paid.p2")}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2.5 pr-4 font-semibold text-gray-900 dark:text-gray-100">{t("help.paid.th1")}</th>
                      <th className="text-left py-2.5 font-semibold text-gray-900 dark:text-gray-100">{t("help.paid.th2")}</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700 dark:text-gray-300">
                    {[1, 2, 3, 4].map((n) => (
                      <tr key={n} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2.5 pr-4">{t(`help.paid.r${n}`)}</td>
                        <td className="py-2.5">{t(`help.paid.v${n}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[14px] text-gray-600 dark:text-gray-400">{t("help.paid.window")}</p>
              <Note>{t("help.paid.note")}</Note>
            </Section>

            <Section id="channels" title={t("help.ch.title")}>
              <p>
                <b className={B}>{t("help.ch.p1b")}</b>
                {t("help.ch.p1")}
              </p>
              <p>
                <b className={B}>{t("help.ch.p2b")}</b>
                {t("help.ch.p2")}
              </p>
              <ChannelCard t={t} />
              <p className="font-semibold text-gray-900 dark:text-gray-100">{t("help.ch.howTitle")}</p>
              <Steps
                items={[1, 2, 3, 4].map((n) => ({ t: t(`help.ch.s${n}t`), d: t(`help.ch.s${n}d`) }))}
              />
              <Warn>{t("help.ch.warn")}</Warn>
            </Section>

            <Section id="payments" title={t("help.pay.title")}>
              <p>
                {t("help.pay.p1a")}
                <b className={B}>{t("help.pay.p1b")}</b>
                {t("help.pay.p1c")}
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t("help.pay.card1t")}</p>
                  <p className="text-[14px] text-gray-600 dark:text-gray-400">{t("help.pay.card1d")}</p>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{t("help.pay.card2t")}</p>
                  <p className="text-[14px] text-gray-600 dark:text-gray-400">{t("help.pay.card2d")}</p>
                </div>
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 mt-2">{t("help.pay.flowTitle")}</p>
              <PaymentFlow t={t} />
              <p>{t("help.pay.p2")}</p>
              <p>
                {t("help.pay.p3a")}
                <b className={B}>{t("help.pay.p3b")}</b>
                {t("help.pay.p3c")}
              </p>
              <Warn>{t("help.pay.warn")}</Warn>
            </Section>

            <Section id="commission" title={t("help.fee.title")}>
              <div className="rounded-2xl border-2 border-green-500 bg-green-50 dark:bg-green-900/20 p-6 text-center">
                <p className="text-4xl font-bold text-green-700 dark:text-green-400">0%</p>
                <p className="mt-2 text-gray-700 dark:text-gray-300">{t("help.fee.big")}</p>
              </div>
              <p>{t("help.fee.p1")}</p>
              <p>{t("help.fee.p2")}</p>
              <Warn>{t("help.fee.warn")}</Warn>
            </Section>

            <Section id="terminal" title={t("help.term.title")}>
              <p>{t("help.term.p1")}</p>
              <p>
                {terminalHidden ? (
                  <span>{t("help.term.p2link")}</span>
                ) : (
                  <Link href="/terminal" className="text-green-600 hover:underline">{t("help.term.p2link")}</Link>
                )}
                {t("help.term.p2")}
              </p>
              <Warn>{t("help.term.warn")}</Warn>
              <p>
                {t("help.term.p3a")}
                <Link href="/chat" className="text-green-600 hover:underline">{t("help.term.p3link")}</Link>
                {t("help.term.p3c")}
              </p>
            </Section>

            <Section id="rules" title={t("help.rules.title")}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 p-4">
                  <p className="font-semibold text-green-800 dark:text-green-400 mb-2">{t("help.rules.goodTitle")}</p>
                  <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
                    {[1, 2, 3].map((n) => (
                      <li key={n}>{t(`help.rules.good${n}`)}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10 p-4">
                  <p className="font-semibold text-red-700 dark:text-red-400 mb-2">{t("help.rules.badTitle")}</p>
                  <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <li key={n}>{t(`help.rules.bad${n}`)}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p>{t("help.rules.p1")}</p>
            </Section>

            <Section id="faq" title={t("help.faq.title")}>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <div key={n} className="py-4">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{t(`help.faq.q${n}`)}</p>
                    <p className="text-[14px] text-gray-600 dark:text-gray-400">{t(`help.faq.a${n}`)}</p>
                  </div>
                ))}
              </div>
            </Section>

            <div className="rounded-2xl bg-gray-900 dark:bg-gray-800 p-8 text-center">
              <p className="text-xl font-bold text-white mb-2">{t("help.cta.title")}</p>
              <p className="text-gray-400 text-[15px] mb-5">{t("help.cta.sub")}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/register"
                  className="px-6 py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition"
                >
                  {t("help.cta.register")}
                </Link>
                <Link
                  href="/feed"
                  className="px-6 py-3 rounded-lg border border-gray-600 text-gray-200 font-medium hover:bg-gray-800 transition"
                >
                  {t("help.cta.feed")}
                </Link>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
