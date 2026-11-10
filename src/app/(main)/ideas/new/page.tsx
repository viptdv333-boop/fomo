"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import IdeaForm from "@/components/ideas/IdeaForm";
import { useT } from "@/lib/i18n/client";

function NewIdeaContent() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const instrumentId = searchParams.get("instrumentId") || undefined;
  const channelId = searchParams.get("channelId") || undefined;

  return (
    <div className="max-w-3xl w-full mx-auto">
      {/* leave the draft: back to the channel the post was started from (or one step back) */}
      {channelId ? (
        <Link href={`/channels/${channelId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 mb-3">
          <span aria-hidden>←</span> {t("common.back")}
        </Link>
      ) : (
        <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 mb-3">
          <span aria-hidden>←</span> {t("common.back")}
        </button>
      )}
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">{channelId ? t("idea.channelPost") : t("idea.newTitle")}</h1>
      <IdeaForm mode="create" preselectedInstrumentId={instrumentId} channelId={channelId} />
    </div>
  );
}

export default function NewIdeaPage() {
  return (
    <Suspense fallback={<div className="text-center py-8">...</div>}>
      <NewIdeaContent />
    </Suspense>
  );
}
