import { categoryMetadata } from "@/lib/i18n/asset-metadata";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return categoryMetadata(slug);
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
