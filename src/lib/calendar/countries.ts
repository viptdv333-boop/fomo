/* Countries of the calendar: the picker list, presets and display names. */

/** Countries the calendar usually has data for (the picker also adds any other code the data contains). */
export const COUNTRY_CODES = [
  "US", "EU", "GB", "DE", "FR", "IT", "ES", "JP", "CN", "RU", "CA", "AU", "NZ", "CH", "IN", "BR", "MX", "KR", "TR", "ZA",
  "SE", "NO", "DK", "PL", "CZ", "HU", "HK", "SG", "ID", "SA", "AR", "IL", "TH", "NL", "AT", "BE", "IE", "PT", "GR", "FI",
  "UA", "KZ", "EG", "NG", "CL", "CO", "PE", "TW", "SK", "RO", "CY", "LT", "LV", "EE", "SI", "HR", "BG", "IS", "LU", "MT",
] as const;

export const G7 = ["US", "GB", "DE", "FR", "IT", "CA", "JP", "EU"] as const;
export const G20 = ["US", "CN", "JP", "DE", "IN", "GB", "FR", "IT", "BR", "CA", "RU", "KR", "AU", "MX", "ID", "TR", "SA", "AR", "ZA", "EU"] as const;

export const COUNTRY_PRESETS = {
  g7: G7,
  g20: G20,
} as const;

const displayCache = new Map<string, Intl.DisplayNames | null>();

/** Localised country name (EU is handled by the dictionary: the euro area, not the union). */
export function countryName(code: string, locale: string, t?: (k: string) => string): string {
  if (!code) return "—";
  if (code === "EU" && t) {
    const v = t("ec.c.EU");
    if (v !== "ec.c.EU") return v;
  }
  let dn = displayCache.get(locale);
  if (dn === undefined) {
    try {
      dn = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      dn = null;
    }
    displayCache.set(locale, dn);
  }
  try {
    return dn?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Site locale id (ru / en / cn) -> BCP-47 tag for Intl. */
export function intlLocale(locale: string): string {
  return locale === "cn" ? "zh-CN" : locale === "en" ? "en-US" : "ru-RU";
}
