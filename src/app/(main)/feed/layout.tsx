import type { Metadata } from "next";

const URL = "https://fomo.spot/feed";
const title = "Торговые идеи и прогнозы по акциям";
const description =
  "Свежие торговые идеи и прогнозы от трейдеров: акции, фьючерсы МосБиржи, криптовалюта, форекс. Технический анализ, точки входа и цели. Читайте бесплатно.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "торговые идеи",
    "идеи для инвестиций",
    "прогнозы по акциям",
    "торговые сигналы",
    "технический анализ акций",
    "аналитика фьючерсов",
    "прогноз индекса МосБиржи",
  ],
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
