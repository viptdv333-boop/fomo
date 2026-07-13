import type { Metadata } from "next";

const URL = "https://fomo.spot/terminal";
const title = "Торговый терминал";
const description =
  "Живые графики MOEX и Bybit с индикаторами по всем инструментам. Смотрите котировки, ставьте уровни, обсуждайте сделки в чате.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
