"use client";

import { createContext, useContext } from "react";
import type { Locale } from "@/lib/i18n/locale-url";
import type { ProfileScreen } from "@/lib/app-profile";

/** The profile of the signed-in user as /api/users/<id> returns it (what the hero card and the edit screen show). */
export interface MeData {
  id: string;
  displayName: string;
  fomoId: string | null;
  bio: string | null;
  avatarUrl: string | null;
  rating: number | string;
  subscriptionPrice: number | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  city: string | null;
  workplace: string | null;
  exchangeExperience: string | null;
  specializations: string[];
  dmEnabled: boolean;
  paymentCard: string | null;
  donationCard: string | null;
  sbpQrUrl: string | null;
  socialLinks: Record<string, string> | null;
  education: { id: string; university: string; faculty: string | null; specialty: string | null; yearEnd: number | null }[];
  followerCount?: number;
  ideaCount?: number;
}

export interface SessionUserLite {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  fomoId?: string | null;
  role?: string | null;
}

export interface ProfCtx {
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
  user: SessionUserLite | undefined;
  /** the profile record (null until loaded / for a guest) */
  me: MeData | null;
  reloadMe: () => Promise<void>;
  /** the session carries the display name / fomoId: refresh it after an edit */
  refreshSession: () => Promise<void>;
  screen: ProfileScreen;
  /** open a screen pushed from the list (a history entry: Android Back returns) */
  go: (screen: ProfileScreen) => void;
  /** «Назад»: one history step when the screen was pushed from the list, otherwise straight to the list */
  back: () => void;
  /** open another page of the site (a normal navigation) */
  open: (path: string) => void;
  flash: (m: string) => void;
}

export const ProfContext = createContext<ProfCtx | null>(null);

export function useProf(): ProfCtx {
  const c = useContext(ProfContext);
  if (!c) throw new Error("useProf outside AppProfile");
  return c;
}
