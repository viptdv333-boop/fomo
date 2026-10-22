import { NextResponse } from "next/server";
import { tariffErrorKey, type TariffError } from "@/lib/tariff-validation";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** 4xx/5xx with a localized `error` text plus `field` / `code`, so the editor can show it next to the offending input. */
export function tariffFail(e: TariffError, t: Translate, status = 400) {
  return NextResponse.json({ error: t(tariffErrorKey(e.code), e.vars), field: e.field, code: e.code }, { status });
}

/**
 * One log line for an unexpected DB error: name, Prisma code, constraint target and the first line of the
 * message. Never the full message — Prisma appends the query arguments (card number, YuKassa secret).
 */
export function logTariffError(op: string, e: unknown) {
  const err = e as { name?: string; code?: string; message?: string; meta?: { target?: unknown } };
  const first = String(err?.message ?? e).split("\n").find((l) => l.trim()) ?? "";
  const target = err?.meta?.target ? ` target=${JSON.stringify(err.meta.target)}` : "";
  console.error(`[tariffs] ${op} failed: ${err?.name ?? "Error"}${err?.code ? ` ${err.code}` : ""}${target} ${first.slice(0, 160)}`);
}
