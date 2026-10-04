"use client";

import { useMemo } from "react";
import NotificationSettings from "@/components/profile/NotificationSettings";
import { createMockApi } from "@/components/profile/notifications/mock-api";

export default function DevNotificationsClient({ failPatch }: { failPatch: boolean }) {
  const api = useMemo(() => createMockApi({ failPatch }), [failPatch]);
  return <NotificationSettings api={api} showOwnBot={false} />;
}
