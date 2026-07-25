import type { Metadata } from "next";

// Auth-gated area with no search value. Google crawled /messages logged out,
// saw the same shell as every other route and filed it as "duplicate, canonical
// not selected" — noindex is what drops it from the report for good.
export const metadata: Metadata = {
  title: "Сообщения",
  robots: { index: false, follow: false },
};

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
