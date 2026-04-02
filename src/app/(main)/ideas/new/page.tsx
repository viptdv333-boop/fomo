"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import IdeaForm from "@/components/ideas/IdeaForm";

function NewIdeaContent() {
  const searchParams = useSearchParams();
  const instrumentId = searchParams.get("instrumentId") || undefined;
  const channelId = searchParams.get("channelId") || undefined;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">{channelId ? "Публикация в канал" : "Новая идея"}</h1>
      <IdeaForm mode="create" preselectedInstrumentId={instrumentId} channelId={channelId} />
    </div>
  );
}

export default function NewIdeaPage() {
  return (
    <Suspense fallback={<div className="text-center py-8">Загрузка...</div>}>
      <NewIdeaContent />
    </Suspense>
  );
}
