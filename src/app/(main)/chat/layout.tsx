import type { Metadata } from "next";

const URL = "https://fomo.spot/chat";
const title = "Чат трейдеров: обсуждение рынка онлайн";
const description =
  "Живой чат трейдеров и инвесторов: обсуждение акций, фьючерсов и криптовалют в отдельных комнатах по инструментам. Делитесь сделками и мнением о рынке.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "чат трейдеров",
    "форум трейдеров",
    "сообщество инвесторов",
    "обсуждение акций",
    "социальная сеть для трейдеров",
  ],
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
