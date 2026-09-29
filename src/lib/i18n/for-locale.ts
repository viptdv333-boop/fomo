import { translate } from "./dictionaries";
import { isLocale, type Locale } from "./locale-url";

/** Translator for a fixed locale — e.g. a notification in the recipient's language. No next/* imports, safe in server.ts. */
export function tFor(locale: string | null | undefined) {
  const l: Locale = isLocale(locale) ? locale : "ru";
  return (key: string, vars?: Record<string, string | number>) => translate(l, key, vars);
}
