import type { Metadata } from "next";

const URL = "https://fomo.spot/calculator";
const title = "Калькулятор риска и позиции — фьючерсы МосБиржи";
const description =
  "Рассчитайте количество фьючерсных контрактов по риску на сделку: депозит, вход, стоп, тейк — актуальные данные биржи (шаг цены, ГО) в реальном времени.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "калькулятор риска",
    "калькулятор позиции трейдера",
    "расчёт лота фьючерс",
    "риск менеджмент трейдинг",
    "гарантийное обеспечение фьючерс",
  ],
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL },
  twitter: { title, description },
};

export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
