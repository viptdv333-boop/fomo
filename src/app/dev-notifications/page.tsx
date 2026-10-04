import { notFound } from "next/navigation";
import DevNotificationsClient from "./Client";

// Dev-only preview of the notification settings UI against an in-memory mock API
// (no database needed). 404 in production builds.
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ fail?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <DevNotificationsClient failPatch={sp.fail === "1"} />
    </div>
  );
}
