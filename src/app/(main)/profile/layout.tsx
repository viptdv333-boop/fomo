import type { Metadata } from "next";

// Own-account pages. Public author pages live under /authors/{fomoId} and are
// the ones that belong in the index. See the note in src/app/robots.txt/route.ts
// on why these are noindex rather than robots.txt-blocked.
export const metadata: Metadata = {
  title: "Профиль",
  robots: { index: false, follow: false },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
