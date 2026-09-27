import { assetMetadata } from "@/lib/i18n/asset-metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return assetMetadata("instrument", slug);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
