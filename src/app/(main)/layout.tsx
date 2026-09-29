import SessionProvider from "@/components/layout/SessionProvider";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PwaBanners from "@/components/layout/PwaBanners";
import { getHiddenPages } from "@/lib/hidden-pages";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hiddenPages = await getHiddenPages();
  return (
    <SessionProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <Header initialHiddenPages={hiddenPages} />
        <PwaBanners />
        <main className="max-w-7xl w-full mx-auto px-4 py-3 flex-1 min-h-0 flex flex-col overflow-y-auto">{children}</main>
        <Footer />
      </div>
    </SessionProvider>
  );
}
