/**
 * Which T-Invest token / ALGOPACK key the MOEX data code of THIS request uses. A route that serves MOEX data runs its work inside
 * `runWithMoexKeys` (see moex-access.ts): inside, `tinkoffToken()` / `algopackKey()` give the keys of that requester only (empty = none, the
 * requester gets the delayed public ISS feed). Outside of any request (scripts, checks, background jobs of the server itself) they read the
 * server's own environment variables, as before. No Next / DB imports: the data layers import this and stay usable from tsx scripts.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export interface MoexKeys {
  tinkoff: string;
  algopack: string;
}

const als = new AsyncLocalStorage<MoexKeys>();

export const runWithMoexKeys = <T>(keys: MoexKeys, fn: () => T): T => als.run(keys, fn);

/** the keys of the current request, undefined outside of one */
export const moexKeysOfRequest = (): MoexKeys | undefined => als.getStore();

export function tinkoffToken(): string {
  const k = als.getStore();
  return k ? k.tinkoff : (process.env.TINKOFF_TOKEN ?? "").trim();
}

export function algopackKey(): string {
  const k = als.getStore();
  return k ? k.algopack : (process.env.ALGOPACK_KEY ?? "").trim();
}

/** a short stable id of a secret for per-key caches and cool-downs (never the secret itself) */
export function keyId(secret: string): string {
  return secret ? createHash("sha256").update(secret).digest("hex").slice(0, 12) : "none";
}
