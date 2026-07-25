import type { Metadata } from "next";

const URL = "https://fomo.spot/channels";
const title = "Платные каналы трейдеров и подписка на сигналы";
const description =
  "Каналы трейдеров с эксклюзивной аналитикой и торговыми сигналами по акциям, фьючерсам и криптовалюте. Выбирайте тариф и подписывайтесь на автора.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "платные сигналы трейдеров",
    "каналы трейдеров",
    "подписка на торговые сигналы",
    "сигналы для трейдинга",
    "аналитика по подписке",
  ],
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function ChannelsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
