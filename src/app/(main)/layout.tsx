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
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      <Footer />
    </SessionProvider>
  );
}
