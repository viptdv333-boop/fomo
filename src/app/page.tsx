import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "https://fomo.spot/" },
  openGraph: { url: "https://fomo.spot/" },
};

export default async function HomePage() {
  const session = await auth();

  // Logged-in users go straight to feed
  if (session?.user) {
    redirect("/feed");
  }

  return <LandingPage />;
}
