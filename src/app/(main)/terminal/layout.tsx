import type { Metadata } from "next";

const URL = "https://fomo.spot/terminal";
const title = "Торговый терминал: графики МосБиржи онлайн";
const description =
  "Онлайн-графики акций, фьючерсов МосБиржи и криптовалют с индикаторами. Живые котировки MOEX и Bybit, технический анализ и обсуждение сделок в чате.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "торговый терминал",
    "графики акций онлайн",
    "котировки МосБиржи",
    "график биткоина",
    "технический анализ онлайн",
    "живые котировки",
  ],
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
