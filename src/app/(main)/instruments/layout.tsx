import type { Metadata } from "next";

const URL = "https://fomo.spot/instruments";
const title = "Торговые инструменты";
const description =
  "Каталог биржевых инструментов: акции, фьючерсы MOEX, крипта, форекс, товары. Аналитика, идеи и живые графики по каждому активу.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function InstrumentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
