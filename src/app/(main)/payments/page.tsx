"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

export default function PaymentsPage() {
  const router = useRouter();
  const { t } = useT();

  useEffect(() => {
    router.replace("/profile?tab=finance");
  }, [router]);

  return (
    <div className="text-gray-400 dark:text-gray-500 text-center py-12">
      {t("pay.redirectFinance")}
    </div>
  );
}
