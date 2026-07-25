import type { Metadata } from "next";

// Sign-in / sign-up screens carry no search value. noindex rather than a
// robots.txt block so Google can actually read the directive and drop the URLs
// it already discovered — see src/app/robots.txt/route.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-3 sm:px-4">
      <div className="w-full max-w-sm sm:max-w-md">{children}</div>
    </div>
  );
}
