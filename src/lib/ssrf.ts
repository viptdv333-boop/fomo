import { isIP } from "node:net";
import dns from "node:dns";

/**
 * SSRF guard for user-supplied outbound URLs (the webhook notification channel).
 * Three layers: (1) the URL itself (https only, no credentials, DNS name only,
 * allowed ports), (2) DNS resolution checked before sending, (3) a connect-time
 * lookup that re-validates the address actually dialled (DNS rebinding).
 * Redirects are never followed — see notify-channels/webhook.ts.
 */

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return null;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local + cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function v4Private(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparsable → treat as unsafe
  return V4_BLOCKS.some(([base, bits]) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  });
}

/** Expands an IPv6 text form to 8 16-bit groups (null if malformed). */
function parseV6(ip: string): number[] | null {
  let s = ip.split("%")[0].toLowerCase();
  // embedded dotted quad (::ffff:1.2.3.4)
  const dot = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dot) {
    const v4 = ipv4ToInt(dot[2]);
    if (v4 === null) return null;
    s = `${dot[1]}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

function v6Private(ip: string): boolean {
  const g = parseV6(ip);
  if (!g) return true;
  const allZero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (allZero(0, 8)) return true; // ::
  if (allZero(0, 7) && g[7] === 1) return true; // ::1
  // IPv4-mapped / compatible / NAT64 → judge by the embedded v4 address
  const embedded = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  if (allZero(0, 5) && (g[5] === 0xffff || g[5] === 0)) return v4Private(embedded());
  if (g[0] === 0x64 && g[1] === 0xff9b && allZero(2, 6)) return v4Private(embedded());
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0100 && allZero(1, 4)) return true; // discard prefix
  return false;
}

/** True for loopback / private / link-local / reserved / multicast addresses. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return v4Private(ip);
  if (v === 6) return v6Private(ip);
  return true;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

const ALLOWED_PORTS = new Set(["", "443", "8443"]);
const BAD_SUFFIXES = [".local", ".localhost", ".internal", ".localdomain", ".lan", ".home", ".corp", ".intranet"];

/** Static part of the check — no DNS. */
export function validateOutboundUrl(raw: string): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "https_only" };
  if (u.username || u.password) return { ok: false, reason: "credentials_in_url" };
  if (!ALLOWED_PORTS.has(u.port)) return { ok: false, reason: "port_not_allowed" };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "invalid_url" };
  if (host.startsWith("[") || isIP(host) !== 0 || /^[\d.]+$/.test(host) || /^0x/i.test(host)) {
    return { ok: false, reason: "ip_literal_not_allowed" };
  }
  if (host === "localhost" || BAD_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".")) {
    return { ok: false, reason: "private_host" };
  }
  if (u.href.length > 2000) return { ok: false, reason: "too_long" };
  return { ok: true, url: u };
}

export type LookupAll = (host: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupAll = (host) => dns.promises.lookup(host, { all: true, verbatim: true });

/** Resolves the host and refuses if ANY returned address is non-public. */
export async function assertResolvesPublic(host: string, lookup: LookupAll = defaultLookup): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const addrs = await lookup(host);
    if (!addrs.length) return { ok: false, reason: "dns_failed" };
    if (addrs.some((a) => isPrivateIp(a.address))) return { ok: false, reason: "resolves_to_private_address" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "dns_failed" };
  }
}

/** net.connect-compatible lookup that rejects non-public addresses at dial time. */
export function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return callback(err, "", 0);
    const list = addrs as dns.LookupAddress[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) {
      const e: NodeJS.ErrnoException = new Error("blocked_private_address");
      e.code = "EBLOCKED";
      return callback(e, "", 0);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}
