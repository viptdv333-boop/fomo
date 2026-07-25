import type { Metadata } from "next";

const URL = "https://fomo.spot/authors";
const title = "Трейдеры и аналитики: рейтинг авторов";
const description =
  "Профессиональные трейдеры и инвестиционные аналитики FOMO. Рейтинг по доходности идей, специализации и опыту на бирже. Подпишитесь на лучших авторов.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "трейдеры",
    "инвестиционные аналитики",
    "рейтинг трейдеров",
    "подписка на трейдера",
    "копитрейдинг",
    "лучшие трейдеры России",
  ],
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function AuthorsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
