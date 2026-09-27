import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";

const SITE_URL = "https://fomo.spot";

export const metadata: Metadata = {
  title: "Политика обработки персональных данных",
  description: "Политика обработки персональных данных пользователей FOMO.",
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 mb-3">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold mt-8 mb-3 text-gray-900 dark:text-gray-100">{children}</h2>;
}

const UL = "list-disc pl-5 space-y-1.5 text-[15px] text-gray-700 dark:text-gray-300 mb-3";

export default async function PrivacyPage() {
  const { t, locale } = await getT();
  // The Russian original has no note; translate() falls back to the key for "".
  const note = locale === "ru" ? "" : t("privacy.translationNote");
  const list = (prefix: string, n: number) => (
    <ul className={UL}>
      {Array.from({ length: n }, (_, i) => (
        <li key={i}>{t(`${prefix}${i + 1}`)}</li>
      ))}
    </ul>
  );
  return (
    <div className="max-w-3xl w-full mx-auto px-4 py-10">
      {note && note !== "privacy.translationNote" && (
        <p className="text-[13px] italic text-gray-500 dark:text-gray-400 mb-4">{note}</p>
      )}
      <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">
        {t("privacy.title")}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">{t("privacy.effective")}</p>

      <H2>{t("privacy.s1.h")}</H2>
      <P>{t("privacy.s1.p1")}</P>
      <P>{t("privacy.s1.p2")}</P>

      <H2>{t("privacy.s2.h")}</H2>
      <P>{t("privacy.s2.p1")}</P>
      {list("privacy.s2.li", 5)}
      <P>{t("privacy.s2.p2")}</P>

      <H2>{t("privacy.s3.h")}</H2>
      {list("privacy.s3.li", 6)}

      <H2>{t("privacy.s4.h")}</H2>
      <P>{t("privacy.s4.p1")}</P>
      <P>{t("privacy.s4.p2")}</P>

      <H2>{t("privacy.s5.h")}</H2>
      <P>{t("privacy.s5.p1")}</P>
      {list("privacy.s5.li", 2)}
      <P>{t("privacy.s5.p2")}</P>

      <H2>{t("privacy.s6.h")}</H2>
      <P>{t("privacy.s6.p1")}</P>

      <H2>{t("privacy.s7.h")}</H2>
      <P>{t("privacy.s7.p1")}</P>
      {list("privacy.s7.li", 4)}

      <H2>{t("privacy.s8.h")}</H2>
      <P>{t("privacy.s8.p1")}</P>

      <H2>{t("privacy.s9.h")}</H2>
      <P>{t("privacy.s9.p1")}</P>
    </div>
  );
}
