import type { Metadata } from "next";

const URL = "https://fomo.spot/channels";
const title = "Каналы и подписки";
const description =
  "Платные каналы трейдеров FOMO с эксклюзивной аналитикой, торговыми сигналами и обсуждением идей. Выбирайте тарифы и подписывайтесь.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function ChannelsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
