"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  // TEMPORARY: allow all sections without auth for testing/preview
  return <>{children}</>;
}
