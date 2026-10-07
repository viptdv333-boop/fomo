import SessionProvider from "@/components/layout/SessionProvider";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import TerminalHeader from "@/components/layout/TerminalHeader";
import TerminalFooter from "@/components/layout/TerminalFooter";
import { isTerminalSite } from "@/lib/site-mode";
import PwaBanners from "@/components/layout/PwaBanners";
import NativePushRegistrar from "@/components/layout/NativePushRegistrar";
import { getHiddenPages } from "@/lib/hidden-pages";
import AppHeader from "@/components/app/AppHeader";
import AppTabBar from "@/components/app/AppTabBar";
import "@/components/app/app.css";
import "@/components/app/app-desktop.css";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // terminal.fomo.spot: its own header / footer; the main site below is unchanged
  const terminal = isTerminalSite();
  const hiddenPages = terminal ? [] : await getHiddenPages();
  return (
    <SessionProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        {terminal ? <TerminalHeader /> : <Header initialHiddenPages={hiddenPages} />}
        <AppHeader />
        <PwaBanners />
        <NativePushRegistrar />
        <main className="max-w-7xl w-full mx-auto px-4 py-3 flex-1 min-h-0 flex flex-col overflow-y-auto">{children}</main>
        {terminal ? <TerminalFooter /> : <Footer />}
      </div>
      <AppTabBar />
    </SessionProvider>
  );
}
