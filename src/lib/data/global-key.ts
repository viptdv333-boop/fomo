import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mirrorUserData } from "@/lib/account-mirror-client";
import { isTerminalSite } from "@/lib/site-mode";

function master(): Buffer | null {
  const s = process.env.ACCOUNT_MIRROR_SECRET?.trim();
  return s && s.length >= 32 ? scryptSync(s, "fomo-global-provider-v1", 32) : null;
}
export function sealGlobalKey(value: string): string | null {
  const key = master(); if (!key) return null;
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((x) => x.toString("base64url")).join(".");
}
function openGlobalKey(value: string): string | null {
  try { const key = master(); if (!key) return null; const [iv, tag, body] = value.split(".").map((x) => Buffer.from(x, "base64url")); const d = createDecipheriv("aes-256-gcm", key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(body), d.final()]).toString("utf8"); } catch { return null; }
}
export async function globalProviderKey(provider: string): Promise<string | null> {
  const row = await prisma.terminalUserData.findFirst({ where: { kind: "global_provider_key", key: provider, user: { role: "OWNER" } }, select: { data: true, updatedAt: true, userId: true, user: { select: { email: true } } }, orderBy: { updatedAt: "desc" } });
  const data = row?.data as { encrypted?: string; enabled?: boolean } | undefined;
  if (row && !isTerminalSite() && Date.now() - (lastMirror.get(provider) ?? 0) > 60_000) {
    lastMirror.set(provider, Date.now());
    mirrorUserData(row.userId, row.user.email, "global_provider_key", provider, { at: row.updatedAt.getTime(), data: row.data });
  }
  return data?.enabled && typeof data.encrypted === "string" ? openGlobalKey(data.encrypted) : null;
}
const lastMirror = new Map<string, number>();
