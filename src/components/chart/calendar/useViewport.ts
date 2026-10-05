"use client";

import { useEffect, useState } from "react";

/** The width below which the calendar is laid out for a phone (the same breakpoint as Tailwind's `sm`). */
export const PHONE_QUERY = "(max-width: 639px)";

/** Right now, synchronously (false on the server). Use it for things mounted after a tap, never during the first render. */
export const isPhoneNow = (): boolean => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches;

/** True on a touch-first device (no hover, a coarse pointer): the keyboard must not pop up by itself there. */
export const isTouchNow = (): boolean => typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;

/** A phone-width viewport; `null` until mounted so the server markup and the first client render agree. */
export function useIsPhone(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}
