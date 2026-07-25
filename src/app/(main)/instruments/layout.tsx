import type { Metadata } from "next";

const URL = "https://fomo.spot/instruments";
const title = "Акции, фьючерсы и криптовалюта: аналитика";
const description =
  "Каталог биржевых инструментов: акции РФ и США, фьючерсы МосБиржи, криптовалюта, форекс, нефть и золото. Котировки, графики и торговые идеи по каждому активу.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "акции",
    "фьючерсы МосБиржи",
    "криптовалюта",
    "нефть Brent",
    "котировки акций",
    "аналитика по инструментам",
    "инвестиции в акции",
  ],
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function InstrumentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
