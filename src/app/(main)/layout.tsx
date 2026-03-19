import SessionProvider from "@/components/layout/SessionProvider";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <Header />
        <main className="max-w-7xl w-full mx-auto px-4 py-3 flex-1 min-h-0 flex flex-col overflow-y-auto">{children}</main>
        <Footer />
      </div>
    </SessionProvider>
  );
}
