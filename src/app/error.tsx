"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";
import { reloadOnceForChunkError } from "@/lib/chunk-reload";
import { forceUpdate } from "@/lib/force-update";

// Route-level crash (the site layout is still alive). Chunk errors after a deploy heal by themselves.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();

  useEffect(() => {
    reloadOnceForChunkError(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <h1 className="text-xl font-semibold dark:text-gray-100">{t("common.error.title")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">{t("common.error.body")}</p>
      <div className="flex gap-2">
        <button onClick={() => reset()} className="px-4 py-2 rounded-lg border dark:border-gray-700 text-sm dark:text-gray-200">
          {t("common.error.retry")}
        </button>
        <button onClick={() => forceUpdate()} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700">
          {t("common.error.reload")}
        </button>
      </div>
    </div>
  );
}
