import type { Metadata } from "next";
import { privateMetadata } from "@/lib/i18n/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return privateMetadata("subscriptions", "/subscriptions");
}

export default function SubscriptionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
