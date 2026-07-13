import type { Metadata } from "next";

const URL = "https://fomo.spot/chat";
const title = "Болталка трейдеров";
const description =
  "Общий чат трейдеров FOMO и комнаты по инструментам. Обсуждайте рынок, делитесь сделками и получайте живую реакцию сообщества.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
