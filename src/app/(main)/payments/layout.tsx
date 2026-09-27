import type { Metadata } from "next";
import { privateMetadata } from "@/lib/i18n/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return privateMetadata("payments", "/payments");
}

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
