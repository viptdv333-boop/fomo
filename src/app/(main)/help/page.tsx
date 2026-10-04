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
import { HELP_COUNTS as N, HELP_SECTIONS as SECTIONS, range } from "@/lib/help-structure";

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
// /en/help and /zh/help carry their own FAQ rich results. The questions are
// the same ones the FAQ section shows on the page (help.faq.*).
function buildFaqJsonLd(locale: Locale, t: (key: string) => string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: HTML_LANG[locale],
    mainEntity: range(N.faq).map((n) => ({
      "@type": "Question",
      name: t(`help.faq.q${n}`),
      acceptedAnswer: {
        "@type": "Answer",
        text: t(`help.faq.a${n}`),
      },
    })),
  };
}

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

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 pt-2">{children}</h3>;
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

function CardGrid({ items }: { items: { t: string; d: string; href?: string }[] }) {
  const cls = "rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800";
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {items.map((c) => {
        const inner = (
          <>
            <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{c.t}</p>
            <p className="text-[14px] text-gray-600 dark:text-gray-400">{c.d}</p>
          </>
        );
        return c.href ? (
          <Link key={c.t} href={c.href} className={`${cls} block hover:border-green-500 transition`}>
            {inner}
          </Link>
        ) : (
          <div key={c.t} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

// Class for inline bold fragments inside translated paragraphs.
const B = "text-gray-900 dark:text-gray-100";

export default async function HelpPage() {
  const { t, locale } = await getT();
  const terminalHidden = await isPageHidden("terminal");
  const calendarHidden = await isPageHidden("calendar");
  const faqJsonLd = buildFaqJsonLd(locale, t);

  const bullets = (count: number, lead: (n: number) => string, body: (n: number) => string) => (
    <ul className="list-disc pl-5 space-y-2">
      {range(count).map((n) => (
        <li key={n}>
          <b className={B}>{t(lead(n))}</b>
          {t(body(n))}
        </li>
      ))}
    </ul>
  );

  const cards = (count: number, tKey: (n: number) => string, dKey: (n: number) => string, hrefs?: (string | undefined)[]) => (
    <CardGrid items={range(count).map((n) => ({ t: t(tKey(n)), d: t(dKey(n)), href: hrefs?.[n - 1] }))} />
  );

  const steps = (count: number, tKey: (n: number) => string, dKey: (n: number) => string) => (
    <Steps items={range(count).map((n) => ({ t: t(tKey(n)), d: t(dKey(n)) }))} />
  );

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
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
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
                {range(N.startLi).map((n) => (
                  <li key={n}>
                    <b className={B}>{t(`help.start.li${n}b`)}</b>
                    {t(`help.start.li${n}`)}
                  </li>
                ))}
              </ul>
              <Note>{t("help.start.note")}</Note>
              <SubTitle>{t("help.start.mapTitle")}</SubTitle>
              {cards(
                N.startMap,
                (n) => `help.start.m${n}t`,
                (n) => `help.start.m${n}d`,
                ["/feed", "/channels", "/authors", "/chat", terminalHidden ? undefined : "/terminal", calendarHidden ? undefined : "/calendar", "/calculator"],
              )}
            </Section>

            <Section id="registration" title={t("help.reg.title")}>
              <p>{t("help.reg.p1")}</p>
              <RegistrationSteps t={t} />
              {steps(N.regSteps, (n) => `help.reg.s${n}t`, (n) => `help.reg.s${n}d`)}
              <Warn>{t("help.reg.warn")}</Warn>
              <SubTitle>{t("help.reg.loginTitle")}</SubTitle>
              <p>{t("help.reg.login")}</p>
              <SubTitle>{t("help.reg.guestTitle")}</SubTitle>
              <p>{t("help.reg.guest")}</p>
            </Section>

            <Section id="install" title={t("help.inst.title")}>
              <p>{t("help.inst.p1")}</p>
              {steps(N.instSteps, (n) => `help.inst.s${n}t`, (n) => `help.inst.s${n}d`)}
              <SubTitle>{t("help.inst.updTitle")}</SubTitle>
              <p>{t("help.inst.upd")}</p>
            </Section>

            <Section id="cabinet" title={t("help.cab.title")}>
              <p>
                {t("help.cab.p1a")}
                <Link href="/profile" className="text-green-600 hover:underline">{t("help.cab.p1link")}</Link>
                {t("help.cab.p1c")}
              </p>
              <CabinetTabs t={t} />
              {cards(N.cabCards, (n) => `help.cab.c${n}t`, (n) => `help.cab.c${n}d`)}
            </Section>

            <Section id="board" title={t("help.board.title")}>
              <p>{t("help.board.p1")}</p>
              {bullets(N.boardItems, (n) => `help.board.b${n}t`, (n) => `help.board.b${n}`)}
            </Section>

            <Section id="ideas" title={t("help.ideas.title")}>
              <p>
                {t("help.ideas.p1a")}
                <b className={B}>{t("help.ideas.p1b")}</b>
                {t("help.ideas.p1c")}
              </p>
              {steps(N.ideaSteps, (n) => `help.ideas.s${n}t`, (n) => `help.ideas.s${n}d`)}
              <Note>{t("help.ideas.note")}</Note>
              <p>{t("help.ideas.p2")}</p>
              <p>{t("help.ideas.p3")}</p>
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
                    {range(N.paidRows).map((n) => (
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
              {steps(N.channelSteps, (n) => `help.ch.s${n}t`, (n) => `help.ch.s${n}d`)}
              <p>{t("help.ch.p3")}</p>
              <Warn>{t("help.ch.warn")}</Warn>
            </Section>

            <Section id="payments" title={t("help.pay.title")}>
              <p>
                {t("help.pay.p1a")}
                <b className={B}>{t("help.pay.p1b")}</b>
                {t("help.pay.p1c")}
              </p>
              {cards(N.payCards, (n) => `help.pay.card${n}t`, (n) => `help.pay.card${n}d`)}
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

            <Section id="payment-link" title={t("help.plink.title")}>
              <p>{t("help.plink.p1")}</p>
              <SubTitle>{t("help.plink.authorTitle")}</SubTitle>
              {steps(N.plinkAuthor, (n) => `help.plink.a${n}t`, (n) => `help.plink.a${n}d`)}
              <SubTitle>{t("help.plink.buyerTitle")}</SubTitle>
              {steps(N.plinkBuyer, (n) => `help.plink.b${n}t`, (n) => `help.plink.b${n}d`)}
              <Warn>{t("help.plink.warn")}</Warn>
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

            <Section id="chat" title={t("help.chat.title")}>
              <p>{t("help.chat.p1")}</p>
              {cards(N.chatCards, (n) => `help.chat.c${n}t`, (n) => `help.chat.c${n}d`)}
              <p>{t("help.chat.msgs")}</p>
              <SubTitle>{t("help.chat.iconTitle")}</SubTitle>
              <p>{t("help.chat.icon")}</p>
              <SubTitle>{t("help.chat.attTitle")}</SubTitle>
              {steps(N.chatAttach, (n) => `help.chat.at${n}t`, (n) => `help.chat.at${n}d`)}
              <Note>{t("help.chat.attNote")}</Note>
              <p>
                <Link href="/chat" className="text-green-600 hover:underline">{t("nav.chat")}</Link>
                {" · "}
                <Link href="/messages" className="text-green-600 hover:underline">{t("nav.messages")}</Link>
              </p>
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
              <Note>{t("help.term.saveNote")}</Note>
              {N.termGroups.map((items, g) => (
                <div key={g} className="space-y-3">
                  <SubTitle>{t(`help.term.g${g + 1}t`)}</SubTitle>
                  {bullets(
                    items,
                    (n) => `help.term.g${g + 1}.i${n}b`,
                    (n) => `help.term.g${g + 1}.i${n}`,
                  )}
                </div>
              ))}
              {!terminalHidden && (
                <p>
                  <Link href="/terminal/features" className="text-green-600 hover:underline">{t("help.term.featLink")}</Link>
                  {t("help.term.featText")}
                </p>
              )}
            </Section>

            <Section id="calendar" title={t("help.cal.title")}>
              <p>
                {t("help.cal.p1a")}
                {calendarHidden ? (
                  <span>{t("help.cal.p1link")}</span>
                ) : (
                  <Link href="/calendar" className="text-green-600 hover:underline">{t("help.cal.p1link")}</Link>
                )}
                {t("help.cal.p1c")}
              </p>
              <SubTitle>{t("help.cal.viewsTitle")}</SubTitle>
              {cards(N.calViews, (n) => `help.cal.v${n}t`, (n) => `help.cal.v${n}d`)}
              <SubTitle>{t("help.cal.filtersTitle")}</SubTitle>
              {bullets(N.calFilters, (n) => `help.cal.f${n}t`, (n) => `help.cal.f${n}d`)}
              <SubTitle>{t("help.cal.layersTitle")}</SubTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2.5 pr-4 font-semibold text-gray-900 dark:text-gray-100">{t("help.cal.th1")}</th>
                      <th className="text-left py-2.5 font-semibold text-gray-900 dark:text-gray-100">{t("help.cal.th2")}</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700 dark:text-gray-300">
                    {range(N.calLayers).map((n) => (
                      <tr key={n} className="border-b border-gray-100 dark:border-gray-800 align-top">
                        <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{t(`help.cal.l${n}t`)}</td>
                        <td className="py-2.5">{t(`help.cal.l${n}d`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[14px] text-gray-600 dark:text-gray-400">{t("help.cal.layersNote")}</p>
              <SubTitle>{t("help.cal.ruTitle")}</SubTitle>
              <p>{t("help.cal.ru")}</p>
              <SubTitle>{t("help.cal.remTitle")}</SubTitle>
              {steps(N.calReminder, (n) => `help.cal.rem${n}t`, (n) => `help.cal.rem${n}d`)}
              <SubTitle>{t("help.cal.tzTitle")}</SubTitle>
              <p>{t("help.cal.tz")}</p>
              <p>{t("help.cal.src")}</p>
              <Note>{t("help.cal.chartNote")}</Note>
            </Section>

            <Section id="notifications" title={t("help.ntf.title")}>
              <p>{t("help.ntf.p1")}</p>
              <SubTitle>{t("help.ntf.chTitle")}</SubTitle>
              {cards(N.ntfChannels, (n) => `help.ntf.ch${n}t`, (n) => `help.ntf.ch${n}d`)}
              <SubTitle>{t("help.ntf.tgTitle")}</SubTitle>
              {steps(N.ntfTelegram, (n) => `help.ntf.tg${n}t`, (n) => `help.ntf.tg${n}d`)}
              <Warn>{t("help.ntf.tgWarn")}</Warn>
              <SubTitle>{t("help.ntf.matTitle")}</SubTitle>
              <p>{t("help.ntf.mat")}</p>
              <SubTitle>{t("help.ntf.quietTitle")}</SubTitle>
              <p>{t("help.ntf.quiet")}</p>
              <SubTitle>{t("help.ntf.termTitle")}</SubTitle>
              <p>{t("help.ntf.term")}</p>
              <Note>{t("help.ntf.tip")}</Note>
            </Section>

            <Section id="rules" title={t("help.rules.title")}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 p-4">
                  <p className="font-semibold text-green-800 dark:text-green-400 mb-2">{t("help.rules.goodTitle")}</p>
                  <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
                    {range(N.rulesGood).map((n) => (
                      <li key={n}>{t(`help.rules.good${n}`)}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10 p-4">
                  <p className="font-semibold text-red-700 dark:text-red-400 mb-2">{t("help.rules.badTitle")}</p>
                  <ul className="list-disc pl-5 space-y-1.5 text-[14px]">
                    {range(N.rulesBad).map((n) => (
                      <li key={n}>{t(`help.rules.bad${n}`)}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p>{t("help.rules.p1")}</p>
            </Section>

            <Section id="faq" title={t("help.faq.title")}>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {range(N.faq).map((n) => (
                  <div key={n} className="py-4">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{t(`help.faq.q${n}`)}</p>
                    <p className="text-[14px] text-gray-600 dark:text-gray-400">{t(`help.faq.a${n}`)}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="whats-new" title={t("help.new.title")}>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                {t("help.new.date")}
              </p>
              <p>{t("help.new.p1")}</p>
              <CardGrid
                items={range(N.newItems).map((n) => ({ t: t(`help.new.i${n}t`), d: t(`help.new.i${n}d`) }))}
              />
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
