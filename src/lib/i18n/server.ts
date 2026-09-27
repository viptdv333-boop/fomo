import { cookies } from "next/headers";
import { DICTIONARIES, translate } from "./dictionaries";

// For Server Components: same keys and fallback rules as useT() on the client.
export async function getT() {
  const saved = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = saved && DICTIONARIES[saved] ? saved : "ru";
  return { locale, t: (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars) };
}
