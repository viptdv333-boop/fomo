import type { Metadata } from "next";

const URL = "https://fomo.spot/feed";
const title = "Доска торговых идей";
const description =
  "Свежие торговые идеи и аналитика от трейдеров: фьючерсы MOEX, акции, крипта, форекс. Читайте прогнозы, голосуйте, подписывайтесь.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
