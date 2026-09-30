import { TIME_ZONES, localZone } from "@/lib/chart/settings";
import { zoneOffsetLabel } from "@/lib/chart/format";

/** Human name of a tz setting ("auto", "exchange", "local", "UTC" or an IANA zone). */
export function tzLabel(id: string, t: (key: string) => string, locale: string): string {
  if (id === "auto") return t("cs.tz.auto");
  if (id === "exchange") return t("cs.tz.exchange");
  if (id === "local") return `${t("cs.tz.local")} (${zoneOffsetLabel(localZone())})`;
  if (id === "UTC") return "UTC";
  const known = TIME_ZONES.find((z) => z.id === id);
  let name = id.split("/").pop()?.replace(/_/g, " ") ?? id;
  if (known && locale === "ru") name = known.label;
  return `${name} (${zoneOffsetLabel(id)})`;
}
