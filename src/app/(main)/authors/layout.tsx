import type { Metadata } from "next";

const URL = "https://fomo.spot/authors";
const title = "Авторы и трейдеры";
const description =
  "Список профессиональных трейдеров и аналитиков FOMO. Сортировка по рейтингу, специализациям и опыту. Подписывайтесь на лучших авторов.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function AuthorsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
