"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PaymentsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/profile?tab=finance");
  }, [router]);

  return (
    <div className="text-gray-400 dark:text-gray-500 text-center py-12">
      Перенаправление в раздел Финансы...
    </div>
  );
}
